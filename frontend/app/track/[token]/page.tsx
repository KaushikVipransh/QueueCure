import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPatientByToken } from '@/lib/api';
import { TrackingClient } from '@/components/tracking/TrackingClient';

interface TrackPageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: TrackPageProps): Promise<Metadata> {
  const { token } = await params;
  const tokenNumber = parseInt(token, 10);

  if (isNaN(tokenNumber)) {
    return { title: 'Invalid Token' };
  }

  try {
    const { patient } = await getPatientByToken(tokenNumber);
    return {
      title: `Token ${patient.tokenNumber} — ${patient.patientName}`,
      description: `Track your queue status for ${patient.patientName} at Queue Cure Clinic.`,
    };
  } catch {
    return { title: `Token ${token} — Queue Cure` };
  }
}

export default async function TrackPage({ params }: TrackPageProps) {
  const { token } = await params;
  const tokenNumber = parseInt(token, 10);

  if (isNaN(tokenNumber)) {
    notFound();
  }

  try {
    const { patient, estimatedWaitMinutes, queueState } = await getPatientByToken(tokenNumber);

    return (
      <TrackingClient
        initialPatient={patient}
        initialWaitMinutes={estimatedWaitMinutes}
        initialQueueState={queueState}
      />
    );
  } catch {
    // Patient not found
    notFound();
  }
}
