'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronRight, Clock, Stethoscope } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { callNext, completeConsultation } from '@/lib/api';
import { PatientWithPrediction, APPOINTMENT_TYPE_LABELS } from '@/lib/types';
import { StatusBadge, AppointmentBadge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface CurrentPatientProps {
  currentPatient: PatientWithPrediction | null;
  hasWaiting: boolean;
  elapsed: number;
  predicted: number;
}

export function CurrentPatient({ currentPatient, hasWaiting, elapsed, predicted }: CurrentPatientProps) {
  const [callingNext, setCallingNext] = useState(false);
  const [completing, setCompleting] = useState(false);

  const handleCallNext = async () => {
    setCallingNext(true);
    try {
      const result = await callNext();
      toast.success(
        `🔔 Token ${result.queueState.currentPatient?.tokenNumber} — ${result.queueState.currentPatient?.patientName} called!`,
        { duration: 5000 },
      );
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to call next patient.');
    } finally {
      setCallingNext(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await completeConsultation();
      toast.success('✅ Consultation completed!', { duration: 4000 });
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to mark consultation complete.');
    } finally {
      setCompleting(false);
    }
  };

  const progressPct = predicted > 0 ? Math.min(100, (elapsed / predicted) * 100) : 0;

  return (
    <div className="glass-card p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center">
            <Stethoscope className="text-brand-400" size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Now Serving</h2>
            <p className="text-xs text-slate-500">Current consultation</p>
          </div>
        </div>
        {currentPatient && (
          <StatusBadge status="in_consultation" />
        )}
      </div>

      {/* Current Patient Card */}
      {currentPatient ? (
        <div className="rounded-xl bg-brand-500/5 border border-brand-500/20 p-4 flex flex-col gap-3">
          {/* Token + Name */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 glow-brand">
                <span className="text-white font-black text-lg font-mono">
                  {currentPatient.tokenNumber}
                </span>
              </div>
              <div>
                <p className="font-semibold text-slate-100">{currentPatient.patientName}</p>
                <AppointmentBadge type={currentPatient.appointmentType as any} />
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {predicted > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {Math.round(elapsed)} min elapsed
                </span>
                <span>{Math.round(predicted)} min predicted</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-400 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-1000"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Complete Button */}
          <button
            id="complete-consultation-btn"
            onClick={handleComplete}
            disabled={completing}
            className="btn-success w-full mt-1"
          >
            {completing ? (
              <>
                <LoadingSpinner size="sm" />
                Completing...
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                Mark Consultation Complete
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-surface-500/50 border border-white/[0.05] p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-surface-400 flex items-center justify-center">
            <Stethoscope className="text-slate-500" size={22} />
          </div>
          <p className="text-slate-400 text-sm font-medium">No active consultation</p>
          <p className="text-slate-600 text-xs mt-1">Call the next patient to begin</p>
        </div>
      )}

      {/* Call Next Button */}
      <button
        id="call-next-btn"
        onClick={handleCallNext}
        disabled={callingNext || !!currentPatient || !hasWaiting}
        className={clsx('btn-primary w-full', !!currentPatient && 'opacity-40')}
      >
        {callingNext ? (
          <>
            <LoadingSpinner size="sm" />
            Calling...
          </>
        ) : (
          <>
            <ChevronRight size={16} />
            Call Next Patient
          </>
        )}
      </button>

      {currentPatient && (
        <p className="text-center text-xs text-slate-500">
          Complete the current consultation before calling the next patient.
        </p>
      )}
    </div>
  );
}
