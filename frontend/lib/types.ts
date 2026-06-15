// ─── Shared Types (Frontend ↔ Backend) ───────────────────────────────────────

export type AppointmentType = 'follow_up' | 'general' | 'new_patient' | 'specialist';
export type PatientStatus = 'waiting' | 'in_consultation' | 'completed' | 'cancelled';

export interface Patient {
  id: string;
  tokenNumber: number;
  patientName: string;
  appointmentType: AppointmentType;
  status: PatientStatus;
  createdAt: string;
  consultation?: Consultation | null;
}

export interface Consultation {
  id: string;
  patientId: string;
  appointmentType: AppointmentType;
  startTime: string | null;
  endTime: string | null;
  actualDuration: number | null;
  predictedDuration: number;
  createdAt: string;
}

export interface EstimationResult {
  optimistic: number;    // lower bound (p50-scaled)
  likely: number;        // primary estimate shown to patient (with psych buffer)
  worstCase: number;     // upper bound (p90-scaled with psych buffer)
  tokensAhead: number;
  confidence: 'low' | 'medium' | 'high';
  basedOnSamples: number;
}

export interface PatientWithPrediction {
  id: string;
  tokenNumber: number;
  patientName: string;
  appointmentType: AppointmentType;
  status: PatientStatus;
  createdAt: string;
  estimatedWaitMinutes: number;
  predictedDuration: number;
  estimationResult?: EstimationResult | null;
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
  hourlyData: { hour: string; count: number }[];
  typeDistribution: { type: string; count: number; label: string }[];
  durationTrend: { label: string; actual: number; predicted: number }[];
}

export interface PredictionMetric {
  id: string;
  appointmentType: AppointmentType;
  historicalAverage: number;
  recentAverage: number;
  sampleCount: number;
  updatedAt: string;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  follow_up: 'Follow-up',
  general: 'General',
  new_patient: 'New Patient',
  specialist: 'Specialist',
};

export const APPOINTMENT_TYPE_COLORS: Record<AppointmentType, string> = {
  follow_up: '#22d3ee',    // cyan
  general: '#a78bfa',      // purple
  new_patient: '#34d399',  // emerald
  specialist: '#fb923c',   // orange
};

export const STATUS_LABELS: Record<PatientStatus, string> = {
  waiting: 'Waiting',
  in_consultation: 'In Consultation',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function formatWaitTime(minutes: number): string {
  if (minutes <= 0) return 'Now';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
