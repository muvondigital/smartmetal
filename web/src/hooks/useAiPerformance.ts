/**
 * AI Performance Analytics Hook
 *
 * Provides comprehensive AI performance metrics across all AI subsystems:
 * - Pricing Intelligence
 * - Approval Intelligence
 * - Material Matching (optional)
 * - Document Extraction (optional)
 */

import { useState, useEffect } from 'react';

export type AnalyticsRange =
  | "last_30_days"
  | "last_90_days"
  | "year_to_date"
  | "all_time";

export interface AiPerformanceSummary {
  pricing: {
    avgWinProbabilityError: number; // 0.12 → 12%
    avgRecommendedMargin: number;
    avgAppliedMargin: number;
    recommendationsCount: number;
    acceptedRecommendationsCount: number;
    estimatedRevenueUplift: number; // currency or %
  };
  approvals: {
    autoApprovedCount: number;
    autoApprovalAccuracy: number; // 0.0–1.0
    escalatedCount: number;
    avgRiskScore: number;
  };
  matching?: {
    autoMatchedItems: number;
    correctedMatches: number;
    avgConfidence: number; // 0.0–1.0
  };
  extraction?: {
    documentsProcessed: number;
    avgOcrConfidence: number; // 0.0–1.0
    structuringSuccessRate: number; // 0.0–1.0
  };
}

export interface AiPerformanceTrendPoint {
  date: string;
  winProbabilityError: number;
  autoApprovalAccuracy: number;
  revenueUplift: number;
  avgRiskScore: number;
}

export interface AiPerformanceResponse {
  summary: AiPerformanceSummary;
  trends: AiPerformanceTrendPoint[];
}

/**
 * Hook to fetch AI performance analytics
 *
 * TODO: Replace mock data with actual API call to backend
 * Backend endpoint should be: GET /api/analytics/ai-performance?range={range}
 */
export function useAiPerformance(range: AnalyticsRange): {
  data?: AiPerformanceResponse;
  isLoading: boolean;
  error?: Error;
} {
  const [data, setData] = useState<AiPerformanceResponse | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    // Simulate API call with delay
    setIsLoading(true);
    setError(undefined);

    const loadData = async () => {
      try {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // TODO: Replace with actual API call
        // const response = await fetch(`/api/analytics/ai-performance?range=${range}`);
        // const result = await response.json();
        // setData(result.data);

        // Mock data based on selected range
        const mockData = generateMockData(range);
        setData(mockData);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load AI performance data'));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [range]);

  return { data, isLoading, error };
}

/**
 * Generate mock data for development
 * TODO: Remove this function when backend API is ready
 */
function generateMockData(range: AnalyticsRange): AiPerformanceResponse {
  // Adjust data volume based on range
  const trendPoints = range === 'last_30_days' ? 30 :
                     range === 'last_90_days' ? 90 :
                     range === 'year_to_date' ? 365 : 730;

  const now = new Date();
  const trends: AiPerformanceTrendPoint[] = [];

  for (let i = trendPoints - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Simulate improving performance over time
    const improvementFactor = 1 - (i / trendPoints) * 0.3;

    trends.push({
      date: date.toISOString().split('T')[0],
      winProbabilityError: 0.15 - (improvementFactor * 0.03) + (Math.random() * 0.04 - 0.02),
      autoApprovalAccuracy: 0.85 + (improvementFactor * 0.12) + (Math.random() * 0.05 - 0.025),
      revenueUplift: 2.5 + (improvementFactor * 1.5) + (Math.random() * 0.8 - 0.4),
      avgRiskScore: 35 - (improvementFactor * 10) + (Math.random() * 8 - 4),
    });
  }

  return {
    summary: {
      pricing: {
        avgWinProbabilityError: 0.12,
        avgRecommendedMargin: 18.5,
        avgAppliedMargin: 17.2,
        recommendationsCount: 247,
        acceptedRecommendationsCount: 189,
        estimatedRevenueUplift: 14200,
      },
      approvals: {
        autoApprovedCount: 124,
        autoApprovalAccuracy: 0.94,
        escalatedCount: 23,
        avgRiskScore: 28.5,
      },
      matching: {
        autoMatchedItems: 1842,
        correctedMatches: 218,
        avgConfidence: 0.87,
      },
      extraction: {
        documentsProcessed: 156,
        avgOcrConfidence: 0.92,
        structuringSuccessRate: 0.89,
      },
    },
    trends,
  };
}
