/**
 * Status Helper Utilities
 * 
 * Helper functions for status badges and status-related operations.
 */

export type QuoteStatus = 'pending' | 'approved' | 'suspended' | 'draft' | 'on-hold';

/**
 * Get the CSS class for a status badge
 */
export function getStatusBadgeClass(status: QuoteStatus | string): string {
  const normalizedStatus = status.toLowerCase();
  
  switch (normalizedStatus) {
    case 'pending':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'approved':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'suspended':
    case 'on-hold':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    case 'draft':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

/**
 * Get a human-readable status label
 */
export function getStatusLabel(status: QuoteStatus | string): string {
  const normalizedStatus = status.toLowerCase();
  
  switch (normalizedStatus) {
    case 'on-hold':
      return 'On Hold';
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'suspended':
      return 'Suspended';
    case 'draft':
      return 'Draft';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/**
 * Maps database status values to UI status values
 * Handles various database status formats and normalizes them to QuoteStatus
 */
export function mapDbStatusToUiStatus(dbStatus: string | null | undefined): QuoteStatus {
  if (!dbStatus) {
    return 'draft';
  }
  
  const normalized = dbStatus.toLowerCase().trim();
  
  // Map common database statuses to UI statuses
  switch (normalized) {
    case 'pending':
    case 'submitted':
    case 'pending_approval':
      return 'pending';
    case 'approved':
      return 'approved';
    case 'suspended':
    case 'cancelled':
      return 'suspended';
    case 'on-hold':
    case 'on_hold':
    case 'hold':
      return 'on-hold';
    case 'draft':
    case 'in_progress':
    case 'completed': // Completed pricing runs are still "draft" quotes until approved
      return 'draft';
    default:
      return 'draft';
  }
}

