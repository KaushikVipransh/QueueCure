'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Monitor, Activity, LayoutDashboard, Users, BarChart2,
  Settings, ExternalLink, Link as LinkIcon, TrendingUp, Zap,
} from 'lucide-react';
import { useSocketContext } from '@/contexts/SocketContext';
import { getQueueStatus } from '@/lib/api';
import { QueueState } from '@/lib/types';
import { AddPatientForm } from '@/components/dashboard/AddPatientForm';
import { CurrentPatient } from '@/components/dashboard/CurrentPatient';
import { QueueList } from '@/components/dashboard/QueueList';
import { AnalyticsPanel } from '@/components/dashboard/AnalyticsPanel';
import { ConnectionStatus } from '@/components/ui/ConnectionStatus';
import { QueueAnimation } from '@/components/ui/QueueAnimation';
import { FullPageLoader } from '@/components/ui/LoadingSpinner';

/* ─── Sidebar NavItem ────────────────────────────────────────────────────── */
function NavItem({
  icon: Icon,
  label,
  active = false,
  href,
  external,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  href?: string;
  external?: boolean;
}) {
  const style: React.CSSProperties = active
    ? { background: 'rgba(74,127,167,0.25)', color: '#B3CFE5', borderRadius: 10 }
    : { color: 'rgba(179,207,229,0.6)', borderRadius: 10 };

  const inner = (
    <>
      <Icon size={15} />
      <span className="flex-1">{label}</span>
      {external && <ExternalLink size={11} style={{ color: 'rgba(179,207,229,0.35)' }} />}
    </>
  );

  const cls = 'flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium w-full transition-all duration-150';

  if (href) {
    return (
      <Link href={href} target={external ? '_blank' : undefined} className={cls} style={style}>
        {inner}
      </Link>
    );
  }
  return <button className={cls} style={style}>{inner}</button>;
}

/* ─── Inline stats for sidebar ──────────────────────────────────────────── */
function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs" style={{ color: 'rgba(179,207,229,0.55)' }}>{label}</span>
      <span className="text-xs font-bold font-mono" style={{ color: '#B3CFE5' }}>{value}</span>
    </div>
  );
}

/* ─── Dashboard Page ─────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { queueState: socketState } = useSocketContext();
  const [localState, setLocalState] = useState<QueueState | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const state = socketState ?? localState;

  useEffect(() => {
    getQueueStatus()
      .then(setLocalState)
      .catch(console.error)
      .finally(() => setInitialLoading(false));
  }, []);

  if (initialLoading) return <FullPageLoader message="Loading Queue Cure..." />;

  const waiting = state?.waitingPatients.length ?? 0;
  const stats = state?.stats;
  const nowToken = stats?.currentToken;
  const avgMin = stats?.avgConsultationDuration ?? 0;
  const served = stats?.patientsServedToday ?? 0;
  const eff = stats?.queueEfficiency ?? 0;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();

  return (
    /*
     * ROOT: h-screen + overflow-hidden → locks the viewport
     * Only the middle <main> gets overflow-y-auto → only it scrolls
     */
    <div className="flex h-screen overflow-hidden" style={{ background: '#EEF4FA' }}>

      {/* ══════════ LEFT SIDEBAR (fixed height, never scrolls) ══════════ */}
      <aside
        className="flex flex-col w-[220px] flex-shrink-0 h-screen"
        style={{ background: '#0A1931', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Logo */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #4A7FA7 0%, #1A3D63 100%)' }}
            >
              {/* Q icon */}
              <span className="text-white font-black text-sm font-mono leading-none">Q</span>
            </div>
            <div>
              <p className="text-sm font-black text-white leading-tight">
                Queue<span style={{ color: '#4A7FA7' }}>Cure</span>
              </p>
            </div>
          </div>
        </div>

        {/* Live queue label + animation */}
        <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: 'rgba(74,127,167,0.9)' }}>
            Live Queue · {waiting} Waiting
          </p>
          <QueueAnimation />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
          <NavItem icon={LayoutDashboard} label="Dashboard" active />
          <NavItem icon={Monitor} label="Queue Board" href="/board" external />
          <NavItem icon={BarChart2} label="Analytics" />
          <NavItem icon={Settings} label="Settings" />
        </nav>

        {/* Bottom: connection */}
        <div className="px-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <ConnectionStatus />
        </div>
      </aside>

      {/* ══════════ CENTRE + RIGHT wrapper ══════════ */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <header
          className="flex items-center justify-between px-6 h-14 flex-shrink-0"
          style={{
            background: '#F6FAFD',
            borderBottom: '1px solid #D4E4F0',
          }}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#88A9C0' }}>
              Live Operations
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: '#4A7FA7' }}>{timeStr}</span>
            <Link
              href="/board"
              id="open-board-link"
              target="_blank"
              className="btn-ghost text-xs"
              style={{ paddingTop: '6px', paddingBottom: '6px' }}
            >
              <Monitor size={13} />
              Display Board
            </Link>
          </div>
        </header>

        {/* ── Body: [main scrollable] + [right panel fixed] ─────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── MAIN (scrollable) ───────────────────────────────────── */}
          <main className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5 min-w-0">

            {/* Stats strip */}
            <div className="grid grid-cols-4 gap-3">
              {/* Now Serving */}
              <div className="card p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#88A9C0' }}>Now Serving</p>
                <div className="flex items-center gap-2">
                  <Zap size={20} style={{ color: '#4A7FA7' }} />
                  <span className="text-2xl font-black font-mono" style={{ color: '#0A1931' }}>
                    {nowToken ? `#${nowToken}` : '—'}
                  </span>
                </div>
              </div>

              {/* Waiting */}
              <div className="card p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#88A9C0' }}>Waiting</p>
                <div className="flex items-center gap-2">
                  <Users size={20} style={{ color: '#c47c0a' }} />
                  <span className="text-2xl font-black font-mono" style={{ color: '#0A1931' }}>{waiting}</span>
                </div>
              </div>

              {/* Avg Consult */}
              <div className="card p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#88A9C0' }}>Avg. Consult</p>
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-black font-mono" style={{ color: '#0A1931' }}>
                    {avgMin > 0 ? avgMin.toFixed(1) : '—'}
                  </span>
                  {avgMin > 0 && <span className="text-sm font-semibold mb-0.5" style={{ color: '#88A9C0' }}>min</span>}
                </div>
              </div>

              {/* Today's Performance */}
              <div className="card p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#88A9C0' }}>Today's Performance</p>
                <div className="flex items-end gap-4">
                  <div>
                    <div className="flex items-center gap-1">
                      <TrendingUp size={13} style={{ color: '#0f9b6e' }} />
                      <span className="text-2xl font-black font-mono" style={{ color: '#0A1931' }}>{served}</span>
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#88A9C0' }}>Served</p>
                  </div>
                  <div>
                    <span className="text-2xl font-black font-mono" style={{ color: '#0A1931' }}>{eff}%</span>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#88A9C0' }}>Efficiency</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Now Serving panel */}
            <CurrentPatient
              currentPatient={state?.currentPatient ?? null}
              hasWaiting={waiting > 0}
              elapsed={stats?.currentConsultationElapsed ?? 0}
              predicted={stats?.currentConsultationPredicted ?? 0}
            />

            {/* Waiting Queue */}
            <QueueList patients={state?.waitingPatients ?? []} />

            {/* Analytics */}
            <AnalyticsPanel />
          </main>

          {/* ── RIGHT PANEL (fixed, scrollable internally) ─────────── */}
          <aside
            className="w-[280px] flex-shrink-0 h-full overflow-y-auto flex flex-col gap-0"
            style={{ background: '#F6FAFD', borderLeft: '1px solid #D4E4F0' }}
          >
            {/* Register Patient */}
            <div className="p-5 border-b" style={{ borderColor: '#D4E4F0' }}>
              <AddPatientForm />
            </div>

            {/* System Insights */}
            <div className="p-5 border-b" style={{ borderColor: '#D4E4F0' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#88A9C0' }}>
                System Insights
              </p>
              <div className="flex flex-col gap-0.5">
                <SidebarStat label="Predicted Next Wait" value={avgMin > 0 ? `${Math.round(avgMin * 1.1)}min` : '—'} />
                <SidebarStat label="Queue Efficiency" value={`${eff}%`} />
                <SidebarStat label="Patients Served Today" value={String(served)} />
                <SidebarStat label="Currently Waiting" value={String(waiting)} />
              </div>
            </div>

            {/* Quick Links */}
            <div className="p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: '#88A9C0' }}>
                Quick Links
              </p>
              <div className="flex flex-col gap-1">
                {[
                  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
                  { icon: Monitor, label: 'Queue Board', href: '/board' },
                  { icon: LinkIcon, label: 'Patient Track', href: state?.currentPatient ? `/track/${state.currentPatient.tokenNumber}` : '#' },
                ].map(item => (
                  <Link
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150"
                    style={{ color: '#1A3D63' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#EEF4FA')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <item.icon size={14} style={{ color: '#4A7FA7' }} />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
