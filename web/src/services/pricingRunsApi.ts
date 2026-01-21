import { request as apiRequest } from '../api/client';

export interface PricingRunItem {
  id: string;
  pricing_run_id: string;
  rfq_item_id: string;
  material_id: string | null;
  material_code: string | null;
  description: string;
  quantity: number;
  unit: string;
  base_cost: number;
  markup_pct: number;
  logistics_cost: number;
  risk_pct: number;
  unit_price: number;
  total_price: number;
  currency: string;
  origin_type: string | null;
  pricing_method: string | null;
  price_agreement_id: string | null;
  agreement_reference?: string;
  created_at: string;
  // Stage 3: Dual-origin pricing data
  dual_pricing_data?: any; // JSONB from backend
  origin_selection_data?: any; // JSONB from backend
  rfq_item_description?: string;
  rfq_item_quantity?: number;
  rfq_item_unit?: string;
  rfq_item_material_code?: string;
  // HS Code duty fields (Phase 4)
  import_duty_amount?: number | null;
  hs_code?: string | null;
  // Final duty fields (Phase 5)
  final_import_duty_amount?: number | null;
  origin_country?: string | null;
}

export interface PricingRun {
  id: string;
  rfq_id: string;
  status: string;
  total_price: number;
  currency: string;
  approval_status: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  outcome: string | null;
  won_lost_date: string | null;
  outcome_notes: string | null;
  parent_version_id: string | null;
  version_number: number;
  is_current?: boolean;
  is_locked?: boolean;
  locked_at?: string | null;
  locked_by?: string | null;
  superseded_by?: string | null;
  superseded_reason?: string | null;
  created_at: string;
  updated_at: string;
  items?: PricingRunItem[];
  // Duty fields (Phase 4)
  total_import_duty?: number | null;
  freight_cost?: number | null;
  other_charges?: number | null;
  // Final duty fields (Phase 5)
  total_final_import_duty?: number | null;
}

export interface CreatePricingRunResponse {
  success: boolean;
  pricing_run: PricingRun;
}

export interface UpdateOutcomeRequest {
  outcome: 'won' | 'lost';
  notes?: string;
}

export interface UpdateOutcomeResponse {
  success: boolean;
  message: string;
  pricing_run: PricingRun;
}

export interface CreateRevisionRequest {
  reason: string;
  created_by?: string;
}

export interface CreateRevisionResponse {
  success: boolean;
  message: string;
  pricing_run: PricingRun;
}

export interface PricingRunVersion {
  id: string;
  pricing_run_id: string;
  version_number: number;
  snapshot_data: any;
  revision_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface VersionsResponse {
  success: boolean;
  count: number;
  versions: PricingRunVersion[];
}

export interface VersionSnapshot {
  version_number: number;
  pricing_run_id: string;
  snapshot_data: any;
  revision_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SnapshotsResponse {
  success: boolean;
  count: number;
  snapshots: VersionSnapshot[];
}

export interface VersionComparison {
  version1: number;
  version2: number;
  changes: {
    field: string;
    old_value: any;
    new_value: any;
  }[];
}

export interface ComparisonResponse {
  success: boolean;
  comparison: VersionComparison;
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const result = await apiRequest<any>(endpoint, options);
  if (result?.data !== undefined) {
    return result.data as T;
  }
  return result as T;
}

/**
 * Get all pricing runs for an RFQ
 */
export async function getPricingRunsByRfqId(rfqId: string): Promise<PricingRun[]> {
  return request<PricingRun[]>(`/v1/pricing-runs/rfq/${rfqId}`);
}

/**
 * Get a pricing run by ID with its items
 */
export async function getPricingRunById(id: string): Promise<PricingRun> {
  return request<PricingRun>(`/v1/pricing-runs/${id}`);
}

/**
 * Create a new pricing run for an RFQ
 */
export async function createPricingRun(rfqId: string): Promise<PricingRun> {
  const response = await request<CreatePricingRunResponse>(`/v1/pricing-runs/rfq/${rfqId}`, {
    method: 'POST',
  });
  return response.pricing_run || response as any;
}

export async function lockPricingRun(id: string, lockedBy?: string): Promise<PricingRun> {
  return request<PricingRun>(`/v1/pricing-runs/${id}/lock`, {
    method: 'POST',
    body: JSON.stringify({ locked_by: lockedBy }),
  });
}

/**
 * Update pricing run outcome (won/lost)
 */
export async function updatePricingRunOutcome(
  id: string,
  outcome: 'won' | 'lost',
  notes?: string
): Promise<PricingRun> {
  const response = await request<UpdateOutcomeResponse>(`/v1/pricing-runs/${id}/outcome`, {
    method: 'PUT',
    body: JSON.stringify({ outcome, notes }),
  });
  return response.pricing_run;
}

/**
 * Create a revision of a pricing run
 */
export async function createPricingRunRevision(
  id: string,
  reason: string,
  createdBy?: string
): Promise<PricingRun> {
  const response = await request<CreateRevisionResponse>(`/v1/pricing-runs/${id}/revisions`, {
    method: 'POST',
    body: JSON.stringify({ reason, created_by: createdBy }),
  });
  return response.pricing_run;
}

/**
 * Get all versions (revisions) of a pricing run
 */
export async function getPricingRunVersions(id: string): Promise<PricingRunVersion[]> {
  const response = await request<VersionsResponse>(`/v1/pricing-runs/${id}/versions`);
  return response.versions;
}

/**
 * Get all version snapshots for a pricing run
 */
export async function getVersionSnapshots(id: string): Promise<VersionSnapshot[]> {
  const response = await request<SnapshotsResponse>(`/v1/pricing-runs/${id}/version-snapshots`);
  return response.snapshots;
}

/**
 * Compare two versions of a pricing run
 */
export async function compareVersions(
  id: string,
  version1: number,
  version2?: number
): Promise<VersionComparison> {
  const queryParams = new URLSearchParams({
    version1: version1.toString(),
    ...(version2 !== undefined && { version2: version2.toString() }),
  });

  const response = await request<ComparisonResponse>(
    `/v1/pricing-runs/${id}/compare-versions?${queryParams.toString()}`
  );
  return response.comparison;
}
