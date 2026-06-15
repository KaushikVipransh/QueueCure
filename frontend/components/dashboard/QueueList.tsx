'use client';

import { useState } from 'react';
import { Trash2, Clock, Users, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { removePatient } from '@/lib/api';
import { PatientWithPrediction, APPOINTMENT_TYPE_LABELS, formatWaitTime } from '@/lib/types';
import { AppointmentBadge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface QueueListProps {
  patients: PatientWithPrediction[];
}

export function QueueList({ patients }: QueueListProps) {
  const [removing, setRemoving] = useState<string | null>(null);

  const handleRemove = async (patient: PatientWithPrediction) => {
    if (!confirm(`Remove ${patient.patientName} (Token ${patient.tokenNumber}) from queue?`)) return;
    setRemoving(patient.id);
    try {
      await removePatient(patient.id);
      toast.success(`Removed ${patient.patientName} from queue.`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to remove patient.');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="glass-card p-6 flex flex-col gap-4 min-h-[300px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Users className="text-amber-400" size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Waiting Queue</h2>
            <p className="text-xs text-slate-500">
              {patients.length > 0
                ? `${patients.length} patient${patients.length !== 1 ? 's' : ''} waiting`
                : 'Queue is empty'}
            </p>
          </div>
        </div>
        {patients.length > 0 && (
          <span className="token-badge">{patients.length}</span>
        )}
      </div>

      {/* Patient List */}
      {patients.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
          <div className="w-14 h-14 mb-4 rounded-2xl bg-surface-500 flex items-center justify-center">
            <Users className="text-slate-600" size={26} />
          </div>
          <p className="text-slate-400 font-medium text-sm">Queue is empty</p>
          <p className="text-slate-600 text-xs mt-1">Add a patient to get started</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {patients.map((patient, index) => (
            <div
              key={patient.id}
              className={clsx(
                'group flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 animate-slide-up',
                index === 0
                  ? 'bg-brand-500/5 border-brand-500/20 hover:border-brand-500/35'
                  : 'bg-surface-500/40 border-white/[0.04] hover:border-white/[0.1]',
              )}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              {/* Position */}
              <div
                className={clsx(
                  'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
                  index === 0
                    ? 'bg-brand-500/20 text-brand-400'
                    : 'bg-surface-400 text-slate-500',
                )}
              >
                {index + 1}
              </div>

              {/* Token */}
              <div
                className={clsx(
                  'w-11 h-10 rounded-xl flex items-center justify-center font-black text-base font-mono flex-shrink-0',
                  index === 0
                    ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white'
                    : 'bg-surface-400 text-slate-300',
                )}
              >
                {patient.tokenNumber}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-slate-100 truncate">{patient.patientName}</p>
                <AppointmentBadge type={patient.appointmentType as any} className="mt-1" />
              </div>

              {/* Wait time */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock size={11} />
                  <span className="font-mono">{formatWaitTime(patient.estimatedWaitMinutes)}</span>
                </div>
                <a
                  href={`/track/${patient.tokenNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-brand-400/70 hover:text-brand-400 transition-colors"
                  title="Open tracking link"
                >
                  <ExternalLink size={10} />
                  Track
                </a>
              </div>

              {/* Remove */}
              <button
                id={`remove-patient-${patient.id}`}
                onClick={() => handleRemove(patient)}
                disabled={removing === patient.id}
                className="btn-danger p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                title={`Remove ${patient.patientName}`}
              >
                {removing === patient.id ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
