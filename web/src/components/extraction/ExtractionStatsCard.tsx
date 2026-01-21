/**
 * ExtractionStatsCard Component
 *
 * Displays extraction summary statistics in a grid layout.
 * Part of the SmartMetal Extraction Preview system.
 */

import { BarChart3 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import type { ExtractionStats } from '../../types/extraction';
import { cn } from '../../lib/utils';

interface ExtractionStatsCardProps {
  stats: ExtractionStats;
}

function StatItem({
  value,
  label,
  highlight = false,
}: {
  value: string | number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'text-center py-4 px-3 rounded-lg',
        highlight
          ? 'bg-gradient-to-br from-teal-50 to-teal-100'
          : 'bg-slate-50'
      )}
    >
      <div
        className={cn(
          'text-2xl font-bold font-mono',
          highlight ? 'text-teal-600' : 'text-slate-900'
        )}
      >
        {value}
      </div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mt-1">
        {label}
      </div>
    </div>
  );
}

export function ExtractionStatsCard({ stats }: ExtractionStatsCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="px-5 py-4 border-b border-slate-200">
        <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-500" />
          Extraction Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid grid-cols-2 gap-4">
          <StatItem value={stats.totalItems} label="Total Items" highlight />
          <StatItem value={stats.totalSections} label="Sections" />
          <StatItem value={stats.tablesFound} label="Tables Found" />
          <StatItem value={`${stats.overallConfidence}%`} label="Confidence" />
        </div>
      </CardContent>
    </Card>
  );
}
