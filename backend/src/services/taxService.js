const { connectDb } = require('../db/supabaseClient');

/**
 * Tax Calculation Service
 *
 * Handles tax calculations for Malaysia SST, Indonesia VAT, and other jurisdictions.
 * Supports tax-exempt items and categories.
 */

/**
 * Get active tax rule for a country
 * @param {string} country - Country code (MY, ID, SG)
 * @returns {Promise<Object>} Tax rule object
 */
async function getActiveTaxRule(country) {
  const db = await connectDb();

  const result = await db.query(
    `SELECT * FROM tax_rules
     WHERE country = $1
       AND is_active = true
       AND effective_from <= CURRENT_DATE
       AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
     ORDER BY effective_from DESC
     LIMIT 1`,
    [country]
  );

  return result.rows[0] || null;
}

/**
 * Check if a category is tax-exempt
 * @param {string} country - Country code
 * @param {string} categoryCode - Category code to check
 * @returns {Promise<Object|null>} Exemption details or null
 */
async function getTaxExemption(country, categoryCode) {
  const db = await connectDb();

  const result = await db.query(
    `SELECT * FROM tax_exemption_categories
     WHERE country = $1
       AND category_code = $2
       AND is_active = true
     LIMIT 1`,
    [country, categoryCode]
  );

  return result.rows[0] || null;
}

/**
 * Calculate tax for a single line item
 * @param {Object} item - Line item with amount and tax info
 * @param {Object} taxRule - Tax rule to apply
 * @returns {Object} Tax calculation result
 */
function calculateItemTax(item, taxRule) {
  const subtotal = parseFloat(item.total_price || 0);

  // Check if item is tax-exempt
  if (item.tax_exempt) {
    return {
      subtotal,
      tax_rate: 0,
      tax_amount: 0,
      total_with_tax: subtotal,
      tax_exempt: true,
      exemption_reason: item.exemption_reason || 'Tax exempt'
    };
  }

  // Apply tax rate
  const tax_rate = parseFloat(taxRule.tax_rate);
  const tax_amount = subtotal * tax_rate;
  
  // Stage 1 finishing: Polish tax rounding - round tax amount to 2 decimals, then calculate total
  const roundedTaxAmount = parseFloat(tax_amount.toFixed(2));
  const total_with_tax = subtotal + roundedTaxAmount;

  return {
    subtotal,
    tax_rate,
    tax_amount: roundedTaxAmount,
    total_with_tax: parseFloat(total_with_tax.toFixed(2)),
    tax_exempt: false
  };
}

/**
 * Calculate tax for an entire pricing run
 * @param {Object} pricingRun - Pricing run object
 * @param {Array} items - Array of pricing run items
 * @param {string} country - Country code (defaults to MY)
 * @returns {Promise<Object>} Tax calculation summary
 */
async function calculatePricingRunTax(pricingRun, items, country = 'MY') {
  // Get active tax rule for country
  const taxRule = await getActiveTaxRule(country);

  if (!taxRule) {
    // No tax rule found, return without tax
    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.total_price || 0), 0);
    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax_amount: 0,
      tax_rate: 0,
      total_with_tax: parseFloat(subtotal.toFixed(2)),
      tax_country: country,
      tax_type: null,
      tax_name: 'No tax applicable',
      items: items.map(item => ({
        ...item,
        subtotal: parseFloat(item.total_price || 0),
        tax_amount: 0,
        tax_rate: 0,
        total_with_tax: parseFloat(item.total_price || 0),
        tax_exempt: true,
        exemption_reason: 'No tax rule for country'
      }))
    };
  }

  // Calculate tax for each item
  const itemsWithTax = items.map(item => {
    const taxCalc = calculateItemTax(item, taxRule);
    return {
      ...item,
      ...taxCalc
    };
  });

  // Calculate totals
  const subtotal = itemsWithTax.reduce((sum, item) => sum + item.subtotal, 0);
  const taxAmount = itemsWithTax.reduce((sum, item) => sum + item.tax_amount, 0);
  const totalWithTax = subtotal + taxAmount;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    tax_amount: parseFloat(taxAmount.toFixed(2)),
    tax_rate: taxRule.tax_rate,
    total_with_tax: parseFloat(totalWithTax.toFixed(2)),
    tax_country: country,
    tax_type: taxRule.tax_type,
    tax_name: taxRule.tax_name,
    items: itemsWithTax
  };
}

/**
 * Get tax breakdown for display
 * @param {Object} taxCalculation - Result from calculatePricingRunTax
 * @returns {Object} Formatted tax breakdown
 */
function getTaxBreakdown(taxCalculation) {
  const { subtotal, tax_amount, tax_rate, total_with_tax, tax_name, tax_type } = taxCalculation;

  const taxPercentage = (tax_rate * 100).toFixed(2);

  return {
    subtotal: {
      label: 'Subtotal',
      amount: subtotal,
      formatted: formatCurrency(subtotal)
    },
    tax: {
      label: `${tax_name || tax_type} (${taxPercentage}%)`,
      amount: tax_amount,
      formatted: formatCurrency(tax_amount),
      rate: tax_rate,
      percentage: taxPercentage
    },
    total: {
      label: 'Total (incl. tax)',
      amount: total_with_tax,
      formatted: formatCurrency(total_with_tax)
    }
  };
}

/**
 * Format currency with proper locale support
 * Stage 1 finishing: Enhanced currency formatting for MYR, USD, IDR
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (USD, MYR, IDR)
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = 'USD') {
  // Determine locale based on currency
  const localeMap = {
    'USD': 'en-US',
    'MYR': 'en-MY',
    'IDR': 'id-ID',
  };
  
  const locale = localeMap[currency] || 'en-US';
  
  // IDR typically doesn't show decimals
  const minimumFractionDigits = currency === 'IDR' ? 0 : 2;
  const maximumFractionDigits = currency === 'IDR' ? 0 : 2;
  
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(amount);
  } catch (error) {
    // Fallback to simple formatting
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Determine country from client or default
 * @param {string} clientId - Client UUID
 * @returns {Promise<string>} Country code
 */
async function getClientCountry(clientId) {
  if (!clientId) {
    return 'MY'; // Default to Malaysia
  }

  // Validate UUID format
  if (typeof clientId !== 'string' || clientId.trim() === '') {
    return 'MY';
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(clientId.trim())) {
    return 'MY';
  }

  const db = await connectDb();

  try {
    // Check if country column exists
    const columnCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'country'
      );
    `);
    const hasCountryColumn = columnCheck.rows[0].exists;

    if (hasCountryColumn) {
      const result = await db.query(
        `SELECT country FROM clients WHERE id = $1`,
        [clientId.trim()]
      );
      return result.rows[0]?.country || 'MY';
    }
  } catch (error) {
    console.warn('Could not fetch client country:', error.message);
  }

  return 'MY'; // Default to Malaysia
}

/**
 * Check if client is tax-exempt
 * @param {string} clientId - Client UUID
 * @returns {Promise<boolean>}
 */
async function isClientTaxExempt(clientId) {
  if (!clientId) {
    return false;
  }

  // Validate UUID format
  if (typeof clientId !== 'string' || clientId.trim() === '') {
    return false;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(clientId.trim())) {
    return false;
  }

  const db = await connectDb();

  try {
    // Check if tax_exempt column exists
    const columnCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients' 
        AND column_name = 'tax_exempt'
      );
    `);
    const hasTaxExemptColumn = columnCheck.rows[0].exists;

    if (hasTaxExemptColumn) {
      const result = await db.query(
        `SELECT tax_exempt FROM clients WHERE id = $1`,
        [clientId.trim()]
      );
      return result.rows[0]?.tax_exempt || false;
    }
  } catch (error) {
    console.warn('Could not fetch client tax exemption status:', error.message);
  }

  return false;
}

module.exports = {
  getActiveTaxRule,
  getTaxExemption,
  calculateItemTax,
  calculatePricingRunTax,
  getTaxBreakdown,
  getClientCountry,
  isClientTaxExempt
};
