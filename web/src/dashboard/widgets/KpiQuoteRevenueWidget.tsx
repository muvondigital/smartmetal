/**
 * KPI Widget - Quote Revenue
 *
 * Displays total quote revenue this month.
 * Part of SmartMetal Dashboard Framework.
 * Uses analytics data from AnalyticsContext (real or demo).
 */

import { DollarSign, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { useAnalytics } from '../AnalyticsContext';

export function KpiQuoteRevenueWidget() {
  const { analytics, isLoading } = useAnalytics();

  const revenue = analytics?.revenue?.total_value ?? 0;
  const changePercentage = analytics?.trends?.revenue_change_percent ?? 0;

  const formatRevenue = (value: number) => {
    return `$${(value / 1000000).toFixed(2)}M`;
  };

  return (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-slate-600 text-sm mb-2">Quote Revenue (This Month)</p>
          <p className="text-slate-900 text-3xl mb-1">
            {isLoading ? '...' : formatRevenue(revenue)}
          </p>
          <p className="text-sm text-emerald-600">Total revenue</p>
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
          <DollarSign className="w-6 h-6 text-teal-600" />
        </div>
      </div>
    </Card>
  );
}
