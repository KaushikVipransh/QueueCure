import { AppointmentType, Patient, Consultation } from '@prisma/client';
import { EstimationResult } from '../services/hybridEstimator';
export type { EstimationResult } from '../services/hybridEstimator';

// ─── Shared response shapes ───────────────────────────────────────────────────

export interface PatientWithConsultation extends Patient {
  consultation: Consultation | null;
}

export interface PatientWithPrediction {
  id: string;
  tokenNumber: number;
  patientName: string;
  appointmentType: string;
  status: string;
  createdAt: string;
  estimatedWaitMinutes: number;
  predictedDuration: number;
  estimationResult?: EstimationResult | null;
}

/** Full ConsultationRecord shape — mirrors the DB schema exactly */
export interface ConsultationRecord {
  sessionId: string;
  tokenNumber: number;
  visitType: AppointmentType;
  chiefComplaint: string | null;
  patientAgeGroup: string | null;
  registeredAt: Date;
  calledAt: Date;
  consultationStarted: Date | null;
  consultationEnded: Date | null;
  actualWaitMinutes: number;
  actualConsultMinutes: number;
  transitionGapMinutes: number;
  queueDepthAtCall: number;
  timeOfDay: string;
  dayOfWeek: number;
  predictedWaitAtRegistration: number;
  predictionError: number;
}

export interface QueueStats {
  currentToken: number | null;
  totalWaiting: number;
  avgConsultationDuration: number;
  patientsServedToday: number;
  queueEfficiency: number;
  currentConsultationElapsed: number;
  currentConsultationPredicted: number;
}

export interface QueueState {
  currentPatient: PatientWithPrediction | null;
  waitingPatients: PatientWithPrediction[];
  stats: QueueStats;
  clinicName: string;
  updatedAt: string;
}

export interface AnalyticsData {
  patientsServedToday: number;
  avgWaitTimeMinutes: number;
  avgConsultationMinutes: number;
  mostCommonType: string | null;
  queueUtilizationRate: number;
  hourlyData: HourlyDataPoint[];
  typeDistribution: TypeDistributionPoint[];
  durationTrend: DurationTrendPoint[];
}

export interface HourlyDataPoint {
  hour: string;
  count: number;
}

export interface TypeDistributionPoint {
  type: string;
  count: number;
  label: string;
}

export interface DurationTrendPoint {
  label: string;
  actual: number;
  predicted: number;
}

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  follow_up: 'Follow-up',
  general: 'General',
  new_patient: 'New Patient',
  specialist: 'Specialist',
};

export const APPOINTMENT_TYPE_BASELINES: Record<AppointmentType, number> = {
  follow_up: 8,
  general: 15,
  new_patient: 25,
  specialist: 35,
};
