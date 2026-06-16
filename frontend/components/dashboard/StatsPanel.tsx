'use client';

import { Activity, Users, Clock, TrendingUp, Zap } from 'lucide-react';
import { QueueStats } from '@/lib/types';

interface StatsPanelProps { stats: QueueStats; }

const STAT_ITEMS = [
  {
    key: 'currentToken' as keyof QueueStats,
    label: 'Now Serving',
    icon: Zap,
    accent: '#1A3D63',
    bg: '#EEF4FA',
    format: (v: number | null) => (v ? `#${v}` : '—'),
  },
  {
    key: 'totalWaiting' as keyof QueueStats,
    label: 'Waiting',
    icon: Users,
    accent: '#c47c0a',
    bg: '#fef6e4',
    format: (v: number) => String(v),
  },
  {
    key: 'avgConsultationDuration' as keyof QueueStats,
    label: 'Avg. Consult',
    icon: Clock,
    accent: '#4A7FA7',
    bg: '#e8f0f8',
    format: (v: number) => (v > 0 ? `${v.toFixed(1)} min` : '—'),
  },
  {
    key: 'patientsServedToday' as keyof QueueStats,
    label: 'Served Today',
    icon: Activity,
    accent: '#0f9b6e',
    bg: '#e6f7f2',
    format: (v: number) => String(v),
  },
  {
    key: 'queueEfficiency' as keyof QueueStats,
    label: 'Efficiency',
    icon: TrendingUp,
    accent: '#7747c9',
    bg: '#f0eafd',
    format: (v: number) => `${v}%`,
  },
];

export function StatsPanel({ stats }: StatsPanelProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {STAT_ITEMS.map(({ key, label, icon: Icon, accent, bg, format }) => {
        const raw   = stats[key];
        const value = format(raw as any);

        return (
          <div
            key={key}
            className="card p-4 flex flex-col gap-3"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: bg }}
            >
              <Icon size={17} style={{ color: accent }} />
            </div>
            <div>
              <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--c-text-subtle)' }}>{label}</p>
              <p
                className="text-2xl font-black font-mono leading-none"
                style={{ color: accent }}
              >
                {value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
