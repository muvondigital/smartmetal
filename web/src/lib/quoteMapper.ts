/**
 * Quote Mapper
 * 
 * Maps database pricing_run rows to the Quote type used by the dashboard and detail pages.
 * Centralizes all mapping logic so it's easy to adjust in one place.
 */

import { Quote } from '../components/dashboard/DataTable';
import { mapDbStatusToUiStatus } from './statusHelpers';

/**
 * Maps a database pricing_run row to a Quote object
 * @param dbRow - Raw pricing_run row from database (may include joined RFQ/customer data)
 * @returns Quote object for UI consumption
 */
export function mapPricingRunToQuote(dbRow: any): Quote {
  // Determine next action based on status
  const nextAction = determineNextAction(dbRow.status);

  const subtotal =
    dbRow.subtotal != null ? parseFloat(dbRow.subtotal) : null;
  const taxAmount =
    dbRow.tax_amount != null ? parseFloat(dbRow.tax_amount) : null;
  const taxRate =
    dbRow.tax_rate != null ? parseFloat(dbRow.tax_rate) : null;
  const totalWithTax =
    dbRow.total_with_tax != null
      ? parseFloat(dbRow.total_with_tax)
      : dbRow.total_price
      ? parseFloat(dbRow.total_price)
      : null;

  return {
    id: dbRow.id,
    name: dbRow.rfq_title || dbRow.title || `Pricing Run ${dbRow.id?.substring(0, 8)}`,
    revision: 'v1.0', // TODO: Add revision tracking to pricing_runs table
    customer: dbRow.client_name || dbRow.customer_name || 'N/A',
    customer_name: dbRow.client_name || dbRow.customer_name,
    // Prefer tax-inclusive total if available
    total: totalWithTax ?? (dbRow.total_price ? parseFloat(dbRow.total_price) : 0),
    status: mapDbStatusToUiStatus(dbRow.status || 'draft'),
    createdOn: dbRow.created_at,
    created_at: dbRow.created_at,
    approvedOn: dbRow.approved_at || null, // TODO: Add approved_at to pricing_runs table
    nextAction,

    // Tax fields
    subtotal,
    taxAmount,
    taxRate,
    taxType: dbRow.tax_type || null,
    taxCountry: dbRow.tax_country || null,
    totalWithTax,
  };
}

/**
 * Determines the next action for a quote based on its status
 */
function determineNextAction(status: string): string {
  const normalizedStatus = (status || '').toLowerCase();
  
  switch (normalizedStatus) {
    case 'draft':
      return 'Continue Pricing';
    case 'completed':
      return 'Review';
    case 'pending':
    case 'submitted':
      return 'Approve';
    case 'approved':
      return 'Generate Agreement';
    default:
      return 'Review';
  }
}

