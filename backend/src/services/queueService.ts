import { AppointmentType, PatientStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { predictionService } from './predictionService';
import { smsService } from './smsService';
import { QueueState, PatientWithPrediction, QueueStats } from '../types';
import { createError } from '../middleware/errorHandler';

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';
const TOKEN_START = 100;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns "morning" | "afternoon" | "evening" for a given hour */
function getTimeOfDay(hour: number): string {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Session ID groups all registrations on the same calendar day.
 * Format: "YYYY-MM-DD" (clinic-scoped once doctorId is added in v2)
 */
function getSessionId(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── QueueService ─────────────────────────────────────────────────────────────

export class QueueService {
  /**
   * Add a new patient to the queue.
   * Records registeredAt + predictedWaitAtRegistration for audit trail.
   */
  async addPatient(
    patientName: string,
    appointmentType: AppointmentType,
    phoneNumber?: string,
  ) {
    const predictedDuration = await predictionService.getPredictedDuration(appointmentType);

    // Estimate wait at registration time so we can compute prediction error later
    const waitingPatientsNow = await prisma.patient.findMany({
      where: { status: 'waiting' },
      orderBy: { tokenNumber: 'asc' },
    });
    const queueAheadTypes = waitingPatientsNow.map((p) => p.appointmentType);

    const currentPatientNow = await prisma.patient.findFirst({
      where: { status: 'in_consultation' },
      include: { consultation: true },
    });

    const registrationEstimate = await predictionService.getEstimationResult(
      appointmentType,
      waitingPatientsNow.length,
      queueAheadTypes,
      currentPatientNow?.appointmentType ?? null,
      currentPatientNow?.consultation?.startTime
        ? new Date(currentPatientNow.consultation.startTime)
        : null,
    );

    try {
      const patient = await prisma.$transaction(async (tx) => {
        const aggregate = await tx.patient.aggregate({
          _max: { tokenNumber: true },
        });
        const nextToken = (aggregate._max.tokenNumber ?? TOKEN_START) + 1;

        return tx.patient.create({
          data: {
            tokenNumber: nextToken,
            patientName: patientName.trim(),
            phoneNumber: phoneNumber?.trim() || null,
            appointmentType,
            status: 'waiting',
            consultation: {
              create: {
                appointmentType,
                predictedDuration,
                sessionId: getSessionId(),
                registeredAt: new Date(),
                predictedWaitAtRegistration: registrationEstimate.likely,
              },
            },
          },
          include: { consultation: true },
        });
      });

      // Fire SMS after transaction commits (non-blocking — never throws)
      if (patient.phoneNumber) {
        const settings = await prisma.queueSettings.findFirst();
        const clinicName = settings?.clinicName ?? 'Queue Cure Clinic';

        smsService.sendTrackingLink({
          to: patient.phoneNumber,
          patientName: patient.patientName,
          tokenNumber: patient.tokenNumber,
          clinicName,
        }).then(async (sent) => {
          if (sent) {
            // Mark smsSent so we have an audit trail
            await prisma.patient.update({
              where: { id: patient.id },
              data: { smsSent: true },
            }).catch(() => { }); // best-effort
          }
        }).catch(() => { }); // never let SMS errors surface
      }

      return patient;
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw createError('Token conflict — please try again.', 409);
      }
      throw err;
    }
  }

  /**
   * Call the next waiting patient.
   * Records calledAt + queue context snapshot for the ConsultationRecord.
   * CONCURRENCY-SAFE: uses a transaction.
   */
  async callNext() {
    return prisma.$transaction(async (tx) => {
      // Guard: no double-calling
      const currentlyServing = await tx.patient.findFirst({
        where: { status: 'in_consultation' },
      });

      if (currentlyServing) {
        throw createError(
          'Cannot call next while a consultation is in progress. Please complete the current consultation first.',
          409,
        );
      }

      const nextPatient = await tx.patient.findFirst({
        where: { status: 'waiting' },
        orderBy: { tokenNumber: 'asc' },
      });

      if (!nextPatient) {
        throw createError('Queue is empty. No patients waiting.', 404);
      }

      // Count waiting patients at call time (for queue context snapshot)
      const queueDepthAtCall = await tx.patient.count({
        where: { status: 'waiting' },
      });

      const now = new Date();
      const hour = now.getHours();
      const calledAt = now;

      const updated = await tx.patient.update({
        where: { id: nextPatient.id },
        data: { status: 'in_consultation' },
        include: { consultation: true },
      });

      if (updated.consultation) {
        const registeredAt = updated.consultation.registeredAt ?? updated.consultation.createdAt;
        const actualWaitMinutes =
          (calledAt.getTime() - new Date(registeredAt).getTime()) / 60000;

        await tx.consultation.update({
          where: { id: updated.consultation.id },
          data: {
            startTime: calledAt,   // startTime ≈ calledAt (no separate entry room tracking yet)
            calledAt,
            queueDepthAtCall,
            timeOfDay: getTimeOfDay(hour),
            dayOfWeek: now.getDay(),
            actualWaitMinutes,
            transitionGapMinutes: 0,    // updated on completeConsultation when endTime known
          },
        });
      }

      await tx.queueSettings.upsert({
        where: { id: SETTINGS_ID },
        update: { currentToken: nextPatient.tokenNumber },
        create: {
          id: SETTINGS_ID,
          currentToken: nextPatient.tokenNumber,
          clinicName: 'Queue Cure Clinic',
        },
      });

      return updated;
    });
  }

  /**
   * Mark current consultation as complete.
   * Finalises all ConsultationRecord fields and feeds data into PredictionMetrics.
   */
  async completeConsultation() {
    const currentPatient = await prisma.patient.findFirst({
      where: { status: 'in_consultation' },
      include: { consultation: true },
    });

    if (!currentPatient) {
      throw createError('No patient is currently in consultation.', 404);
    }

    const endTime = new Date();
    let actualDuration: number | null = null;
    let transitionGapMinutes: number = 0;
    let predictionError: number | null = null;

    if (currentPatient.consultation?.startTime) {
      actualDuration =
        (endTime.getTime() - new Date(currentPatient.consultation.startTime).getTime()) / 60000;
    }

    if (
      currentPatient.consultation?.calledAt &&
      currentPatient.consultation?.startTime
    ) {
      transitionGapMinutes =
        (new Date(currentPatient.consultation.startTime).getTime() -
          new Date(currentPatient.consultation.calledAt).getTime()) / 60000;
    }

    if (
      actualDuration !== null &&
      currentPatient.consultation?.actualWaitMinutes != null &&
      currentPatient.consultation?.predictedWaitAtRegistration != null
    ) {
      // Prediction error = how far off we were vs what we told the patient
      predictionError =
        currentPatient.consultation.actualWaitMinutes -
        currentPatient.consultation.predictedWaitAtRegistration;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.update({
        where: { id: currentPatient.id },
        data: { status: 'completed' },
        include: { consultation: true },
      });

      if (currentPatient.consultation) {
        await tx.consultation.update({
          where: { id: currentPatient.consultation.id },
          data: {
            endTime,
            actualDuration,
            transitionGapMinutes,
            predictionError,
          },
        });
      }

      await tx.queueSettings.updateMany({
        data: { currentToken: null },
      });

      return patient;
    });

    // Update prediction metrics (non-critical, outside transaction)
    if (actualDuration !== null) {
      await predictionService.updateMetrics(currentPatient.appointmentType, actualDuration);
    }

    return updated;
  }

  /**
   * Remove a patient from the queue (cancel).
   */
  async removePatient(patientId: string) {
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });

    if (!patient) {
      throw createError('Patient not found.', 404);
    }

    if (patient.status === 'in_consultation') {
      throw createError(
        'Cannot remove a patient who is currently in consultation.',
        409,
      );
    }

    return prisma.patient.update({
      where: { id: patientId },
      data: { status: 'cancelled' },
    });
  }

  /**
   * Get comprehensive queue state for broadcasting to all clients.
   * Now includes EstimationResult (range + confidence) per waiting patient.
   */
  async getQueueState(): Promise<QueueState> {
    const [settings, currentPatient, waitingPatients, todayStats] = await Promise.all([
      prisma.queueSettings.findFirst(),
      prisma.patient.findFirst({
        where: { status: 'in_consultation' },
        include: { consultation: true },
      }),
      prisma.patient.findMany({
        where: { status: 'waiting' },
        orderBy: { tokenNumber: 'asc' },
        include: { consultation: true },
      }),
      this.getTodayStats(),
    ]);

    // Compute per-patient wait time AND full estimation result in one pass
    const { waitMap, estimationMap } = await predictionService.calculateAllWaitTimes(
      waitingPatients.map((p) => ({ id: p.id, appointmentType: p.appointmentType })),
    );

    // Current consultation progress
    let currentElapsed = 0;
    let currentPredicted = 0;
    if (currentPatient?.consultation?.startTime) {
      currentElapsed =
        (Date.now() - new Date(currentPatient.consultation.startTime).getTime()) / 60000;
      currentPredicted = currentPatient.consultation.predictedDuration;
    }

    const stats: QueueStats = {
      currentToken: settings?.currentToken ?? null,
      totalWaiting: waitingPatients.length,
      avgConsultationDuration: todayStats.avgDuration,
      patientsServedToday: todayStats.servedToday,
      queueEfficiency: todayStats.efficiency,
      currentConsultationElapsed: Math.round(currentElapsed * 10) / 10,
      currentConsultationPredicted: currentPredicted,
    };

    const formatPatient = (
      p: typeof waitingPatients[0],
      waitMinutes: number,
    ): PatientWithPrediction => ({
      id: p.id,
      tokenNumber: p.tokenNumber,
      patientName: p.patientName,
      phoneNumber: p.phoneNumber,
      appointmentType: p.appointmentType,
      status: p.status,
      smsSent: p.smsSent,
      createdAt: p.createdAt.toISOString(),
      estimatedWaitMinutes: waitMinutes,
      predictedDuration: p.consultation?.predictedDuration ?? 0,
      estimationResult: estimationMap[p.id] ?? null,
    });

    let currentPatientFormatted: PatientWithPrediction | null = null;
    if (currentPatient) {
      const remaining = Math.max(0, currentPredicted - currentElapsed);
      currentPatientFormatted = {
        id: currentPatient.id,
        tokenNumber: currentPatient.tokenNumber,
        patientName: currentPatient.patientName,
        phoneNumber: currentPatient.phoneNumber,
        appointmentType: currentPatient.appointmentType,
        status: currentPatient.status,
        smsSent: currentPatient.smsSent,
        createdAt: currentPatient.createdAt.toISOString(),
        estimatedWaitMinutes: Math.max(0, Math.ceil(remaining)),
        predictedDuration: currentPredicted,
        estimationResult: null,
      };
    }

    return {
      currentPatient: currentPatientFormatted,
      waitingPatients: waitingPatients.map((p) => formatPatient(p, waitMap[p.id] ?? 0)),
      stats,
      clinicName: settings?.clinicName ?? 'Queue Cure Clinic',
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get patient by token number.
   */
  async getPatientByToken(tokenNumber: number) {
    return prisma.patient.findUnique({
      where: { tokenNumber },
      include: { consultation: true },
    });
  }

  /**
   * Get all patients (for dashboard initial load).
   */
  async getAllPatients(status?: PatientStatus) {
    return prisma.patient.findMany({
      where: status ? { status } : undefined,
      orderBy: { tokenNumber: 'asc' },
      include: { consultation: true },
    });
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async getTodayStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [servedToday, completedConsultations, totalToday] = await Promise.all([
      prisma.patient.count({
        where: { status: 'completed', updatedAt: { gte: startOfDay } },
      }),
      prisma.consultation.findMany({
        where: { actualDuration: { not: null }, createdAt: { gte: startOfDay } },
      }),
      prisma.patient.count({
        where: { createdAt: { gte: startOfDay } },
      }),
    ]);

    const avgDuration =
      completedConsultations.length > 0
        ? completedConsultations.reduce((sum, c) => sum + (c.actualDuration ?? 0), 0) /
        completedConsultations.length
        : 0;

    const efficiency =
      totalToday > 0 ? Math.round((servedToday / totalToday) * 100) : 0;

    return { servedToday, avgDuration: Math.round(avgDuration * 10) / 10, efficiency };
  }
}

export const queueService = new QueueService();
