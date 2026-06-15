import { QueueState, Patient, AnalyticsData, PredictionMetric } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? `API error ${res.status}`);
  }

  return res.json();
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export async function getQueueStatus(): Promise<QueueState> {
  return apiFetch<QueueState>('/api/v1/queue/status');
}

export async function callNext(): Promise<{ success: boolean; queueState: QueueState }> {
  return apiFetch('/api/v1/queue/call-next', { method: 'POST' });
}

export async function completeConsultation(): Promise<{ success: boolean; queueState: QueueState }> {
  return apiFetch('/api/v1/queue/complete', { method: 'POST' });
}

// ─── Patients ─────────────────────────────────────────────────────────────────

export async function addPatient(patientName: string, appointmentType: string) {
  return apiFetch<{ success: boolean; patient: Patient }>('/api/v1/patients', {
    method: 'POST',
    body: JSON.stringify({ patientName, appointmentType }),
  });
}

export async function removePatient(id: string) {
  return apiFetch<{ success: boolean }>(`/api/v1/patients/${id}`, { method: 'DELETE' });
}

export async function getPatientByToken(tokenNumber: number): Promise<{
  patient: Patient;
  estimatedWaitMinutes: number;
  queueState: QueueState;
}> {
  return apiFetch(`/api/v1/patients/token/${tokenNumber}`);
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalytics(): Promise<AnalyticsData> {
  return apiFetch<AnalyticsData>('/api/v1/analytics');
}

export async function getPredictionMetrics(): Promise<{ metrics: PredictionMetric[] }> {
  return apiFetch('/api/v1/analytics/prediction-metrics');
}
