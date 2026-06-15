import { AppointmentType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APPOINTMENT_TYPE_BASELINES } from '../types';

/**
 * Smart Adaptive Wait-Time Prediction Engine
 *
 * Uses a 6-step algorithm:
 * 1. Baseline defaults per appointment type
 * 2. Track actual consultation durations
 * 3. Maintain per-type rolling averages
 * 4. Weighted formula: 70% recent + 30% historical
 * 5. Context-based modifiers (peak hours, queue length, doctor speed)
 * 6. Current consultation remaining time
 */
export class PredictionService {
  /**
   * Step 4: Get predicted duration for a given appointment type
   * Formula: 0.7 * recent_avg + 0.3 * historical_avg
   */
  async getPredictedDuration(appointmentType: AppointmentType): Promise<number> {
    const metrics = await prisma.predictionMetrics.findUnique({
      where: { appointmentType },
    });

    const baseline = APPOINTMENT_TYPE_BASELINES[appointmentType];

    // Not enough samples yet → use baseline
    if (!metrics || metrics.sampleCount < 3) {
      return baseline;
    }

    // Step 4: weighted blend
    const weighted = 0.7 * metrics.recentAverage + 0.3 * metrics.historicalAverage;

    // Step 5: apply context modifier
    const modifier = await this.getContextModifier();

    return Math.max(1, weighted * modifier);
  }

  /**
   * Step 5: Context-based modifier
   * - Peak hours (9-11 AM, 4-6 PM): +10%
   * - Long queue (>8 patients): +5%
   * - Doctor running fast (recent actual/predicted < 0.9): -10%
   */
  async getContextModifier(): Promise<number> {
    let modifier = 1.0;
    const hour = new Date().getHours();

    // Peak clinic hours
    if ((hour >= 9 && hour <= 11) || (hour >= 16 && hour <= 18)) {
      modifier *= 1.1;
    }

    // Long queue pressure
    const waitingCount = await prisma.patient.count({
      where: { status: 'waiting' },
    });
    if (waitingCount > 8) {
      modifier *= 1.05;
    }

    // Doctor speed factor: check last 5 completed consultations
    const recentConsultations = await prisma.consultation.findMany({
      where: { endTime: { not: null }, actualDuration: { not: null } },
      orderBy: { endTime: 'desc' },
      take: 5,
    });

    if (recentConsultations.length >= 3) {
      const ratios = recentConsultations.map(
        (c) => c.actualDuration! / c.predictedDuration,
      );
      const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      if (avgRatio < 0.9) {
        modifier *= 0.9; // Doctor is consistently faster than predicted
      } else if (avgRatio > 1.15) {
        modifier *= 1.1; // Doctor is consistently slower than predicted
      }
    }

    return modifier;
  }

  /**
   * Step 6 + Final Formula:
   * Total wait = remaining_current_consultation + Σ predicted(patients ahead)
   */
  async calculateWaitTime(patientId: string, waitingPatients: Array<{ id: string; appointmentType: AppointmentType }>): Promise<number> {
    const patientIndex = waitingPatients.findIndex((p) => p.id === patientId);
    if (patientIndex === -1) return 0;

    let totalWait = 0;

    // Remaining time of current consultation (step 6)
    const currentPatient = await prisma.patient.findFirst({
      where: { status: 'in_consultation' },
      include: { consultation: true },
    });

    if (currentPatient?.consultation?.startTime) {
      const elapsedMinutes =
        (Date.now() - new Date(currentPatient.consultation.startTime).getTime()) / 60000;
      const remaining = Math.max(
        0,
        currentPatient.consultation.predictedDuration - elapsedMinutes,
      );
      totalWait += remaining;
    }

    // Sum predicted durations of all patients ahead in queue
    for (let i = 0; i < patientIndex; i++) {
      const predicted = await this.getPredictedDuration(waitingPatients[i].appointmentType);
      totalWait += predicted;
    }

    return Math.max(0, Math.ceil(totalWait));
  }

  /**
   * Calculate wait times for ALL waiting patients in one call (efficient)
   */
  async calculateAllWaitTimes(
    waitingPatients: Array<{ id: string; appointmentType: AppointmentType }>,
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};

    const currentPatient = await prisma.patient.findFirst({
      where: { status: 'in_consultation' },
      include: { consultation: true },
    });

    let remainingCurrentMinutes = 0;
    if (currentPatient?.consultation?.startTime) {
      const elapsedMinutes =
        (Date.now() - new Date(currentPatient.consultation.startTime).getTime()) / 60000;
      remainingCurrentMinutes = Math.max(
        0,
        currentPatient.consultation.predictedDuration - elapsedMinutes,
      );
    }

    // Pre-fetch all predicted durations
    const predictedDurations: number[] = [];
    for (const patient of waitingPatients) {
      const dur = await this.getPredictedDuration(patient.appointmentType);
      predictedDurations.push(dur);
    }

    let cumulativeWait = remainingCurrentMinutes;
    for (let i = 0; i < waitingPatients.length; i++) {
      result[waitingPatients[i].id] = Math.max(0, Math.ceil(cumulativeWait));
      cumulativeWait += predictedDurations[i];
    }

    return result;
  }

  /**
   * Step 3: Update prediction metrics after a consultation completes.
   * Uses exponential moving average (EMA) for recent, cumulative mean for historical.
   */
  async updateMetrics(appointmentType: AppointmentType, actualDuration: number): Promise<void> {
    const existing = await prisma.predictionMetrics.findUnique({
      where: { appointmentType },
    });

    if (!existing) {
      await prisma.predictionMetrics.create({
        data: {
          appointmentType,
          historicalAverage: actualDuration,
          recentAverage: actualDuration,
          sampleCount: 1,
        },
      });
      return;
    }

    const newSampleCount = existing.sampleCount + 1;

    // Cumulative mean for historical average
    const newHistoricalAverage =
      (existing.historicalAverage * existing.sampleCount + actualDuration) / newSampleCount;

    // EMA with alpha=0.3 for recent average (recent data weighted more)
    const alpha = 0.3;
    const newRecentAverage = alpha * actualDuration + (1 - alpha) * existing.recentAverage;

    await prisma.predictionMetrics.update({
      where: { appointmentType },
      data: {
        historicalAverage: newHistoricalAverage,
        recentAverage: newRecentAverage,
        sampleCount: newSampleCount,
      },
    });
  }

  /**
   * Get current consultation's elapsed time in minutes
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
    const predicted = current.consultation.predictedDuration;
    const remaining = Math.max(0, predicted - elapsed);

    return { elapsed, predicted, remaining };
  }
}

export const predictionService = new PredictionService();
