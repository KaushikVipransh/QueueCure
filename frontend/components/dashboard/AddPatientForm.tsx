'use client';

import { useState } from 'react';
import { UserPlus, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { addPatient } from '@/lib/api';
import { AppointmentType, APPOINTMENT_TYPE_LABELS } from '@/lib/types';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const APPOINTMENT_TYPES: { value: AppointmentType; label: string; duration: string; color: string }[] = [
  { value: 'follow_up', label: 'Follow-up Consultation', duration: '~8 min', color: 'text-cyan-400' },
  { value: 'general', label: 'General Consultation', duration: '~15 min', color: 'text-violet-400' },
  { value: 'new_patient', label: 'New Patient Consultation', duration: '~25 min', color: 'text-emerald-400' },
  { value: 'specialist', label: 'Specialist Consultation', duration: '~35 min', color: 'text-orange-400' },
];

interface AddPatientFormProps {
  onPatientAdded?: () => void;
}

export function AddPatientForm({ onPatientAdded }: AddPatientFormProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AppointmentType>('general');
  const [loading, setLoading] = useState(false);

  const selectedType = APPOINTMENT_TYPES.find((t) => t.value === type)!;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Patient name is required.');
      return;
    }

    setLoading(true);
    try {
      const result = await addPatient(name.trim(), type);
      toast.success(
        `✅ Token ${result.patient.tokenNumber} issued to ${result.patient.patientName}`,
        { duration: 5000 },
      );
      setName('');
      setType('general');
      onPatientAdded?.();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to add patient. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center">
          <UserPlus className="w-4.5 h-4.5 text-brand-400" size={18} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-100">Add Patient</h2>
          <p className="text-xs text-slate-500">Issue a new queue token</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* Patient Name */}
        <div>
          <label htmlFor="patient-name" className="block text-xs font-medium text-slate-400 mb-1.5">
            Patient Name
          </label>
          <input
            id="patient-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter patient full name"
            className="input-field"
            maxLength={100}
            autoComplete="off"
          />
        </div>

        {/* Appointment Type */}
        <div>
          <label htmlFor="appointment-type" className="block text-xs font-medium text-slate-400 mb-1.5">
            Appointment Type
          </label>
          <div className="relative">
            <select
              id="appointment-type"
              value={type}
              onChange={(e) => setType(e.target.value as AppointmentType)}
              className="select-field pr-10"
            >
              {APPOINTMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Type info pill */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-500 border border-white/[0.05]">
          <span className={`w-2 h-2 rounded-full ${selectedType.color.replace('text-', 'bg-')}`} />
          <span className="text-xs text-slate-400">{selectedType.label}</span>
          <span className={`ml-auto text-xs font-medium font-mono ${selectedType.color}`}>
            {selectedType.duration}
          </span>
        </div>
      </div>

      <button
        id="add-patient-btn"
        type="submit"
        disabled={loading}
        className="btn-primary w-full"
      >
        {loading ? (
          <>
            <LoadingSpinner size="sm" />
            Adding...
          </>
        ) : (
          <>
            <UserPlus size={16} />
            Issue Token
          </>
        )}
      </button>
    </form>
  );
}
