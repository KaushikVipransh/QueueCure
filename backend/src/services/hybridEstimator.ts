import { AppointmentType } from '@prisma/client';
import { prisma } from '../lib/prisma';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VisitTypeWeight = Record<AppointmentType, number>;
export type Confidence = 'low' | 'medium' | 'high';

export interface EstimationResult {
  optimistic: number;    // p50-scaled lower bound
  likely: number;        // mid estimate × psych buffer — show this to patients
  worstCase: number;     // p90-scaled upper bound × psych buffer
  tokensAhead: number;
  confidence: Confidence;
  basedOnSamples: number;
}

export interface ConsultationDataPoint {
  visitType: AppointmentType;
  actualConsultMinutes: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Per-type baseline consultation durations (receptionist seed time).
 * Matches APPOINTMENT_TYPE_BASELINES in types/index.ts.
 */
const SEED_TIMES: VisitTypeWeight = {
  follow_up:   8,
  general:     15,
  new_patient: 25,
  specialist:  35,
};

/**
 * Classification weights — how much longer each type typically runs
 * relative to a baseline 'general' patient (weight 1.0).
 */
const DEFAULT_WEIGHTS: VisitTypeWeight = {
  follow_up:   0.6,
  general:     1.0,
  new_patient: 1.3,
  specialist:  1.8,
};

/** Minutes assumed for patient → room transition gap */
const TRANSITION_GAP_MINUTES = 1.5;

/** Rolling window sizes */
const ROLLING_WINDOW   = 10;
const PERCENTILE_WINDOW = 20;

/** Slight upward bias to underpromise & overdeliver */
const PSYCH_BUFFER = 1.08;

// ─── HybridEstimator ─────────────────────────────────────────────────────────

/**
 * 7-layer wait-time estimator designed for iterative improvement.
 *
 * Layers (each independently removable):
 *   1. Seed time          — Day-0 fallback, no data required
 *   2. Rolling average    — Per-type, cold-start blends seed → real data
 *   3. Percentile range   — p50/p75/p90 for honest uncertainty bounds
 *   4. Classification     — Per-patient visit-type weight
 *   5. Elapsed correction — Real-time remaining for current consultation
 *   6. Psych buffer       — Patient trust via slight upward bias
 *   7. Audit log          — Silent ML training signal, accumulates every call
 *
 * Stateless across restarts: all history is read from DB on each compute().
 * ML upgrade path: replace getRollingAverage() with a model.predict() call;
 * everything downstream is identical.
 */
export class HybridEstimator {
  private weights: VisitTypeWeight;

  constructor(weights?: Partial<VisitTypeWeight>) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  // ── LAYER 1 + 2: Rolling average with cold-start blend ───────────────────

  /**
   * Returns the blended consultation duration estimate for a given visit type.
   * - Starts as 100% seed time (no data)
   * - Linearly transitions to 100% rolling average by ROLLING_WINDOW samples
   * - Falls back to broader pool if per-type samples < 3
   */
  async getRollingAverage(
    visitType: AppointmentType,
    records?: ConsultationDataPoint[],
  ): Promise<number> {
    const pool = records ?? (await this.fetchRecentRecords());
    const seed = SEED_TIMES[visitType];

    const typed = pool
      .filter((r) => r.visitType === visitType)
      .slice(-ROLLING_WINDOW)
      .map((r) => r.actualConsultMinutes);

    // Cold-start: not enough per-type samples → use broader pool
    const effective =
      typed.length >= 3
        ? typed
        : pool.slice(-ROLLING_WINDOW).map((r) => r.actualConsultMinutes);

    if (effective.length === 0) return seed;

    const rollingAvg =
      effective.reduce((a, b) => a + b, 0) / effective.length;

    // Blend: 1.0 → 0.0 seed weight as samples accumulate
    const seedWeight = Math.max(0, 1 - effective.length / ROLLING_WINDOW);
    return seedWeight * seed + (1 - seedWeight) * rollingAvg;
  }

  // ── LAYER 3: Percentile range ─────────────────────────────────────────────

  /**
   * Returns p50/p75/p90 of actual consultation durations for a visit type.
   * Falls back to symmetric range around seed when < 5 samples.
   */
  async getPercentiles(
    visitType: AppointmentType,
    records?: ConsultationDataPoint[],
  ): Promise<{ p50: number; p75: number; p90: number }> {
    const pool = records ?? (await this.fetchRecentRecords());

    const typed = pool
      .filter((r) => r.visitType === visitType)
      .slice(-PERCENTILE_WINDOW)
      .map((r) => r.actualConsultMinutes)
      .sort((a, b) => a - b);

    if (typed.length < 5) {
      // Symmetric range centred on seed × weight
      const base = SEED_TIMES[visitType] * this.weights[visitType];
      return { p50: base * 0.8, p75: base, p90: base * 1.4 };
    }

    const percentile = (arr: number[], p: number) => {
      const idx = Math.floor(arr.length * p);
      return arr[Math.min(idx, arr.length - 1)]!;
    };

    return {
      p50: percentile(typed, 0.5),
      p75: percentile(typed, 0.75),
      p90: percentile(typed, 0.9),
    };
  }

  // ── LAYER 4: Classification weight ───────────────────────────────────────

  /**
   * Scales a base duration by the visit-type classification weight.
   * Missing type defaults to 1.0 (neutral).
   */
  getClassifiedEstimate(baseMinutes: number, visitType: AppointmentType): number {
    return baseMinutes * (this.weights[visitType] ?? 1.0);
  }

  // ── LAYER 5: Elapsed correction ───────────────────────────────────────────

  /**
   * Returns estimated remaining time for the patient currently in consultation.
   * Returns 0 if no consultation is active.
   */
  async getRemainingForCurrentPatient(
    currentVisitType: AppointmentType | null,
    currentStartTime: Date | null,
    records?: ConsultationDataPoint[],
  ): Promise<number> {
    if (!currentStartTime || !currentVisitType) return 0;

    const elapsed = (Date.now() - currentStartTime.getTime()) / 60000;
    const expected = await this.getRollingAverage(currentVisitType, records);
    return Math.max(0, expected - elapsed);
  }

  // ── MAIN COMPUTE ─────────────────────────────────────────────────────────

  /**
   * Computes the full estimation result for a patient.
   *
   * @param patientVisitType    — the patient we're estimating for
   * @param tokensAhead         — how many patients are ahead in queue
   * @param queueVisitTypes     — ordered list of visit types for patients ahead
   * @param currentVisitType    — visit type of patient currently in consultation
   * @param currentStartTime    — when current consultation started
   */
  async compute(
    patientVisitType: AppointmentType,
    tokensAhead: number,
    queueVisitTypes: AppointmentType[],
    currentVisitType: AppointmentType | null,
    currentStartTime: Date | null,
  ): Promise<EstimationResult> {
    // Fetch records once, share across all sub-calls (avoid N+1 queries)
    const records = await this.fetchRecentRecords();

    const [remaining, percentiles] = await Promise.all([
      this.getRemainingForCurrentPatient(currentVisitType, currentStartTime, records),
      this.getPercentiles(patientVisitType, records),
    ]);

    // Sum per-patient estimates for everyone ahead (LAYER 4 applied per patient)
    let queueTime = 0;
    for (const type of queueVisitTypes) {
      const base = await this.getRollingAverage(type, records);
      const classified = this.getClassifiedEstimate(base, type);
      queueTime += classified + TRANSITION_GAP_MINUTES;
    }

    // Derive low/high scale from percentile ratios
    const scale =
      percentiles.p75 > 0
        ? {
            low:  percentiles.p50 / percentiles.p75,
            high: percentiles.p90 / percentiles.p75,
          }
        : { low: 0.8, high: 1.4 };

    const midEstimate  = remaining + queueTime;
    const lowEstimate  = remaining + queueTime * scale.low;
    const highEstimate = remaining + queueTime * scale.high;

    const dataPoints = records.length;

    const result: EstimationResult = {
      optimistic:    Math.max(1, Math.ceil(lowEstimate)),
      likely:        Math.max(1, Math.ceil(midEstimate  * PSYCH_BUFFER)),
      worstCase:     Math.max(1, Math.ceil(highEstimate * PSYCH_BUFFER)),
      tokensAhead,
      confidence:
        dataPoints >= 10 ? 'high' :
        dataPoints >= 3  ? 'medium' : 'low',
      basedOnSamples: dataPoints,
    };

    // LAYER 7: log every prediction (fire-and-forget, non-blocking)
    this.logPrediction(patientVisitType, tokensAhead, result, records.length).catch(
      () => { /* non-critical — never crash on audit failure */ },
    );

    return result;
  }

  // ── DATA COLLECTION ───────────────────────────────────────────────────────

  /**
   * Records a completed consultation.
   * Applies winsorization: caps outliers at 3× median to prevent model poisoning.
   * Returns the capped value so callers can store it.
   */
  async winsorize(
    actualMinutes: number,
    visitType: AppointmentType,
    records?: ConsultationDataPoint[],
  ): Promise<number> {
    const pool = records ?? (await this.fetchRecentRecords());
    const { p50 } = await this.getPercentiles(visitType, pool);
    if (p50 <= 0) return actualMinutes;
    const cap = p50 * 3;
    return Math.min(actualMinutes, cap);
  }

  // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

  /**
   * Fetches recent completed consultations from DB for use in estimations.
   * Only fetches completed records with actual durations (data we trust).
   */
  private async fetchRecentRecords(): Promise<ConsultationDataPoint[]> {
    const rows = await prisma.consultation.findMany({
      where: { actualDuration: { not: null } },
      orderBy: { endTime: 'desc' },
      take: PERCENTILE_WINDOW * 2, // fetch enough for both rolling + percentile windows
      select: { appointmentType: true, actualDuration: true },
    });

    return rows
      .filter((r) => r.actualDuration !== null)
      .map((r) => ({
        visitType:            r.appointmentType,
        actualConsultMinutes: r.actualDuration!,
      }))
      .reverse(); // chronological order (oldest first)
  }

  /**
   * LAYER 7: Writes a full prediction audit record to DB.
   * This is the ML training signal: features → label (actualWait filled later).
   */
  private async logPrediction(
    visitType: AppointmentType,
    tokensAhead: number,
    result: EstimationResult,
    dataPoints: number,
  ): Promise<void> {
    const now = new Date();
    const rollingAvg = await this.getRollingAverage(visitType);

    await prisma.predictionAuditLog.create({
      data: {
        visitType,
        tokensAhead,
        timeOfDay:           now.getHours(),
        dayOfWeek:           now.getDay(),
        dataPointsAvailable: dataPoints,
        rollingAvg,
        predictedOptimistic: result.optimistic,
        predictedLikely:     result.likely,
        predictedWorstCase:  result.worstCase,
        confidence:          result.confidence,
        // actualWait is null until the patient completes — backfilled by queueService
      },
    });
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const hybridEstimator = new HybridEstimator();
