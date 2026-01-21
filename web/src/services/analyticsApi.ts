import { request as apiRequest } from '../api/client';

export interface TimeSeriesPoint {
  month: string;
  revenue: number;
}

export interface DashboardMetrics {
  data_mode: 'real' | 'demo';
  date_range: {
    start: string;
    end: string;
  };
  quotes: {
    total_quotes: number;
    pending_quotes: number;
    approved_quotes: number;
    rejected_quotes: number;
  };
  revenue: {
    total_value: number;
    average_quote_value: number;
    currency: string;
  };
  win_loss: {
    total_won: number;
    total_lost: number;
    win_rate: number;
    won_value: number;
    lost_value: number;
  };
  margins: {
    average_margin: number;
    min_margin: number;
    max_margin: number;
  };
  approvals: {
    pending_approvals: number;
    avg_approval_time_hours: number;
  };
  agreements: {
    total_active_agreements: number;
    agreement_utilization_rate: number;
    quotes_using_agreements: number;
  };
  trends: {
    quotes_change_percent: number;
    revenue_change_percent: number;
    approved_change_percent: number;
    pending_change_percent: number;
  };
  revenue_time_series: TimeSeriesPoint[];
}

export interface WinLossByMonth {
  month: string;
  won: number;
  lost: number;
}

export interface WinLossByClient {
  client_name: string;
  won: number;
  lost: number;
  win_rate: number;
}

export interface WinLossByReason {
  reason: string;
  count: number;
}

export interface WinLossAnalysis {
  by_month: WinLossByMonth[];
  by_client: WinLossByClient[];
  by_reason: WinLossByReason[];
}

export interface MarginByMaterial {
  material_code: string;
  avg_margin: number;
  quote_count: number;
}

export interface MarginByClient {
  client_name: string;
  avg_margin: number;
  quote_count: number;
}

export interface MarginDistribution {
  '0-10%': number;
  '10-20%': number;
  '20-30%': number;
  '30%+': number;
}

export interface MarginAnalysis {
  overall_margin: number;
  by_material: MarginByMaterial[];
  by_client: MarginByClient[];
  margin_distribution: MarginDistribution;
}

export interface AgreementUtilizationItem {
  agreement_id: string;
  client_name: string;
  material_code: string | null;
  category: string | null;
  usage_count: number;
  total_value: number;
  utilization_rate: number;
}

export interface AgreementUtilization {
  total_agreements: number;
  active_agreements: number;
  utilization: AgreementUtilizationItem[];
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const json = await apiRequest<any>(endpoint, options);
  return (json as any)?.data ?? json;
}

export async function getDashboardMetrics(startDate?: string, endDate?: string): Promise<DashboardMetrics> {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  
  const query = params.toString() ? `?${params.toString()}` : '';
  return request<DashboardMetrics>(`/analytics/dashboard${query}`);
}

export async function getWinLossAnalysis(startDate?: string, endDate?: string): Promise<WinLossAnalysis> {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  
  const query = params.toString() ? `?${params.toString()}` : '';
  return request<WinLossAnalysis>(`/analytics/win-loss${query}`);
}

export async function getMarginAnalysis(clientId?: string, startDate?: string, endDate?: string): Promise<MarginAnalysis> {
  const params = new URLSearchParams();
  if (clientId) params.append('client_id', clientId);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  
  const query = params.toString() ? `?${params.toString()}` : '';
  return request<MarginAnalysis>(`/analytics/margins${query}`);
}

export async function getAgreementUtilization(): Promise<AgreementUtilization> {
  return request<AgreementUtilization>('/analytics/agreement-utilization');
}

export async function getMaterialCostTrends(materialId: string, startDate?: string, endDate?: string): Promise<any> {
  const params = new URLSearchParams();
  params.append('material_id', materialId);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  
  return request(`/analytics/material-costs?${params.toString()}`);
}

