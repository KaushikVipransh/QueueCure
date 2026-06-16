'use client';

import clsx from 'clsx';
import { PatientStatus, AppointmentType, STATUS_LABELS, APPOINTMENT_TYPE_LABELS } from '@/lib/types';

interface StatusBadgeProps {
  status: PatientStatus;
  className?: string;
}

const STATUS_STYLES: Record<PatientStatus, { bg: string; color: string; dot: string }> = {
  waiting:         { bg: '#fef6e4', color: '#c47c0a', dot: '#f59e0b' },
  in_consultation: { bg: '#e8f0f8', color: '#1A3D63', dot: '#4A7FA7' },
  completed:       { bg: '#e6f7f2', color: '#0f9b6e', dot: '#0f9b6e' },
  cancelled:       { bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
        status === 'in_consultation' && 'blink',
        className,
      )}
      style={{ background: s.bg, color: s.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {STATUS_LABELS[status]}
    </span>
  );
}

interface AppointmentBadgeProps {
  type: AppointmentType;
  className?: string;
}

const APPT_STYLES: Record<AppointmentType, { bg: string; color: string }> = {
  follow_up:   { bg: '#e8f0f8', color: '#1A3D63' },
  general:     { bg: '#EEF4FA', color: '#4A7FA7' },
  new_patient: { bg: '#e6f7f2', color: '#0f9b6e' },
  specialist:  { bg: '#fef6e4', color: '#c47c0a' },
};

export function AppointmentBadge({ type, className }: AppointmentBadgeProps) {
  const s = APPT_STYLES[type];
  return (
    <span
      className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', className)}
      style={{ background: s.bg, color: s.color }}
    >
      {APPOINTMENT_TYPE_LABELS[type]}
    </span>
  );
}
