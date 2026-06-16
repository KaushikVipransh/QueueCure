'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronRight, Clock, User } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { callNext, completeConsultation } from '@/lib/api';
import { PatientWithPrediction } from '@/lib/types';
import { AppointmentBadge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface CurrentPatientProps {
  currentPatient: PatientWithPrediction | null;
  hasWaiting: boolean;
  elapsed: number;
  predicted: number;
}

export function CurrentPatient({ currentPatient, hasWaiting, elapsed, predicted }: CurrentPatientProps) {
  const [callingNext, setCallingNext] = useState(false);
  const [completing, setCompleting]   = useState(false);

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
    <div className="card p-5 flex flex-col gap-4">
      {/* Section label */}
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#88A9C0' }}>
        Now Serving
      </p>

      {currentPatient ? (
        <>
          {/* Patient row */}
          <div className="flex items-center gap-4">
            {/* Avatar circle */}
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #4A7FA7, #0A1931)' }}
            >
              <User size={22} className="text-white" />
            </div>

            {/* Name + type */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base leading-tight" style={{ color: '#0A1931' }}>
                {currentPatient.patientName}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono" style={{ color: '#88A9C0' }}>
                  Token {currentPatient.tokenNumber}
                </span>
                <span style={{ color: '#D4E4F0' }}>·</span>
                <AppointmentBadge type={currentPatient.appointmentType as any} />
              </div>
            </div>

            {/* Time stats */}
            <div className="flex items-center gap-5 flex-shrink-0 text-right">
              <div>
                <p className="text-lg font-black font-mono" style={{ color: '#0A1931' }}>{Math.round(elapsed)}min</p>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#88A9C0' }}>Elapsed</p>
              </div>
              <div>
                <p className="text-lg font-black font-mono" style={{ color: '#0A1931' }}>{Math.round(predicted)}min</p>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#88A9C0' }}>Predicted</p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {predicted > 0 && (
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#EEF4FA' }}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #4A7FA7 0%, #1A3D63 100%)',
                }}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              id="complete-consultation-btn"
              onClick={handleComplete}
              disabled={completing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm text-white transition-all duration-150 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #4A7FA7, #1A3D63)' }}
            >
              {completing
                ? <><LoadingSpinner size="sm" /> Completing...</>
                : <><CheckCircle2 size={15} /> Mark Consult Complete</>}
            </button>

            <button
              id="call-next-btn"
              onClick={handleCallNext}
              disabled={callingNext || !!currentPatient || !hasWaiting}
              className={clsx(
                'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all duration-150',
                !!currentPatient ? 'opacity-40 cursor-not-allowed' : '',
              )}
              style={{
                background: 'transparent',
                border: '1.5px solid #D4E4F0',
                color: '#1A3D63',
              }}
            >
              {callingNext
                ? <><LoadingSpinner size="sm" /> Calling...</>
                : <><ChevronRight size={15} /> Call Next Patient</>}
            </button>
          </div>

          {currentPatient && (
            <p className="text-center text-xs" style={{ color: '#88A9C0' }}>
              Complete the current consultation before calling next
            </p>
          )}
        </>
      ) : (
        <>
          {/* Empty state */}
          <div
            className="rounded-2xl p-7 flex flex-col items-center text-center"
            style={{ background: '#EEF4FA', border: '1.5px dashed #B3CFE5' }}
          >
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: '#D4E4F0' }}
            >
              <User size={20} style={{ color: '#88A9C0' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: '#1A3D63' }}>No active consultation</p>
            <p className="text-xs mt-1" style={{ color: '#88A9C0' }}>Call the next patient to begin</p>
          </div>

          <button
            id="call-next-btn"
            onClick={handleCallNext}
            disabled={callingNext || !hasWaiting}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm text-white transition-all duration-150 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #4A7FA7, #1A3D63)' }}
          >
            {callingNext
              ? <><LoadingSpinner size="sm" /> Calling...</>
              : <><ChevronRight size={15} /> Call Next Patient</>}
          </button>
        </>
      )}
    </div>
  );
}
