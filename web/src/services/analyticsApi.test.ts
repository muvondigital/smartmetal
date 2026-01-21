import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { getDashboardMetrics, DashboardMetrics } from './analyticsApi';
import { request as mockRequest } from '../api/client';

vi.mock('../api/client', () => ({
  request: vi.fn(),
}));

const mockedRequest = mockRequest as unknown as Mock;

const mockMetrics: DashboardMetrics = {
  data_mode: 'real',
  date_range: {
    start: '2025-08-01',
    end: '2025-11-01',
  },
  quotes: {
    total_quotes: 3,
    pending_quotes: 1,
    approved_quotes: 1,
    rejected_quotes: 0,
  },
  revenue: {
    total_value: 52952.26,
    average_quote_value: 17650.75,
    currency: 'USD',
  },
  win_loss: {
    total_won: 1,
    total_lost: 0,
    win_rate: 1,
    won_value: 10000,
    lost_value: 0,
  },
  margins: {
    average_margin: 0.12,
    min_margin: 0.08,
    max_margin: 0.18,
  },
  approvals: {
    pending_approvals: 1,
    avg_approval_time_hours: 4,
  },
  agreements: {
    total_active_agreements: 1,
    agreement_utilization_rate: 0.5,
    quotes_using_agreements: 1,
  },
  trends: {
    quotes_change_percent: 10,
    revenue_change_percent: 5,
    approved_change_percent: 15,
    pending_change_percent: -5,
  },
  revenue_time_series: [
    { month: 'Aug', revenue: 10000 },
    { month: 'Sep', revenue: 20000 },
  ],
};

describe('analyticsApi.getDashboardMetrics', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  it('unpacks dashboard metrics from the API response', async () => {
    mockedRequest.mockResolvedValue({ data: mockMetrics });

    const result = await getDashboardMetrics();

    expect(mockedRequest).toHaveBeenCalledWith('/analytics/dashboard');
    expect(result).toEqual(mockMetrics);
    expect(result.quotes.total_quotes).toBe(3);
    expect(result.revenue.total_value).toBeCloseTo(52952.26);
  });
});
