import { request as apiRequest } from '../api/client';

export interface ApprovalHistoryItem {
  id: string;
  pricing_run_id: string;
  action: 'submitted' | 'approved' | 'rejected' | 'revision_requested';
  actor_id: string | null;
  actor_name: string;
  actor_email: string | null;
  notes: string | null;
  previous_status: string | null;
  new_status: string;
  created_at: string;
}

export interface PendingApproval {
  pricing_run_id: string;
  rfq_title: string;
  client_name: string;
  total_price: number;
  submitted_at: string;
  submitted_by: string;
  days_pending: number;
  ai_risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  ai_risk_score?: number;
  ai_recommendation?: 'AUTO_APPROVE' | 'MANUAL_REVIEW';
  ai_rationale?: string;
  ai_key_points?: string[];
  ai_warnings?: string[];
  ai_confidence?: number;
}

export interface SubmitApprovalRequest {
  submitted_by: string;
  submitted_by_email?: string;
  submitted_by_id?: string;
  notes?: string;
}

export interface ApproveRequest {
  approver_id?: string;
  approver_name: string;
  approver_email: string;
  notes?: string;
}

export interface RejectRequest {
  approver_id?: string;
  approver_name: string;
  approver_email: string;
  rejection_reason: string;
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const result = await apiRequest<any>(endpoint, options);

  if (result?.success === false) {
    const message =
      result?.error?.message || result?.error?.details || result?.error || 'Request failed';
    throw new Error(message);
  }

  if (result?.pending_approvals) {
    return result.pending_approvals as T;
  }

  if (result?.history) {
    return result.history as T;
  }

  return (result?.data ?? result) as T;
}

export async function submitForApproval(pricingRunId: string, data: SubmitApprovalRequest): Promise<any> {
  return request(`/approvals/submit/${pricingRunId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function approvePricingRun(pricingRunId: string, data: ApproveRequest): Promise<any> {
  return request(`/approvals/approve/${pricingRunId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function rejectPricingRun(pricingRunId: string, data: RejectRequest): Promise<any> {
  return request(`/approvals/reject/${pricingRunId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getPendingApprovals(): Promise<PendingApproval[]> {
  const response = await request<{ pending_approvals?: PendingApproval[]; data?: PendingApproval[] }>('/approvals/pending');
  return response.pending_approvals || response.data || [];
}

export async function getApprovalHistory(pricingRunId: string): Promise<ApprovalHistoryItem[]> {
  const response = await request<{ history?: ApprovalHistoryItem[]; data?: ApprovalHistoryItem[] }>(`/approvals/history/${pricingRunId}`);
  return response.history || response.data || [];
}

export async function getMyApprovalQueue(): Promise<PendingApproval[]> {
  const response = await request<{ pending_approvals?: PendingApproval[]; data?: PendingApproval[] }>('/approvals/my-queue');
  return response.pending_approvals || response.data || [];
}

export interface AIAssessment {
  pricing_run_id: string;
  assessed_at: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_score: number;
  auto_approve_eligible: boolean;
  recommendation: 'AUTO_APPROVE' | 'MANUAL_REVIEW';
  confidence: number;
  risk_factors: {
    margin_deviation?: {
      score: number;
      current_margin: number;
      historical_margin: number;
      deviation: number;
    };
    credit_risk?: {
      score: number;
      credit_score: number;
      risk_factors: string[];
    };
    anomalies?: {
      score: number;
      detected: string[];
    };
    availability?: {
      score: number;
      issues: string[];
    };
  };
  ai_rationale?: string;
  ai_key_points?: string[];
  ai_warnings?: string[];
  quote_summary: {
    total_price: number;
    item_count: number;
    client_name: string;
    rfq_title: string;
  };
}

export async function getAIRiskAssessment(pricingRunId: string): Promise<AIAssessment> {
  return request<AIAssessment>(`/ai/approval-risk/${pricingRunId}`);
}

export interface AIApprovalStats {
  total_assessed: number;
  auto_approve_recommended: number;
  auto_approved: number;
  manually_approved: number;
  rejected: number;
  auto_approval_rate: string;
  avg_risk_score: string;
  avg_approval_time_hours: string;
  date_range_days: number;
}

export async function getAIApprovalStats(days?: number): Promise<AIApprovalStats> {
  const params = days ? `?days=${days}` : '';
  return request<AIApprovalStats>(`/ai/approval-stats${params}`);
}

export interface OverrideRequest {
  pricing_run_id: string;
  override_reason: string;
  action: 'approve' | 'reject';
  approver: {
    name: string;
    email?: string;
  };
}

export async function overrideAIDecision(data: OverrideRequest): Promise<any> {
  return request('/ai/approval-override', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

