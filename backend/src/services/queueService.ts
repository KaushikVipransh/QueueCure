import { AppointmentType, PatientStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { predictionService } from './predictionService';
import { QueueState, PatientWithPrediction, QueueStats } from '../types';
import { createError } from '../middleware/errorHandler';

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

// Starting token number
const TOKEN_START = 100;

export class QueueService {
  /**
   * Add a new patient to the queue.
   * Uses a transaction to ensure atomic token number generation.
   */
  async addPatient(
    patientName: string,
    appointmentType: AppointmentType,
  ) {
    const predictedDuration = await predictionService.getPredictedDuration(appointmentType);

    try {
      const patient = await prisma.$transaction(async (tx) => {
        // Atomic: get max token inside transaction to prevent duplicates
        const aggregate = await tx.patient.aggregate({
          _max: { tokenNumber: true },
        });
        const nextToken = (aggregate._max.tokenNumber ?? TOKEN_START) + 1;

        return tx.patient.create({
          data: {
            tokenNumber: nextToken,
            patientName: patientName.trim(),
            appointmentType,
            status: 'waiting',
            consultation: {
              create: {
                appointmentType,
                predictedDuration,
              },
            },
          },
          include: { consultation: true },
        });
      });

      return patient;
    } catch (err: any) {
      // Unique constraint on tokenNumber — retry once
      if (err.code === 'P2002') {
        throw createError('Token conflict — please try again.', 409);
      }
      throw err;
    }
  }

  /**
   * Call the next waiting patient.
   * CONCURRENCY-SAFE: Uses a transaction to prevent two receptionists
   * from calling next simultaneously.
   */
  async callNext() {
    return prisma.$transaction(async (tx) => {
      // Guard: ensure no one is currently in consultation
      const currentlyServing = await tx.patient.findFirst({
        where: { status: 'in_consultation' },
      });

      if (currentlyServing) {
        throw createError(
          'Cannot call next while a consultation is in progress. Please complete the current consultation first.',
          409,
        );
      }

      // Find the next waiting patient (lowest token number)
      const nextPatient = await tx.patient.findFirst({
        where: { status: 'waiting' },
        orderBy: { tokenNumber: 'asc' },
      });

      if (!nextPatient) {
        throw createError('Queue is empty. No patients waiting.', 404);
      }

      // Update patient status to in_consultation
      const updated = await tx.patient.update({
        where: { id: nextPatient.id },
        data: { status: 'in_consultation' },
        include: { consultation: true },
      });

      // Record consultation start time
      if (updated.consultation) {
        await tx.consultation.update({
          where: { id: updated.consultation.id },
          data: { startTime: new Date() },
        });
      }

      // Update the queue settings current token
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
   * Updates prediction metrics with actual duration.
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

    if (currentPatient.consultation?.startTime) {
      actualDuration =
        (endTime.getTime() - new Date(currentPatient.consultation.startTime).getTime()) /
        60000;
    }

    // Update patient and consultation atomically
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
          },
        });
      }

      // Clear current token from settings
      await tx.queueSettings.updateMany({
        data: { currentToken: null },
      });

      return patient;
    });

    // Update prediction metrics outside the transaction (non-critical)
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

    // Calculate wait times for all waiting patients
    const waitTimeMap = await predictionService.calculateAllWaitTimes(
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
      appointmentType: p.appointmentType,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      estimatedWaitMinutes: waitMinutes,
      predictedDuration: p.consultation?.predictedDuration ?? 0,
    });

    let currentPatientFormatted: PatientWithPrediction | null = null;
    if (currentPatient) {
      const remaining = Math.max(0, currentPredicted - currentElapsed);
      currentPatientFormatted = {
        id: currentPatient.id,
        tokenNumber: currentPatient.tokenNumber,
        patientName: currentPatient.patientName,
        appointmentType: currentPatient.appointmentType,
        status: currentPatient.status,
        createdAt: currentPatient.createdAt.toISOString(),
        estimatedWaitMinutes: Math.max(0, Math.ceil(remaining)),
        predictedDuration: currentPredicted,
      };
    }

    return {
      currentPatient: currentPatientFormatted,
      waitingPatients: waitingPatients.map((p) =>
        formatPatient(p, waitTimeMap[p.id] ?? 0),
      ),
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
