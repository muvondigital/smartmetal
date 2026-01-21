import { request } from '../api/client';

export interface QuoteCandidate {
  id: string;
  tenant_id: string;
  pricing_run_id: string;
  rfq_id: string;
  client_id: string | null;
  customer_name: string | null;
  total_value: number;
  approved_at: string | null;
  status: 'pending' | 'converted' | 'dismissed';
  converted_price_agreement_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields from pricing_runs
  version_number: number;
  is_current: boolean;
  approval_status: string;
  approved_by: string | null;
  // Joined fields from rfqs
  rfq_number?: string;
  rfq_name?: string;
}

export interface QuoteCandidatesResponse {
  success: boolean;
  data: QuoteCandidate[];
}

export interface UpdateQuoteCandidateRequest {
  status: 'pending' | 'converted' | 'dismissed';
  converted_price_agreement_id?: string;
}

/**
 * Get quote candidates for the current tenant
 * @param status Optional status filter
 */
export async function getQuoteCandidates(status?: 'pending' | 'converted' | 'dismissed'): Promise<QuoteCandidate[]> {
  const params = new URLSearchParams();
  if (status) {
    params.append('status', status);
  }
  
  const response = await request<QuoteCandidatesResponse>(`/quote-candidates?${params.toString()}`);
  return response.data;
}

/**
 * Update quote candidate status
 */
export async function updateQuoteCandidateStatus(
  candidateId: string,
  updates: UpdateQuoteCandidateRequest
): Promise<QuoteCandidate> {
  const response = await request<{ success: boolean; data: QuoteCandidate }>(
    `/quote-candidates/${candidateId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );
  return response.data;
}

