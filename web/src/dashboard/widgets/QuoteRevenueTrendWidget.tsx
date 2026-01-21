/**
 * Quote Revenue Trend Chart Widget
 *
 * Displays a line chart showing quote revenue over time.
 * Part of SmartMetal Dashboard Framework.
 * Uses analytics data from AnalyticsContext (real or demo).
 */

import { Card } from '../../components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAnalytics } from '../AnalyticsContext';

export function QuoteRevenueTrendWidget() {
  const { analytics, isLoading } = useAnalytics();
  
  const data = analytics.revenue_time_series;

  const formatCurrency = (value: number) => {
    return `$${(value / 1000).toFixed(0)}K`;
  };

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center h-full">
        <div className="text-slate-600">Loading chart...</div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full overflow-hidden">
      <div className="flex-none px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="text-slate-900 font-semibold">Quote Revenue</h3>
          <span className="text-xs text-slate-500">Last 6 Months</span>
        </div>
      </div>
      <div className="flex-1 p-6 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="month"
              stroke="#64748b"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke="#64748b"
              style={{ fontSize: '12px' }}
              tickFormatter={formatCurrency}
            />
            <Tooltip
              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#14b8a6"
              strokeWidth={3}
              dot={{ fill: '#14b8a6', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
