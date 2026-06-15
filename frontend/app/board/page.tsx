'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocketContext } from '@/contexts/SocketContext';
import { getQueueStatus } from '@/lib/api';
import { PatientWithPrediction, APPOINTMENT_TYPE_LABELS, AppointmentType } from '@/lib/types';
import clsx from 'clsx';

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();

    // Two-tone hospital chime
    const tones = [
      { freq: 880, start: 0, end: 0.15 },
      { freq: 660, start: 0.15, end: 0.4 },
      { freq: 880, start: 0.4, end: 0.6 },
    ];

    tones.forEach(({ freq, start, end }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + end);

      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + end);
    });
  } catch {
    // Web Audio API may be unavailable in some environments
  }
}

function CurrentTime() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <>{time}</>;
}

export default function BoardPage() {
  const { queueState } = useSocketContext();
  const [animKey, setAnimKey] = useState(0);
  const prevTokenRef = useRef<number | null>(null);
  const [clinicName, setClinicName] = useState('Queue Cure Clinic');

  // Initial fetch
  useEffect(() => {
    getQueueStatus()
      .then((state) => {
        setClinicName(state.clinicName);
      })
      .catch(console.error);
  }, []);

  // Detect token change → trigger animation + sound
  useEffect(() => {
    const currentToken = queueState?.stats.currentToken ?? null;
    if (currentToken !== null && currentToken !== prevTokenRef.current) {
      if (prevTokenRef.current !== null) {
        playBeep();
        setAnimKey((k) => k + 1);
      }
      prevTokenRef.current = currentToken;
    }
    if (queueState?.clinicName) {
      setClinicName(queueState.clinicName);
    }
  }, [queueState?.stats.currentToken]);

  const current = queueState?.currentPatient ?? null;
  const waiting = queueState?.waitingPatients ?? [];
  const upcoming = waiting.slice(0, 5);

  return (
    <div className="min-h-screen bg-[#020817] flex flex-col overflow-hidden select-none">
      {/* ─── Grid Background ────────────────────────────────────── */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(6,182,212,0.5) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(6,182,212,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
            <span className="text-white font-black text-lg">Q</span>
          </div>
          <div>
            <p className="text-slate-100 font-black text-xl tracking-tight">
              Queue<span className="text-brand-400">Cure</span>
            </p>
            <p className="text-slate-500 text-xs">{clinicName}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Queue count */}
          {waiting.length > 0 && (
            <div className="text-center">
              <p className="text-4xl font-black text-amber-400 font-mono leading-none">
                {waiting.length}
              </p>
              <p className="text-xs text-slate-500 mt-1">in queue</p>
            </div>
          )}

          {/* Clock */}
          <div className="text-right">
            <p className="text-2xl font-mono font-bold text-slate-200 tabular-nums">
              <CurrentTime />
            </p>
            <p className="text-xs text-slate-500">
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>
      </header>

      {/* ─── Main Display ───────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col lg:flex-row items-stretch gap-0">
        {/* NOW SERVING — Left Panel */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-10 lg:py-0 relative">
          {/* Radial glow behind token */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden
          >
            <div
              className="w-[500px] h-[500px] rounded-full opacity-10"
              style={{
                background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)',
              }}
            />
          </div>

          {current ? (
            <>
              <p className="section-label text-brand-400/60 tracking-[0.4em] text-sm mb-4">
                NOW SERVING
              </p>

              {/* Token number — animates on change */}
              <div
                key={animKey}
                className="animate-token-change flex items-center justify-center"
              >
                <div
                  className="relative flex items-center justify-center"
                  style={{ filter: 'drop-shadow(0 0 60px rgba(6,182,212,0.5))' }}
                >
                  <div
                    className="w-64 h-64 lg:w-80 lg:h-80 rounded-[40px] flex flex-col items-center justify-center
                                bg-gradient-to-br from-brand-500 to-brand-600 border border-brand-400/30"
                  >
                    <p className="text-white/60 text-base font-medium tracking-widest uppercase mb-2">
                      Token
                    </p>
                    <p className="text-white font-black font-mono leading-none"
                       style={{ fontSize: 'clamp(5rem, 14vw, 9rem)' }}>
                      {current.tokenNumber}
                    </p>
                  </div>
                </div>
              </div>

              {/* Patient name + type */}
              <div key={`info-${animKey}`} className="mt-8 text-center animate-fade-in">
                <p className="text-3xl lg:text-4xl font-bold text-slate-100 tracking-tight">
                  {current.patientName}
                </p>
                <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20">
                  <span className="w-2 h-2 rounded-full bg-brand-400 animate-ping" />
                  <span className="text-brand-300 text-sm font-medium">
                    {APPOINTMENT_TYPE_LABELS[current.appointmentType as AppointmentType]}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center animate-fade-in">
              <div
                className="w-48 h-48 lg:w-64 lg:h-64 rounded-[40px] mx-auto mb-8 flex flex-col items-center justify-center border-2 border-dashed border-white/10"
              >
                <span className="text-6xl text-slate-700 font-black">—</span>
              </div>
              <p className="text-2xl font-bold text-slate-500">Clinic Ready</p>
              <p className="text-slate-600 mt-2 text-sm">Waiting for first patient</p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-white/[0.06] to-transparent my-8" />
        <div className="lg:hidden h-px mx-8 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

        {/* UPCOMING — Right Panel */}
        <div className="w-full lg:w-[380px] xl:w-[440px] flex flex-col px-8 py-8 lg:py-10 gap-6">
          <div>
            <p className="section-label tracking-[0.3em]">UPCOMING</p>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-slate-600 text-sm">No patients in queue</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {upcoming.map((patient, i) => (
                  <UpcomingRow key={patient.id} patient={patient} index={i} />
                ))}
              </div>
            )}
          </div>

          {/* Bottom Stats */}
          {queueState && (
            <div className="mt-auto grid grid-cols-2 gap-3">
              <div className="glass-card p-4 text-center border-amber-500/20">
                <p className="text-4xl font-black font-mono text-amber-400">
                  {queueState.stats.totalWaiting}
                </p>
                <p className="text-xs text-slate-500 mt-1">Waiting</p>
              </div>
              <div className="glass-card p-4 text-center border-emerald-500/20">
                <p className="text-4xl font-black font-mono text-emerald-400">
                  {queueState.stats.patientsServedToday}
                </p>
                <p className="text-xs text-slate-500 mt-1">Served Today</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function UpcomingRow({ patient, index }: { patient: PatientWithPrediction; index: number }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-4 p-4 rounded-2xl border transition-all animate-slide-up',
        index === 0
          ? 'bg-amber-500/5 border-amber-500/20'
          : 'bg-surface-600/50 border-white/[0.05]',
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Position */}
      <span
        className={clsx(
          'w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0',
          index === 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-surface-400 text-slate-500',
        )}
      >
        {index + 1}
      </span>

      {/* Token */}
      <div
        className={clsx(
          'w-16 h-14 rounded-2xl flex items-center justify-center font-black font-mono flex-shrink-0',
          index === 0
            ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white text-3xl'
            : 'bg-surface-400 text-slate-300 text-2xl',
        )}
        style={{ fontSize: index === 0 ? undefined : '1.75rem' }}
      >
        {patient.tokenNumber}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-200 text-lg truncate leading-tight">
          {patient.patientName}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {APPOINTMENT_TYPE_LABELS[patient.appointmentType as AppointmentType]}
        </p>
      </div>

      {/* Wait */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-mono font-bold text-slate-300">
          ~{patient.estimatedWaitMinutes}m
        </p>
        <p className="text-xs text-slate-600">wait</p>
      </div>
    </div>
  );
}
