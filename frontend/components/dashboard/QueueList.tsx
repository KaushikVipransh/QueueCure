'use client';

import { useState } from 'react';
import { Trash2, Clock, Users, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { removePatient } from '@/lib/api';
import { PatientWithPrediction, formatWaitTime } from '@/lib/types';
import { AppointmentBadge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface QueueListProps { patients: PatientWithPrediction[]; }

const CONFIDENCE_COLORS = { high: '#0f9b6e', medium: '#c47c0a', low: '#B3CFE5' };

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
    <div className="card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #EEF4FA' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#88A9C0' }}>
          Waiting Queue
        </p>
        {patients.length > 0 && (
          <span
            className="text-xs font-bold font-mono px-2 py-0.5 rounded-full"
            style={{ background: '#EEF4FA', color: '#1A3D63' }}
          >
            {patients.length}
          </span>
        )}
      </div>

      {/* Table header */}
      {patients.length > 0 && (
        <div
          className="grid px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: '#88A9C0', gridTemplateColumns: '90px 1fr 140px 100px 60px 40px' }}
        >
          <span>Token</span>
          <span>Patient</span>
          <span>Type</span>
          <span>Wait</span>
          <span>Track</span>
          <span></span>
        </div>
      )}

      {/* Rows */}
      {patients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: '#EEF4FA' }}
          >
            <Users size={20} style={{ color: '#B3CFE5' }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: '#1A3D63' }}>Queue is empty</p>
          <p className="text-xs mt-1" style={{ color: '#88A9C0' }}>Add a patient to get started</p>
        </div>
      ) : (
        <div>
          {patients.map((patient, index) => {
            const isFirst    = index === 0;
            const confidence = patient.estimationResult?.confidence;
            const dotColor   = confidence ? CONFIDENCE_COLORS[confidence] : '#B3CFE5';

            return (
              <div
                key={patient.id}
                className="group grid items-center px-5 py-3 transition-all duration-150 animate-slide-up"
                style={{
                  gridTemplateColumns: '90px 1fr 140px 100px 60px 40px',
                  background: isFirst ? '#F0F7FC' : 'transparent',
                  borderBottom: '1px solid #EEF4FA',
                  animationDelay: `${index * 30}ms`,
                }}
                onMouseEnter={e => !isFirst && (e.currentTarget.style.background = '#F8FBFD')}
                onMouseLeave={e => !isFirst && (e.currentTarget.style.background = 'transparent')}
              >
                {/* Token */}
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-black font-mono px-2 py-1 rounded-lg"
                    style={{
                      background: isFirst ? 'linear-gradient(135deg, #4A7FA7, #1A3D63)' : '#EEF4FA',
                      color: isFirst ? '#fff' : '#1A3D63',
                    }}
                  >
                    #{patient.tokenNumber}
                  </span>
                </div>

                {/* Name */}
                <p className="text-sm font-medium truncate" style={{ color: '#0A1931' }}>
                  {patient.patientName}
                </p>

                {/* Type */}
                <AppointmentBadge type={patient.appointmentType as any} />

                {/* Wait */}
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                  <span className="text-xs font-mono" style={{ color: '#4A7FA7' }}>
                    {patient.estimationResult
                      ? `${patient.estimationResult.optimistic}–${patient.estimationResult.likely} min`
                      : formatWaitTime(patient.estimatedWaitMinutes)}
                  </span>
                </div>

                {/* Track */}
                <a
                  href={`/track/${patient.tokenNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium transition-colors"
                  style={{ color: '#4A7FA7' }}
                >
                  <ExternalLink size={11} />
                  Link
                </a>

                {/* Remove */}
                <button
                  id={`remove-patient-${patient.id}`}
                  onClick={() => handleRemove(patient)}
                  disabled={removing === patient.id}
                  className="flex items-center justify-center w-7 h-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
                  style={{ background: '#fdeaea', color: '#c93636' }}
                  title={`Remove ${patient.patientName}`}
                >
                  {removing === patient.id
                    ? <LoadingSpinner size="sm" />
                    : <Trash2 size={12} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
