/**
 * Price Import API Service
 * 
 * Functions to interact with price import and price history endpoints
 * Part of Phase 2: Manufacturer Price Management System
 */

import { request as apiRequest } from '../api/client';

export interface PriceChange {
  id: string;
  material_id: string;
  material_code: string;
  material_name: string;
  category: string;
  previous_base_cost: number | null;
  new_base_cost: number;
  price_change_pct: number | null;
  effective_date: string;
  source: string;
  uploaded_by: string;
  created_at: string;
}

export interface PriceChangeStats {
  total_changes: number;
  materials_affected: number;
  price_increases: number;
  price_decreases: number;
  unchanged: number;
  avg_change_pct: number | null;
  max_increase_pct: number | null;
  max_decrease_pct: number | null;
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const responseData = await apiRequest<any>(endpoint, options);

  if (responseData?.success === false) {
    const errorMessage =
      responseData.error || responseData.details || responseData.message || 'Request failed';
    throw new Error(errorMessage);
  }

  if (responseData?.data !== undefined) {
    return responseData.data as T;
  }
  if (responseData?.changes !== undefined) {
    return responseData.changes as T;
  }
  if (responseData?.stats !== undefined) {
    return responseData.stats as T;
  }

  return responseData as T;
}

/**
 * Get recent price changes for dashboard notifications
 * @param days Number of days to look back (default: 7)
 * @param limit Maximum number of records (default: 50)
 */
export async function getRecentPriceChanges(days: number = 7, limit: number = 50): Promise<PriceChange[]> {
  const params = new URLSearchParams();
  params.append('days', days.toString());
  params.append('limit', limit.toString());
  
  return request<PriceChange[]>(`/price-import/recent-changes?${params.toString()}`);
}

/**
 * Get price change statistics for dashboard
 * @param days Number of days to analyze (default: 7)
 */
export async function getPriceChangeStats(days: number = 7): Promise<PriceChangeStats> {
  const params = new URLSearchParams();
  params.append('days', days.toString());
  
  return request<PriceChangeStats>(`/price-import/stats?${params.toString()}`);
}

