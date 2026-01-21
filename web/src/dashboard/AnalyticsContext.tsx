/**
 * Analytics Context
 * 
 * Provides dashboard analytics data to all widgets.
 * Automatically uses demo data when data_mode === "demo".
 */

import { createContext, useContext, ReactNode } from 'react';
import { DashboardMetrics } from '../services/analyticsApi';

// Simple demo data placeholder (removed full demoAnalytics file)
const demoAnalytics: DashboardMetrics = {
  data_mode: 'demo',
  date_range: {
    start: '',
    end: '',
  },
  quotes: {
    total_quotes: 0,
    pending_quotes: 0,
    approved_quotes: 0,
    rejected_quotes: 0,
  },
  revenue: {
    total_value: 0,
    average_quote_value: 0,
    currency: 'MYR',
  },
  win_loss: {
    total_won: 0,
    total_lost: 0,
    win_rate: 0,
    won_value: 0,
    lost_value: 0,
  },
  margins: {
    average_margin: 0,
    min_margin: 0,
    max_margin: 0,
  },
  approvals: {
    pending_approvals: 0,
    avg_approval_time_hours: 0,
  },
  agreements: {
    total_active_agreements: 0,
    agreement_utilization_rate: 0,
    quotes_using_agreements: 0,
  },
  trends: {
    quotes_change_percent: 0,
    revenue_change_percent: 0,
    approved_change_percent: 0,
    pending_change_percent: 0,
  },
  revenue_time_series: [],
};

interface AnalyticsContextType {
  analytics: DashboardMetrics;
  isLoading: boolean;
  error: string | null;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export function AnalyticsProvider({ 
  children, 
  analytics, 
  isLoading, 
  error 
}: { 
  children: ReactNode;
  analytics: DashboardMetrics | null;
  isLoading: boolean;
  error: string | null;
}) {
  // Prefer real analytics whenever any real data is present (even if data_mode was set to "demo" upstream)
  const hasRealData =
    analytics &&
    (analytics.data_mode === 'real' ||
      (analytics.quotes?.total_quotes ?? 0) > 0 ||
      (analytics.revenue?.total_value ?? 0) > 0);

  // Use demo analytics only when there is truly no data to show
  const effectiveAnalytics = hasRealData && analytics ? analytics : demoAnalytics;

  return (
    <AnalyticsContext.Provider value={{ analytics: effectiveAnalytics, isLoading, error }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
}

