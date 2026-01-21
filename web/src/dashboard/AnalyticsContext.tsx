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
  quotes: { total_quotes: 0, pending_quotes: 0, approved_quotes: 0, rejected_quotes: 0 },
  revenue: { total_value: 0, average_quote_value: 0, currency: 'MYR' },
  performance: { avg_approval_time_hours: 0, win_rate: 0, total_agreements: 0 }
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

