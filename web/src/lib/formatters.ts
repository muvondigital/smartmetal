/**
 * Formatting Utilities
 * 
 * Common formatting functions used throughout the application.
 */

/**
 * Format a number as currency
 * @param value The number to format
 * @param currencyOrOptions Either a currency code string (e.g., 'USD', 'MYR') or an options object
 */
export function formatCurrency(
  value: number, 
  currencyOrOptions?: string | {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  // Handle legacy string currency parameter
  if (typeof currencyOrOptions === 'string') {
    const currency = currencyOrOptions || 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }
  
  // Handle options object
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: currencyOrOptions?.minimumFractionDigits ?? 0,
    maximumFractionDigits: currencyOrOptions?.maximumFractionDigits ?? 0,
  }).format(value);
}

/**
 * Format a number as a compact currency (e.g., $1.2M, $450K)
 */
export function formatCompactCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  } else {
    return formatCurrency(value);
  }
}

/**
 * Format a date string to a readable format
 */
export function formatDate(dateString: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  // Handle null, undefined, or empty string
  if (!dateString) {
    return 'N/A';
  }
  
  const date = new Date(dateString);
  
  // Check if date is invalid
  if (isNaN(date.getTime())) {
    return 'N/A';
  }
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(date);
}

/**
 * Format a name to Title Case (e.g., "john smith" -> "John Smith")
 * Useful for client/customer names, company names, etc.
 */
export function toTitleCase(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean) // Remove empty strings from multiple spaces
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

