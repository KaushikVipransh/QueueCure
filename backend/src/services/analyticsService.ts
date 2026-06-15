import { AppointmentType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  AnalyticsData,
  HourlyDataPoint,
  TypeDistributionPoint,
  DurationTrendPoint,
  APPOINTMENT_TYPE_LABELS,
} from '../types';

export class AnalyticsService {
  async getAnalytics(): Promise<AnalyticsData> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // Patients served today
    const patientsServedToday = await prisma.patient.count({
      where: {
        status: 'completed',
        updatedAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    // Average consultation duration (actual)
    const completedConsultations = await prisma.consultation.findMany({
      where: {
        endTime: { not: null },
        actualDuration: { not: null },
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const avgConsultationMinutes =
      completedConsultations.length > 0
        ? completedConsultations.reduce((sum, c) => sum + (c.actualDuration ?? 0), 0) /
          completedConsultations.length
        : 0;

    // Average wait time (time from patient creation to consultation start)
    const consultationsWithStart = await prisma.consultation.findMany({
      where: {
        startTime: { not: null },
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      include: { patient: true },
    });

    const avgWaitTimeMinutes =
      consultationsWithStart.length > 0
        ? consultationsWithStart.reduce((sum, c) => {
            const waitMs =
              new Date(c.startTime!).getTime() - new Date(c.patient.createdAt).getTime();
            return sum + waitMs / 60000;
          }, 0) / consultationsWithStart.length
        : 0;

    // Most common appointment type
    const typeCounts = await prisma.patient.groupBy({
      by: ['appointmentType'],
      where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      _count: { appointmentType: true },
      orderBy: { _count: { appointmentType: 'desc' } },
    });

    const mostCommonType =
      typeCounts.length > 0 ? APPOINTMENT_TYPE_LABELS[typeCounts[0].appointmentType] : null;

    // Queue utilization rate: served / (served + waiting + in_consultation)
    const totalToday = await prisma.patient.count({
      where: { createdAt: { gte: startOfDay, lte: endOfDay } },
    });

    const queueUtilizationRate =
      totalToday > 0 ? Math.round((patientsServedToday / totalToday) * 100) : 0;

    // Hourly patient data (last 12 hours)
    const hourlyData: HourlyDataPoint[] = [];
    for (let h = 0; h < 12; h++) {
      const hourStart = new Date(now);
      hourStart.setHours(now.getHours() - (11 - h), 0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourStart.getHours() + 1);

      const count = await prisma.patient.count({
        where: { createdAt: { gte: hourStart, lt: hourEnd } },
      });

      const label = hourStart.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      hourlyData.push({ hour: label, count });
    }

    // Type distribution
    const typeDistribution: TypeDistributionPoint[] = typeCounts.map((t) => ({
      type: t.appointmentType,
      count: t._count.appointmentType,
      label: APPOINTMENT_TYPE_LABELS[t.appointmentType],
    }));

    // Duration trend (last 10 completed consultations)
    const recentConsultations = await prisma.consultation.findMany({
      where: { endTime: { not: null }, actualDuration: { not: null } },
      orderBy: { endTime: 'desc' },
      take: 10,
      include: { patient: true },
    });

    const durationTrend: DurationTrendPoint[] = recentConsultations.reverse().map((c, i) => ({
      label: `#${i + 1} ${APPOINTMENT_TYPE_LABELS[c.appointmentType as AppointmentType]}`,
      actual: Math.round((c.actualDuration ?? 0) * 10) / 10,
      predicted: Math.round(c.predictedDuration * 10) / 10,
    }));

    return {
      patientsServedToday,
      avgWaitTimeMinutes: Math.round(avgWaitTimeMinutes * 10) / 10,
      avgConsultationMinutes: Math.round(avgConsultationMinutes * 10) / 10,
      mostCommonType,
      queueUtilizationRate,
      hourlyData,
      typeDistribution,
      durationTrend,
    };
  }

  async getPredictionMetrics() {
    return prisma.predictionMetrics.findMany({
      orderBy: { appointmentType: 'asc' },
    });
  }
}

export const analyticsService = new AnalyticsService();
