'use client';

import { useState } from 'react';
import { UserPlus, ChevronDown, Phone, MessageCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { addPatient } from '@/lib/api';
import { AppointmentType } from '@/lib/types';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const APPOINTMENT_TYPES: { value: AppointmentType; label: string; duration: string; color: string }[] = [
  { value: 'follow_up',   label: 'Follow-up Consultation',   duration: '~8 min',  color: 'text-cyan-400'    },
  { value: 'general',     label: 'General Consultation',     duration: '~15 min', color: 'text-violet-400'  },
  { value: 'new_patient', label: 'New Patient Consultation', duration: '~25 min', color: 'text-emerald-400' },
  { value: 'specialist',  label: 'Specialist Consultation',  duration: '~35 min', color: 'text-orange-400'  },
];

interface AddPatientFormProps {
  onPatientAdded?: () => void;
}

export function AddPatientForm({ onPatientAdded }: AddPatientFormProps) {
  const [name,        setName]        = useState('');
  const [phone,       setPhone]       = useState('');
  const [type,        setType]        = useState<AppointmentType>('general');
  const [loading,     setLoading]     = useState(false);
  const [phoneError,  setPhoneError]  = useState('');

  const selectedType = APPOINTMENT_TYPES.find((t) => t.value === type)!;

  const validatePhone = (val: string) => {
    if (!val.trim()) return ''; // phone is optional
    const cleaned = val.trim().replace(/\s/g, '');
    if (!/^\+?[1-9]\d{6,14}$/.test(cleaned)) {
      return 'Use E.164 format: +919876543210';
    }
    return '';
  };

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (val.trim()) setPhoneError(validatePhone(val));
    else setPhoneError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Patient name is required.');
      return;
    }

    const phoneErr = validatePhone(phone);
    if (phoneErr) {
      setPhoneError(phoneErr);
      return;
    }

    setLoading(true);
    try {
      const result = await addPatient(
        name.trim(),
        type,
        phone.trim() || undefined,
      );

      const { patient, smsSent } = result;

      // Primary toast — token issued
      toast.success(
        `✅ Token #${patient.tokenNumber} issued to ${patient.patientName}`,
        { duration: 4000 },
      );

      // Secondary toast — SMS status
      if (phone.trim()) {
        if (smsSent) {
          toast(
            (t) => (
              <div className="flex items-center gap-2 text-sm">
                <MessageCircle size={16} className="text-emerald-400 flex-shrink-0" />
                <span>Tracking link sent to <strong>{phone.trim()}</strong></span>
              </div>
            ),
            { duration: 5000, icon: '📱' },
          );
        } else {
          toast(
            'SMS not sent — Twilio not configured. Share the tracking link manually.',
            { icon: '⚠️', duration: 4000 },
          );
        }
      }

      setName('');
      setPhone('');
      setType('general');
      setPhoneError('');
      onPatientAdded?.();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to add patient. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center">
          <UserPlus className="text-brand-400" size={18} />
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
            Patient Name <span className="text-slate-600">(required)</span>
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

        {/* Phone Number */}
        <div>
          <label htmlFor="patient-phone" className="block text-xs font-medium text-slate-400 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Phone size={11} />
              Mobile Number
              <span className="text-slate-600 font-normal">(optional — sends tracking link via SMS)</span>
            </span>
          </label>
          <div className="relative">
            <input
              id="patient-phone"
              type="tel"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="+91 98765 43210"
              className={`input-field pl-9 ${phoneError ? 'border-red-500/50 focus:border-red-500' : ''}`}
              maxLength={16}
              autoComplete="tel"
            />
            <Phone
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
            />
          </div>
          {phoneError && (
            <p className="text-xs text-red-400 mt-1">{phoneError}</p>
          )}
          {phone.trim() && !phoneError && (
            <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 size={10} />
              Patient will receive a tracking link via SMS
            </p>
          )}
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
        disabled={loading || !!phoneError}
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
            Issue Token{phone.trim() && !phoneError ? ' & Send SMS' : ''}
          </>
        )}
      </button>
    </form>
  );
}
