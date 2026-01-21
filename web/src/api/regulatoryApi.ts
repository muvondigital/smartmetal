/**
 * Regulatory API
 * 
 * API wrapper functions for regulatory data including HS codes
 */

import { request } from './client';
import { HsCodeSearchResult } from '../types/regulatory';

/**
 * Search HS codes by keyword or HS code
 * @param query - Search query string
 * @returns Array of matching HS codes
 */
export async function searchHsCodes(query: string): Promise<HsCodeSearchResult[]> {
  try {
    const response = await request<{ success: boolean; data: HsCodeSearchResult[] }>(
      '/regulatory/search-hs',
      {
        method: 'POST',
        body: JSON.stringify({ query }),
      }
    );
    
    // Handle both response formats
    if (response.success && response.data) {
      return response.data;
    }
    // If response is directly an array
    if (Array.isArray(response)) {
      return response;
    }
    return [];
  } catch (error) {
    console.error('Error searching HS codes:', error);
    throw error;
  }
}

/**
 * Map material description to HS code
 * @param materialDescription - Material description string
 * @param options - Optional mapping options
 * @returns Mapping result with HS code and metadata
 */
export async function mapHsCode(
  materialDescription: string,
  options?: { includeDebug?: boolean }
): Promise<{
  success: boolean;
  hsCode: string | null;
  matchSource: string;
  confidence: number | null;
  importDutyRate?: number | null;
}> {
  return request('/regulatory/map-hs-code', {
    method: 'POST',
    body: JSON.stringify({
      materialDescription,
      options: options || {},
    }),
  });
}

/**
 * Get trade agreement information for a country
 * @param country - ISO country code (e.g., 'TH', 'CN', 'US')
 * @returns Agreement information with detected agreement and sample rates
 */
export async function getTradeAgreement(country: string): Promise<{
  success: boolean;
  country: string;
  agreement: string;
  hasPreferentialRates: boolean;
  sampleRates: Record<string, number>;
}> {
  return request(`/regulatory/agreement/${country}`);
}

