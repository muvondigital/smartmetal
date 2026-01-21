// Admin API client functions
// Internal admin tooling endpoints

import { request as apiRequest } from '../api/client';

export interface AdminRfqSearchParams {
  tenantCode?: string;
  clientName?: string;
  rfqNumber?: string;
  rfqId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminRfq {
  id: string;
  title: string;
  description?: string;
  status: string;
  created_at: string;
  updated_at: string;
  project_type?: string;
  project_id: string;
  project_name: string;
  client_id: string;
  client_name: string;
  total_items: number;
}

export interface AdminRfqDetail extends AdminRfq {
  items: any[];
  pricing_runs: Array<{
    id: string;
    status: string;
    total_price: number;
    created_at: string;
    approval_status: string;
  }>;
  approvals: any[];
  agreements: any[];
  extraction_metadata?: {
    id: string;
    file_name: string;
    extraction_method: string;
    confidence_score: number;
    created_at: string;
    needs_review: boolean;
  } | null;
}

export interface AdminPricingRunDetail {
  pricing_run: any;
  approval_history: any;
  linked_agreements: any[];
}

export interface AdminAgreementDetail {
  agreement: any;
  related_pricing_run: any;
  related_rfq: any;
}

async function request<T>(endpoint: string, options?: RequestInit, tenantCode?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (tenantCode) {
    headers['X-Tenant-Code'] = tenantCode.toLowerCase();
  }

  // Generate request ID for correlation
  const requestId = crypto.randomUUID();
  headers['X-Request-Id'] = requestId;

  const result = await apiRequest<any>(endpoint, {
    ...options,
    headers,
  });

  return (result?.data ?? result) as T;
}

/**
 * Search RFQs with filters
 */
export async function searchRfqs(params: AdminRfqSearchParams): Promise<{ rfqs: AdminRfq[]; count: number }> {
  const queryParams = new URLSearchParams();
  
  if (params.tenantCode) queryParams.append('tenantCode', params.tenantCode);
  if (params.clientName) queryParams.append('clientName', params.clientName);
  if (params.rfqNumber) queryParams.append('rfqNumber', params.rfqNumber);
  if (params.rfqId) queryParams.append('rfqId', params.rfqId);
  if (params.status) queryParams.append('status', params.status);
  if (params.dateFrom) queryParams.append('dateFrom', params.dateFrom);
  if (params.dateTo) queryParams.append('dateTo', params.dateTo);

  const queryString = queryParams.toString();
  const endpoint = `/admin/rfqs${queryString ? `?${queryString}` : ''}`;

  return request<{ rfqs: AdminRfq[]; count: number }>(endpoint, {
    method: 'GET',
  }, params.tenantCode);
}

/**
 * Get detailed RFQ information
 */
export async function getAdminRfqDetail(rfqId: string, tenantCode?: string): Promise<AdminRfqDetail> {
  return request<AdminRfqDetail>(`/admin/rfqs/${rfqId}`, {
    method: 'GET',
  }, tenantCode);
}

/**
 * Re-extract (re-run material matching) for an RFQ
 */
export async function reExtractRfq(rfqId: string, tenantCode?: string): Promise<{
  success: boolean;
  rfq_id: string;
  items_processed: number;
  items_updated: number;
  matches: any[];
}> {
  return request(`/admin/rfqs/${rfqId}/reextract`, {
    method: 'POST',
  }, tenantCode);
}

/**
 * Re-price (create new pricing run) for an RFQ
 */
export async function rePriceRfq(rfqId: string, tenantCode?: string): Promise<{
  success: boolean;
  pricing_run: {
    id: string;
    rfq_id: string;
    status: string;
    total_price: number;
    created_at: string;
    item_count: number;
  };
}> {
  return request(`/admin/rfqs/${rfqId}/reprice`, {
    method: 'POST',
  }, tenantCode);
}

/**
 * Get detailed pricing run information
 */
export async function getAdminPricingRunDetail(pricingRunId: string, tenantCode?: string): Promise<AdminPricingRunDetail> {
  return request<AdminPricingRunDetail>(`/admin/pricing-runs/${pricingRunId}`, {
    method: 'GET',
  }, tenantCode);
}

/**
 * Get detailed agreement information
 */
export async function getAdminAgreementDetail(agreementId: string, tenantCode?: string): Promise<AdminAgreementDetail> {
  return request<AdminAgreementDetail>(`/admin/agreements/${agreementId}`, {
    method: 'GET',
  }, tenantCode);
}

