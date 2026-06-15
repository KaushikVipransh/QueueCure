'use client';

import { useEffect, useState } from 'react';
import { BarChart2, PieChart, TrendingUp } from 'lucide-react';
import { getAnalytics } from '@/lib/api';
import { AnalyticsData } from '@/lib/types';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const PIE_COLORS = ['#06b6d4', '#a78bfa', '#34d399', '#fb923c'];

const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#111827',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px',
  color: '#f1f5f9',
  fontSize: '12px',
};

export function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'hourly' | 'distribution' | 'trend'>('hourly');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const analytics = await getAnalytics();
        setData(analytics);
      } catch {
        // Silently handle — analytics are supplementary
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="glass-card p-6 flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="glass-card p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
            <BarChart2 className="text-violet-400" size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Analytics</h2>
            <p className="text-xs text-slate-500">Today's performance overview</p>
          </div>
        </div>

        {/* Summary Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
            <span className="font-bold">{data.patientsServedToday}</span> served today
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-xs text-brand-400">
            <span className="font-bold">{data.avgConsultationMinutes}</span> min avg consult
          </div>
          {data.mostCommonType && (
            <div className="px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs text-violet-400">
              Top: <span className="font-bold">{data.mostCommonType}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-500 border border-white/[0.05] w-fit">
        {(
          [
            { key: 'hourly', label: 'Hourly', icon: BarChart2 },
            { key: 'distribution', label: 'By Type', icon: PieChart },
            { key: 'trend', label: 'Duration Trend', icon: TrendingUp },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            id={`analytics-tab-${key}`}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              tab === key
                ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="h-56">
        {tab === 'hourly' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.hourlyData} barSize={20}>
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="count" name="Patients" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {tab === 'distribution' && (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Pie
                data={data.typeDistribution}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={50}
                paddingAngle={3}
              >
                {data.typeDistribution.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend
                formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>}
              />
            </RechartsPieChart>
          </ResponsiveContainer>
        )}

        {tab === 'trend' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.durationTrend}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={false} unit=" min" />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
              <Line type="monotone" dataKey="actual" name="Actual" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} />
              <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#a78bfa" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3, fill: '#a78bfa' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
