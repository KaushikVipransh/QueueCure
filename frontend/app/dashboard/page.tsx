'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Monitor, Activity, RefreshCw } from 'lucide-react';
import { useSocketContext } from '@/contexts/SocketContext';
import { getQueueStatus } from '@/lib/api';
import { QueueState } from '@/lib/types';
import { AddPatientForm } from '@/components/dashboard/AddPatientForm';
import { CurrentPatient } from '@/components/dashboard/CurrentPatient';
import { QueueList } from '@/components/dashboard/QueueList';
import { StatsPanel } from '@/components/dashboard/StatsPanel';
import { AnalyticsPanel } from '@/components/dashboard/AnalyticsPanel';
import { ConnectionStatus } from '@/components/ui/ConnectionStatus';
import { FullPageLoader } from '@/components/ui/LoadingSpinner';

export default function DashboardPage() {
  const { queueState: socketState } = useSocketContext();
  const [localState, setLocalState] = useState<QueueState | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // Use socket state if available, else local fetched state
  const state = socketState ?? localState;

  useEffect(() => {
    getQueueStatus()
      .then(setLocalState)
      .catch(console.error)
      .finally(() => setInitialLoading(false));
  }, []);

  if (initialLoading) return <FullPageLoader message="Loading Queue Cure..." />;

  return (
    <div className="min-h-screen bg-surface-800 flex flex-col">
      {/* ─── Top Navigation ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-surface-700/80 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center glow-brand">
              <Activity className="text-white" size={18} />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-100 tracking-tight">
                Queue<span className="text-brand-400">Cure</span>
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">Receptionist Dashboard</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <ConnectionStatus />
            <Link
              href="/board"
              id="open-board-link"
              target="_blank"
              className="btn-ghost text-xs gap-1.5"
            >
              <Monitor size={14} />
              Queue Board
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Main Content ────────────────────────────────────────── */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Stats Row */}
        {state && <StatsPanel stats={state.stats} />}

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Queue Management */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Current Patient + Call Next */}
            <CurrentPatient
              currentPatient={state?.currentPatient ?? null}
              hasWaiting={(state?.waitingPatients.length ?? 0) > 0}
              elapsed={state?.stats.currentConsultationElapsed ?? 0}
              predicted={state?.stats.currentConsultationPredicted ?? 0}
            />

            {/* Waiting Queue */}
            <QueueList patients={state?.waitingPatients ?? []} />

            {/* Analytics */}
            <AnalyticsPanel />
          </div>

          {/* Right Column: Add Patient */}
          <div className="flex flex-col gap-6">
            <AddPatientForm />

            {/* Quick Info Card */}
            <div className="glass-card p-5">
              <p className="section-label">Quick Links</p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/board"
                  target="_blank"
                  className="flex items-center gap-3 p-3 rounded-xl bg-surface-500/40 hover:bg-surface-500 border border-white/[0.05] hover:border-white/[0.1] transition-all duration-200 text-sm text-slate-300"
                >
                  <Monitor className="text-brand-400" size={16} />
                  Open Queue Display Board
                </Link>
                {state?.currentPatient && (
                  <Link
                    href={`/track/${state.currentPatient.tokenNumber}`}
                    target="_blank"
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-500/40 hover:bg-surface-500 border border-white/[0.05] hover:border-white/[0.1] transition-all duration-200 text-sm text-slate-300"
                  >
                    <RefreshCw className="text-emerald-400" size={16} />
                    Track Current Patient
                  </Link>
                )}
              </div>
            </div>

            {/* Prediction Info */}
            <div className="glass-card p-5">
              <p className="section-label">Prediction Engine</p>
              <div className="flex flex-col gap-3 text-xs text-slate-400">
                {[
                  { type: 'Follow-up', dur: '8 min', color: 'bg-cyan-400' },
                  { type: 'General', dur: '15 min', color: 'bg-violet-400' },
                  { type: 'New Patient', dur: '25 min', color: 'bg-emerald-400' },
                  { type: 'Specialist', dur: '35 min', color: 'bg-orange-400' },
                ].map((item) => (
                  <div key={item.type} className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.color}`} />
                    <span className="flex-1">{item.type}</span>
                    <span className="font-mono text-slate-500 font-medium">{item.dur} base</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                Predictions adapt using a 70% recent ÷ 30% historical weighted formula updated after each consultation.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
