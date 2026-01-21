import { formatDistanceToNow } from 'date-fns';

/**
 * Format a date string to a relative time format (e.g., "3 days ago")
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

/**
 * Map RFQ status to Badge variant
 */
export function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline' {
  const normalizedStatus = status?.toLowerCase() || 'draft';

  switch (normalizedStatus) {
    case 'draft':
      return 'secondary';
    case 'submitted':
    case 'pending':
      return 'warning';
    case 'approved':
      return 'success';
    case 'rejected':
      return 'destructive';
    default:
      return 'secondary';
  }
}

/**
 * Format status display text (capitalize first letter)
 */
export function formatStatusText(status: string): string {
  if (!status) return 'Draft';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export function cleanFilename(name?: string | null): string {
  if (!name) return '';
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  const normalized = withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
    .join(' ')
    .trim();
}

/**
 * Get document type prefix for display codes
 * Uses actual document type instead of hardcoding "RFQ"
 */
export function getDocumentTypePrefix(documentType?: string | null): string {
  const abbreviations: Record<string, string> = {
    'RFQ': 'RFQ',
    'PO': 'PO',
    'MTO': 'MTO',
    'BOQ': 'BOQ',
    'Budget': 'BUDGET',
    'Tender': 'TENDER',
    'Change Order': 'CO',
    'Re-quote': 'REQUOTE'
  };

  return abbreviations[documentType || 'RFQ'] || 'RFQ';
}

/**
 * Get document type display label
 * Returns human-friendly label for document type
 */
export function getDocumentTypeLabel(documentType?: string | null): string {
  const labels: Record<string, string> = {
    'RFQ': 'Request for Quotation',
    'PO': 'Purchase Order',
    'MTO': 'Material Take-Off',
    'BOQ': 'Bill of Quantities',
    'Budget': 'Budget Estimate',
    'Tender': 'Tender',
    'Change Order': 'Change Order',
    'Re-quote': 'Re-quote'
  };

  return labels[documentType || 'RFQ'] || 'Commercial Request';
}

export function getDisplayRfqCode(rfq: {
  rfq_code?: string | null;
  id: string | number;
  document_type?: string | null;
}): string {
  const code = rfq.rfq_code?.trim();
  if (code) return code;

  const idStr = String(rfq.id || '');
  const shortId = idStr.length > 8 ? idStr.slice(0, 8).toUpperCase() : idStr.toUpperCase();
  const prefix = getDocumentTypePrefix(rfq.document_type);
  return `${prefix}-${shortId || 'UNKNOWN'}`;
}

export function getDisplayRfqTitle(rfq: {
  title?: string | null;
  customer_name?: string | null;
  client_name?: string | null;
  project_name?: string | null;
  original_filename?: string | null;
  rfq_code?: string | null;
  id: string | number;
  document_type?: string | null;
}): string {
  const title = rfq.title?.trim();
  if (title) return title;

  const customer = (rfq.customer_name || rfq.client_name || '').trim();
  const project = (rfq.project_name || '').trim();
  const cleanedFile = cleanFilename(rfq.original_filename);
  const docTypeLabel = getDocumentTypeLabel(rfq.document_type);

  if (customer && project) {
    return `${customer} – ${project}`;
  }

  if (customer && cleanedFile) {
    return `${customer} – ${cleanedFile}`;
  }

  if (cleanedFile) {
    return cleanedFile;
  }

  if (customer) {
    return `${docTypeLabel} for ${customer}`;
  }

  return `${docTypeLabel} ${getDisplayRfqCode(rfq)}`;
}
