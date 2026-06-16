'use client';

import { useState } from 'react';
import { UserPlus, ChevronDown, Phone, CheckCircle2, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { addPatient } from '@/lib/api';
import { AppointmentType } from '@/lib/types';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const APPOINTMENT_TYPES: { value: AppointmentType; label: string; duration: string }[] = [
  { value: 'follow_up',   label: 'Follow-up',    duration: '~8 min'  },
  { value: 'general',     label: 'General',       duration: '~15 min' },
  { value: 'new_patient', label: 'New Patient',   duration: '~25 min' },
  { value: 'specialist',  label: 'Specialist',    duration: '~35 min' },
];

interface AddPatientFormProps {
  onPatientAdded?: () => void;
}

export function AddPatientForm({ onPatientAdded }: AddPatientFormProps) {
  const [name,       setName]       = useState('');
  const [phone,      setPhone]      = useState('');
  const [type,       setType]       = useState<AppointmentType>('general');
  const [loading,    setLoading]    = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const validatePhone = (val: string) => {
    if (!val.trim()) return '';
    const cleaned = val.trim().replace(/\s/g, '');
    if (!/^\+?[1-9]\d{6,14}$/.test(cleaned)) return 'Use +919876543210 format';
    return '';
  };

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (val.trim()) setPhoneError(validatePhone(val));
    else setPhoneError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Patient name is required.'); return; }
    const phoneErr = validatePhone(phone);
    if (phoneErr) { setPhoneError(phoneErr); return; }

    setLoading(true);
    try {
      const result = await addPatient(name.trim(), type, phone.trim() || undefined);
      const { patient, smsSent } = result;
      toast.success(`Token #${patient.tokenNumber} issued to ${patient.patientName}`, { duration: 4000 });
      if (phone.trim()) {
        toast(
          () => (
            <div className="flex items-center gap-2 text-sm">
              <MessageCircle size={15} style={{ color: smsSent ? '#0f9b6e' : '#c47c0a', flexShrink: 0 }} />
              <span>{smsSent ? `Tracking SMS sent to ${phone.trim()}` : 'SMS not sent — share link manually'}</span>
            </div>
          ),
          { duration: 5000, icon: smsSent ? '📱' : '⚠️' },
        );
      }
      setName(''); setPhone(''); setType('general'); setPhoneError('');
      onPatientAdded?.();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to add patient.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Header */}
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#88A9C0' }}>
        Register Patient
      </p>

      {/* First name */}
      <div>
        <label htmlFor="patient-name" className="block text-xs font-semibold mb-1.5" style={{ color: '#1A3D63' }}>
          Patient Name
        </label>
        <input
          id="patient-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="First name"
          className="input-field"
          maxLength={100}
          autoComplete="off"
        />
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="patient-phone" className="block text-xs font-semibold mb-1.5" style={{ color: '#1A3D63' }}>
          Mobile <span className="font-normal" style={{ color: '#88A9C0' }}>(optional)</span>
        </label>
        <div className="relative">
          <input
            id="patient-phone"
            type="tel"
            value={phone}
            onChange={e => handlePhoneChange(e.target.value)}
            placeholder="+91 98765 43210"
            className="input-field pl-8"
            style={phoneError ? { borderColor: '#c93636' } : {}}
            maxLength={16}
          />
          <Phone size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#88A9C0' }} />
        </div>
        {phoneError && <p className="text-xs mt-1" style={{ color: '#c93636' }}>{phoneError}</p>}
        {phone.trim() && !phoneError && (
          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#0f9b6e' }}>
            <CheckCircle2 size={10} /> Tracking link via SMS
          </p>
        )}
      </div>

      {/* Appointment type */}
      <div>
        <label htmlFor="appointment-type" className="block text-xs font-semibold mb-1.5" style={{ color: '#1A3D63' }}>
          Appointment Type
        </label>
        <div className="relative">
          <select
            id="appointment-type"
            value={type}
            onChange={e => setType(e.target.value as AppointmentType)}
            className="select-field pr-8"
          >
            {APPOINTMENT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label} ({t.duration})</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#88A9C0' }} />
        </div>
      </div>

      {/* Submit */}
      <button
        id="add-patient-btn"
        type="submit"
        disabled={loading || !!phoneError}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all duration-150 disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg, #4A7FA7 0%, #1A3D63 100%)' }}
      >
        {loading
          ? <><LoadingSpinner size="sm" /> Registering...</>
          : <><UserPlus size={14} /> Issue Token +</>}
      </button>
    </form>
  );
}
