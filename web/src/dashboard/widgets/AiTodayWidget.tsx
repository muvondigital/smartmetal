/**
 * AI Today Widget
 *
 * AI-powered insights and recommendations for the dashboard.
 * Part of SmartMetal Dashboard Framework.
 *
 * TODO: Integrate with real AI/ML insights service when available.
 */

import { Sparkles, Circle } from 'lucide-react';
import { Card } from '../../components/ui/card';

export function AiTodayWidget() {
  // TODO: Replace with real AI insights from backend
  const insights = [
    {
      id: 1,
      text: 'No expiring agreements in the next 7 days.',
      type: 'info' as const,
    },
    {
      id: 2,
      text: '0 quotes are currently breaching their SLA.',
      type: 'success' as const,
    },
    {
      id: 3,
      text: 'Tip: Focus on customers with >3 RFQs this month to increase win rate.',
      type: 'tip' as const,
    },
    {
      id: 4,
      text: 'Average quote approval time: 2.3 hours (within target).',
      type: 'info' as const,
    },
  ];

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'text-emerald-500';
      case 'warning':
        return 'text-amber-500';
      case 'tip':
        return 'text-teal-500';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-teal-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-slate-900 font-semibold">AI Insights Today</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Smart recommendations and analysis
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {insights.map((insight) => (
          <li key={insight.id} className="flex gap-2 text-sm">
            <Circle className={`h-3 w-3 mt-0.5 flex-shrink-0 ${getInsightColor(insight.type)}`} />
            <span className="text-slate-700">{insight.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
