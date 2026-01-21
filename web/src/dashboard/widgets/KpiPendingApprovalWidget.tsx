/**
 * KPI Widget - Pending Approval
 *
 * Displays count of RFQs pending approval.
 * Part of SmartMetal Dashboard Framework.
 * Uses analytics data from AnalyticsContext (real or demo).
 */

import { Clock, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { useAnalytics } from '../AnalyticsContext';

export function KpiPendingApprovalWidget() {
  const { analytics, isLoading } = useAnalytics();

  const count = analytics?.quotes?.pending_quotes ?? 0;
  const changePercentage = analytics?.trends?.pending_change_percent ?? 0;

  return (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-slate-600 text-sm mb-2">Pending Approval</p>
          <p className="text-slate-900 text-3xl mb-1">
            {isLoading ? '...' : count}
          </p>
          <p className="text-sm text-slate-600">Requires attention</p>
          {/* Trend Indicator */}
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {changePercentage > 0 ? (
              <ArrowUpRight className="h-3 w-3 text-rose-500" />
            ) : changePercentage < 0 ? (
              <ArrowDownRight className="h-3 w-3 text-emerald-500" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            <span>
              {changePercentage > 0 ? '+' : ''}{changePercentage}% vs last month
            </span>
          </div>
        </div>
        <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center">
          <Clock className="w-6 h-6 text-teal-600" />
        </div>
      </div>
    </Card>
  );
}
