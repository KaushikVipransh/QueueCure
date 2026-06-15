'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Users, Stethoscope, CheckCircle2, ArrowLeft, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { useSocketContext, useJoinPatientRoom } from '@/contexts/SocketContext';
import { useCountdown } from '@/hooks/useCountdown';
import {
  Patient,
  QueueState,
  EstimationResult,
  APPOINTMENT_TYPE_LABELS,
  formatCountdown,
} from '@/lib/types';
import { StatusBadge, AppointmentBadge } from '@/components/ui/Badge';

// ─── Confidence Badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence, samples }: { confidence: EstimationResult['confidence']; samples: number }) {
  const config = {
    high:   { dots: 3, color: 'text-emerald-400', label: 'High accuracy' },
    medium: { dots: 2, color: 'text-amber-400',   label: 'Building accuracy' },
    low:    { dots: 1, color: 'text-slate-500',   label: 'Seed estimate' },
  }[confidence];

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={config.color}>
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} className={i < config.dots ? config.color : 'text-slate-700'}>●</span>
        ))}
      </span>
      <span className={config.color}>{config.label}</span>
      <span className="text-slate-700">· {samples} sample{samples !== 1 ? 's' : ''}</span>
    </div>
  );
}

// ─── Wait Range Display ───────────────────────────────────────────────────────

function WaitRangeDisplay({
  estimation,
  status,
}: {
  estimation: EstimationResult;
  status: 'waiting' | 'in_consultation';
}) {
  const accentColor = status === 'in_consultation' ? 'text-brand-400' : 'text-amber-400';
  const bgColor     = status === 'in_consultation' ? 'bg-brand-500/10 border-brand-500/20' : 'bg-amber-500/10 border-amber-500/20';

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Primary range */}
      <div className="text-center">
        <p className="text-xs text-slate-500 mb-1 tracking-widest uppercase">
          {status === 'in_consultation' ? 'Est. remaining' : 'Estimated wait'}
        </p>
        <div className="flex items-baseline gap-1 justify-center">
          <span className={clsx('text-5xl font-black font-mono tabular-nums', accentColor)}>
            {estimation.optimistic}
          </span>
          <span className="text-2xl font-bold text-slate-500">–</span>
          <span className={clsx('text-5xl font-black font-mono tabular-nums', accentColor)}>
            {estimation.likely}
          </span>
          <span className="text-lg text-slate-400 ml-1">min</span>
        </div>
        <p className="text-xs text-slate-600 mt-1">Updates in real-time</p>
      </div>

      {/* Worst case + confidence */}
      <div className={clsx('flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-xl border w-full', bgColor)}>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <TrendingUp size={12} className="text-slate-500" />
          <span>Worst case: <strong className="text-slate-300">{estimation.worstCase} min</strong></span>
        </div>
        <ConfidenceBadge confidence={estimation.confidence} samples={estimation.basedOnSamples} />
      </div>
    </div>
  );
}

// ─── TrackingClient ───────────────────────────────────────────────────────────

interface TrackingClientProps {
  initialPatient: Patient;
  initialWaitMinutes: number;
  initialQueueState: QueueState;
}

export function TrackingClient({
  initialPatient,
  initialWaitMinutes,
  initialQueueState,
}: TrackingClientProps) {
  const { queueState } = useSocketContext();

  useJoinPatientRoom(initialPatient.tokenNumber);

  const liveQueueState = queueState ?? initialQueueState;

  const isCurrentlyServing =
    liveQueueState.currentPatient?.tokenNumber === initialPatient.tokenNumber;

  const waitingPatient = liveQueueState.waitingPatients.find(
    (p) => p.tokenNumber === initialPatient.tokenNumber,
  );

  const isCompleted =
    !isCurrentlyServing &&
    !waitingPatient &&
    liveQueueState.currentPatient?.tokenNumber !== initialPatient.tokenNumber;

  const patientsAhead = waitingPatient
    ? liveQueueState.waitingPatients.findIndex((p) => p.tokenNumber === initialPatient.tokenNumber)
    : 0;

  type LiveStatus = 'waiting' | 'in_consultation' | 'completed';
  let liveStatus: LiveStatus = 'waiting';
  if (isCurrentlyServing) liveStatus = 'in_consultation';
  else if (isCompleted) liveStatus = 'completed';

  // Estimate from the live queue state (includes estimationResult if available)
  const liveEstimation = waitingPatient?.estimationResult ?? null;

  // Fallback single-number estimate for countdown
  let estimatedWait: number;
  if (liveStatus === 'in_consultation') {
    estimatedWait = liveQueueState.stats.currentConsultationPredicted - liveQueueState.stats.currentConsultationElapsed;
    estimatedWait = Math.max(0, estimatedWait);
  } else if (liveStatus === 'waiting') {
    estimatedWait = liveEstimation?.likely ?? waitingPatient?.estimatedWaitMinutes ?? initialWaitMinutes;
  } else {
    estimatedWait = 0;
  }

  const countdown       = useCountdown(estimatedWait);
  const currentServing  = liveQueueState.stats.currentToken;

  return (
    <div className="min-h-screen bg-surface-800 flex flex-col items-center justify-center p-4 py-12">
      {/* Background glow */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div
          className={clsx(
            'w-[600px] h-[600px] rounded-full opacity-[0.06] transition-colors duration-1000',
            liveStatus === 'in_consultation' && 'bg-brand-500',
            liveStatus === 'waiting'         && 'bg-amber-500',
            liveStatus === 'completed'       && 'bg-emerald-500',
          )}
          style={{ filter: 'blur(80px)' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col gap-5">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          Dashboard
        </Link>

        {/* ─── Token Card ─────────────────────────────────────────── */}
        <div
          className={clsx(
            'glass-card p-8 flex flex-col items-center text-center gap-6 transition-all duration-500',
            liveStatus === 'in_consultation' && 'border-brand-500/30 glow-brand',
            liveStatus === 'completed'       && 'border-emerald-500/30 glow-emerald',
          )}
        >
          {/* Status Badge */}
          <StatusBadge status={liveStatus} className="text-sm px-4 py-1.5" />

          {/* Token Number */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-slate-500 tracking-widest uppercase font-medium">Your Token</p>
            <div
              className={clsx(
                'w-36 h-36 rounded-3xl flex items-center justify-center transition-all duration-500',
                liveStatus === 'in_consultation'
                  ? 'bg-gradient-to-br from-brand-500 to-brand-600 glow-brand'
                  : liveStatus === 'completed'
                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 glow-emerald'
                  : 'bg-gradient-to-br from-slate-600 to-slate-700',
              )}
            >
              {liveStatus === 'completed' ? (
                <CheckCircle2 className="text-white" size={52} />
              ) : (
                <span className="text-white font-black text-6xl font-mono leading-none">
                  {initialPatient.tokenNumber}
                </span>
              )}
            </div>
            <p className="text-lg font-semibold text-slate-200">{initialPatient.patientName}</p>
            <AppointmentBadge type={initialPatient.appointmentType as any} />
          </div>

          {/* Status-specific content */}
          {liveStatus === 'completed' ? (
            <div className="text-center animate-fade-in">
              <p className="text-emerald-400 font-bold text-xl">Consultation Complete!</p>
              <p className="text-slate-500 text-sm mt-2">Thank you for your visit. Have a healthy day!</p>
            </div>
          ) : liveStatus === 'in_consultation' ? (
            <div className="text-center animate-fade-in w-full">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Stethoscope className="text-brand-400 blink" size={20} />
                <p className="text-brand-400 font-bold text-lg">You're being seen now!</p>
              </div>
              {estimatedWait > 0 && (
                <>
                  <p className="text-xs text-slate-500 mb-2 tracking-widest uppercase">Est. remaining</p>
                  <p className="text-5xl font-black font-mono text-brand-400 tabular-nums">
                    {countdown.formatted}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5 w-full animate-fade-in">
              {/* Wait range or "you're next" */}
              {estimatedWait > 0 ? (
                liveEstimation ? (
                  <WaitRangeDisplay estimation={liveEstimation} status="waiting" />
                ) : (
                  <div className="text-center">
                    <p className="text-xs text-slate-500 mb-2 tracking-widest uppercase">Estimated wait</p>
                    <p className="text-6xl font-black font-mono text-amber-400 tabular-nums animate-count-down">
                      {countdown.formatted}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">Updates in real-time</p>
                  </div>
                )
              ) : (
                <div className="text-center">
                  <p className="text-amber-400 font-bold text-xl">You're next!</p>
                  <p className="text-slate-500 text-sm mt-1">Please stay near the consultation room</p>
                </div>
              )}

              {/* Divider */}
              <div className="w-full h-px bg-white/[0.06]" />

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 w-full">
                <div className="flex flex-col items-center gap-1 p-4 rounded-xl bg-surface-500/50 border border-white/[0.05]">
                  <Users className="text-slate-500" size={18} />
                  <p className="text-2xl font-black font-mono text-slate-200">{patientsAhead}</p>
                  <p className="text-xs text-slate-500">ahead of you</p>
                </div>
                <div className="flex flex-col items-center gap-1 p-4 rounded-xl bg-surface-500/50 border border-white/[0.05]">
                  <Clock className="text-slate-500" size={18} />
                  <p className="text-2xl font-black font-mono text-slate-200">
                    {currentServing ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">now serving</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live indicator */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
          Live updates — no refresh needed
        </div>
      </div>
    </div>
  );
}
