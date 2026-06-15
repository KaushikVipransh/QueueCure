import { AppointmentType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { hybridEstimator, EstimationResult } from './hybridEstimator';
import { APPOINTMENT_TYPE_BASELINES } from '../types';

/**
 * PredictionService — thin orchestration layer over HybridEstimator.
 *
 * Responsibilities:
 *   - Expose simple methods consumed by queueService/routes
 *   - Update PredictionMetrics (legacy analytics table) after completions
 *   - Keep the API surface identical so callers need zero changes
 *
 * The HybridEstimator does the actual math; this service handles
 * DB coordination, backward-compat, and queue context assembly.
 */
export class PredictionService {
  /**
   * Returns the single "likely" estimate for one appointment type.
   * Used when adding a patient (to set predictedDuration on the Consultation row).
   *
   * For full range + confidence, use getEstimationResult() instead.
   */
  async getPredictedDuration(appointmentType: AppointmentType): Promise<number> {
    // Single-patient scenario: tokensAhead=0, no queue context yet
    const result = await hybridEstimator.compute(
      appointmentType,
      0,
      [],           // no patients ahead when computing per-patient baseline
      null,         // no current consultation context
      null,
    );
    return result.likely;
  }

  /**
   * Full estimation result (range + confidence) for a specific waiting patient.
   *
   * @param patientVisitType  — the patient we're estimating for
   * @param tokensAhead       — their position in queue (0 = next)
   * @param queueAheadTypes   — ordered visit types of all patients ahead
   * @param currentVisitType  — type of the patient currently being seen
   * @param currentStartTime  — when the current consultation started
   */
  async getEstimationResult(
    patientVisitType: AppointmentType,
    tokensAhead: number,
    queueAheadTypes: AppointmentType[],
    currentVisitType: AppointmentType | null,
    currentStartTime: Date | null,
  ): Promise<EstimationResult> {
    return hybridEstimator.compute(
      patientVisitType,
      tokensAhead,
      queueAheadTypes,
      currentVisitType,
      currentStartTime,
    );
  }

  /**
   * Calculates wait times for ALL waiting patients in one efficient pass.
   * Returns a map of patientId → estimated wait in minutes (the "likely" value).
   *
   * Also returns full EstimationResult per patient for richer UI rendering.
   */
  async calculateAllWaitTimes(
    waitingPatients: Array<{ id: string; appointmentType: AppointmentType }>,
  ): Promise<{
    waitMap: Record<string, number>;
    estimationMap: Record<string, EstimationResult>;
  }> {
    const waitMap:       Record<string, number>          = {};
    const estimationMap: Record<string, EstimationResult> = {};

    // Determine current patient context (shared across all computations)
    const currentPatient = await prisma.patient.findFirst({
      where: { status: 'in_consultation' },
      include: { consultation: true },
    });

    const currentVisitType = currentPatient?.appointmentType ?? null;
    const currentStartTime = currentPatient?.consultation?.startTime
      ? new Date(currentPatient.consultation.startTime)
      : null;

    // Compute estimation for each patient — they share the DB fetch via hybridEstimator
    for (let i = 0; i < waitingPatients.length; i++) {
      const patient       = waitingPatients[i]!;
      const patientsAhead = waitingPatients.slice(0, i).map((p) => p.appointmentType);

      const result = await hybridEstimator.compute(
        patient.appointmentType,
        i,                 // tokensAhead = position in queue
        patientsAhead,
        currentVisitType,
        currentStartTime,
      );

      waitMap[patient.id]       = result.likely;
      estimationMap[patient.id] = result;
    }

    return { waitMap, estimationMap };
  }

  /**
   * Updates PredictionMetrics (legacy analytics table) after a consultation
   * completes. Also winsorizes the duration before recording.
   *
   * Kept for backward compatibility with AnalyticsService.
   */
  async updateMetrics(appointmentType: AppointmentType, actualDuration: number): Promise<void> {
    // Winsorize to prevent outlier poisoning
    const capped = await hybridEstimator.winsorize(actualDuration, appointmentType);

    const existing = await prisma.predictionMetrics.findUnique({
      where: { appointmentType },
    });

    if (!existing) {
      await prisma.predictionMetrics.create({
        data: {
          appointmentType,
          historicalAverage: capped,
          recentAverage:     capped,
          sampleCount:       1,
        },
      });
      return;
    }

    const newSampleCount = existing.sampleCount + 1;

    // Cumulative mean for historical (long-term signal)
    const newHistoricalAverage =
      (existing.historicalAverage * existing.sampleCount + capped) / newSampleCount;

    // EMA α=0.3 for recent average (weights recent data more)
    const alpha = 0.3;
    const newRecentAverage = alpha * capped + (1 - alpha) * existing.recentAverage;

    await prisma.predictionMetrics.update({
      where: { appointmentType },
      data: {
        historicalAverage: newHistoricalAverage,
        recentAverage:     newRecentAverage,
        sampleCount:       newSampleCount,
      },
    });
  }

  /**
   * Returns elapsed / predicted / remaining for the current consultation.
   * Used by QueueStats for the dashboard progress indicator.
   */
  async getCurrentConsultationProgress(): Promise<{
    elapsed: number;
    predicted: number;
    remaining: number;
  }> {
    const current = await prisma.patient.findFirst({
      where: { status: 'in_consultation' },
      include: { consultation: true },
    });

    if (!current?.consultation?.startTime) {
      return { elapsed: 0, predicted: 0, remaining: 0 };
    }

    const elapsed =
      (Date.now() - new Date(current.consultation.startTime).getTime()) / 60000;
    const predicted  = current.consultation.predictedDuration;
    const remaining  = Math.max(0, predicted - elapsed);

    return { elapsed, predicted, remaining };
  }
}

export const predictionService = new PredictionService();
