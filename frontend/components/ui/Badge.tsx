'use client';

import clsx from 'clsx';
import { PatientStatus, AppointmentType, STATUS_LABELS, APPOINTMENT_TYPE_LABELS } from '@/lib/types';

interface StatusBadgeProps {
  status: PatientStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const styles: Record<PatientStatus, string> = {
    waiting: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    in_consultation: 'bg-brand-400/10 text-brand-400 border-brand-400/20 blink',
    completed: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    cancelled: 'bg-slate-400/10 text-slate-400 border-slate-400/20',
  };

  const dots: Record<PatientStatus, string> = {
    waiting: 'bg-amber-400',
    in_consultation: 'bg-brand-400',
    completed: 'bg-emerald-400',
    cancelled: 'bg-slate-400',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
        styles[status],
        className,
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full', dots[status])} />
      {STATUS_LABELS[status]}
    </span>
  );
}

interface AppointmentBadgeProps {
  type: AppointmentType;
  className?: string;
}

export function AppointmentBadge({ type, className }: AppointmentBadgeProps) {
  const styles: Record<AppointmentType, string> = {
    follow_up: 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20',
    general: 'bg-violet-400/10 text-violet-400 border-violet-400/20',
    new_patient: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    specialist: 'bg-orange-400/10 text-orange-400 border-orange-400/20',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border',
        styles[type],
        className,
      )}
    >
      {APPOINTMENT_TYPE_LABELS[type]}
    </span>
  );
}
