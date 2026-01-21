/**
 * KPI Widget - Approved Quotes
 *
 * Displays count of approved quotes ready for next steps.
 * Part of SmartMetal Dashboard Framework.
 * Uses analytics data from AnalyticsContext (real or demo).
 */

import { CheckCircle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { useAnalytics } from '../AnalyticsContext';

export function KpiApprovedQuotesWidget() {
  const { analytics, isLoading } = useAnalytics();

  const count = analytics?.quotes?.approved_quotes ?? 0;
  const changePercentage = analytics?.trends?.approved_change_percent ?? 0;

  return (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-slate-600 text-sm mb-2">Approved Quotes</p>
          <p className="text-slate-900 text-3xl mb-1">
            {isLoading ? '...' : count}
          </p>
          <p className="text-sm text-emerald-600">Ready for next steps</p>
          {/* Trend Indicator */}
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {changePercentage > 0 ? (
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
            ) : changePercentage < 0 ? (
              <ArrowDownRight className="h-3 w-3 text-rose-500" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            <span>
              {changePercentage > 0 ? '+' : ''}{changePercentage}% vs last month
            </span>
          </div>
        </div>
        <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center">
          <CheckCircle className="w-6 h-6 text-teal-600" />
        </div>
      </div>
    </Card>
  );
}
