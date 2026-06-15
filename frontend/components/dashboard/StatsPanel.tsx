'use client';

import { Activity, Users, Clock, TrendingUp, Zap } from 'lucide-react';
import { QueueStats } from '@/lib/types';

interface StatsPanelProps {
  stats: QueueStats;
}

const STAT_ITEMS = [
  {
    key: 'currentToken' as keyof QueueStats,
    label: 'Current Token',
    icon: Zap,
    color: 'text-brand-400',
    bg: 'bg-brand-500/10',
    border: 'border-brand-500/20',
    format: (v: number | null) => (v ? `#${v}` : '—'),
  },
  {
    key: 'totalWaiting' as keyof QueueStats,
    label: 'Patients Waiting',
    icon: Users,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    format: (v: number) => String(v),
  },
  {
    key: 'avgConsultationDuration' as keyof QueueStats,
    label: 'Avg. Consultation',
    icon: Clock,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    format: (v: number) => (v > 0 ? `${v.toFixed(1)} min` : '—'),
  },
  {
    key: 'patientsServedToday' as keyof QueueStats,
    label: 'Served Today',
    icon: Activity,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    format: (v: number) => String(v),
  },
  {
    key: 'queueEfficiency' as keyof QueueStats,
    label: 'Queue Efficiency',
    icon: TrendingUp,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    format: (v: number) => `${v}%`,
  },
];

export function StatsPanel({ stats }: StatsPanelProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {STAT_ITEMS.map(({ key, label, icon: Icon, color, bg, border, format }) => {
        const raw = stats[key];
        const value = format(raw as any);

        return (
          <div
            key={key}
            className={`glass-card p-4 flex flex-col gap-3 border ${border}`}
          >
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon className={color} size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{label}</p>
              <p className={`text-2xl font-black mt-0.5 font-mono ${color}`}>{value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
