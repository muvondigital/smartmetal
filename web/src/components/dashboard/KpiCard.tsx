/**
 * MetricCard Component
 * 
 * Displays a single KPI metric tile with:
 * - Large value display
 * - Label/title
 * - Optional helper text (e.g., percentage change)
 * - Optional icon with accent background
 */

import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  helperText?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
}

export function KpiCard({ label, value, helperText, icon: Icon, trend }: KpiCardProps) {
  const trendColor = trend === 'up' 
    ? 'text-emerald-600' 
    : trend === 'down' 
    ? 'text-rose-600' 
    : 'text-slate-600';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-slate-600 text-sm mb-2">{label}</p>
          <p className="text-slate-900 text-3xl mb-1">{value}</p>
          {helperText && (
            <p className={`text-sm ${trendColor}`}>{helperText}</p>
          )}
        </div>
        {Icon && (
          <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center">
            <Icon className="w-6 h-6 text-teal-600" />
          </div>
        )}
      </div>
    </div>
  );
}

