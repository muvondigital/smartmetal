// MUVOS Platform – SmartMetal CPQ runs on Muvon Unified Commercial Operating System
//
// This service operates within the MUVOS commercial operating system.
// SmartMetal is the AI-powered CPQ execution layer running on MUVOS.
//
// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Developed by Muvon Digital, the innovation arm of Muvon Energy.
// Copyright (c) 2025 Muvon Energy. All rights reserved.
// Proprietary & Confidential — Not for distribution.

const { connectDb, transaction } = require('../db/supabaseClient');
const { withTenantContext, withTenantTransaction } = require('../db/tenantContext');
const { AppError } = require('../middleware/errorHandler');
const { getMaterialByCode, getMaterialsByCodes } = require('./materialsService');
const { findBestPricingRule } = require('./pricingRulesService');
const { getRfqById } = require('./rfqService');
const { priceItemWithAgreementsV2 } = require('./pricingEngineV2');
const { getPipeWeightKgPerM } = require('./pipesService');
const {
  calculatePricingRunTax,
  getClientCountry,
  isClientTaxExempt
} = require('./taxService');
// originSelectionService removed - NSC manually selects suppliers per pricing option (A/B/C)
const { getRoundingRules, getPricingRulesConfig } = require('../config/tenantConfig');
const nscPricingRules = require('../config/pricingRules');

const WORKFLOW_ERROR_CODE = 'WORKFLOW_CONTRACT_VIOLATION';
function workflowViolation(message, details = {}) {
  return new AppError(message, 400, WORKFLOW_ERROR_CODE, details);
}

/**
 * Rounding utility functions for pricing
 * Stage 1 finishing: Rounding rules implementation
 */

/**
 * Round to nearest 10 (for Material prices)
 * @param {number} value - Value to round
 * @returns {number} Rounded value
 */
function roundToNearest10(value) {
  return Math.round(value / 10) * 10;
}

/**
 * Round to nearest 1 (for Fabrication prices)
 * @param {number} value - Value to round
 * @returns {number} Rounded value
 */
function roundToNearest1(value) {
  return Math.round(value);
}

/**
 * Determine if item is fabrication based on category or description
 * @param {string} category - Material category
 * @param {string} description - Item description
 * @returns {boolean} True if fabrication
 */
function isFabrication(category, description) {
  const fabricationCategories = ['FABRICATION', 'FAB', 'FABRICATED'];
  const fabricationKeywords = ['fabrication', 'fabricated', 'fabricate', 'fabricating', 'fabricator'];
  
  if (category && fabricationCategories.includes(category.toUpperCase())) {
    return true;
  }
  
  if (description) {
    const descLower = description.toLowerCase();
    return fabricationKeywords.some(keyword => descLower.includes(keyword));
  }
  
  return false;
}

/**
 * Apply rounding rules based on category and tenant configuration
 * - Material categories (PIPE, FLANGE, FITTING, etc.): Round to nearest 10 (or tenant config)
 * - Fabrication: Round to nearest 1 (or tenant config)
 * @param {number} price - Price to round
 * @param {string} category - Material category
 * @param {string} description - Item description
 * @param {Object} roundingRules - Rounding rules from tenant config
 * @returns {number} Rounded price
 */
function applyRoundingRules(price, category, description, roundingRules) {
  if (isFabrication(category, description)) {
    // Use tenant config if available, otherwise default to nearest_1
    if (roundingRules && roundingRules.fabrication === 'nearest_1') {
      return roundToNearest1(price);
    }
    return roundToNearest1(price);
  } else {
    // Material categories: use tenant config if available, otherwise default to nearest_10
    if (roundingRules && roundingRules.material === 'nearest_10') {
      return roundToNearest10(price);
    }
    return roundToNearest10(price);
  }
}

/**
 * Gets all pricing runs for an RFQ
 * @param {string} rfqId - RFQ UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Array>} Array of pricing run objects
 */
async function getPricingRunsByRfqId(rfqId, tenantId) {
  // Validate inputs - return empty array for invalid inputs instead of throwing
  // This prevents 500 errors when the frontend passes invalid/empty UUIDs
  if (rfqId === null || rfqId === undefined || rfqId === '' || typeof rfqId !== 'string') {
    console.warn(`[getPricingRunsByRfqId] Invalid rfqId: ${JSON.stringify(rfqId)} (tenantId: ${tenantId}). Returning empty array.`);
    return [];
  }
  if (tenantId === null || tenantId === undefined || tenantId === '' || typeof tenantId !== 'string') {
    console.warn(`[getPricingRunsByRfqId] Invalid tenantId: ${JSON.stringify(tenantId)} (rfqId: ${rfqId}). Returning empty array.`);
    return [];
  }

  // Trim and validate UUID format
  const trimmedRfqId = rfqId.trim();
  const trimmedTenantId = tenantId.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (trimmedRfqId === '') {
    console.warn(`[getPricingRunsByRfqId] Empty rfqId after trimming: "${rfqId}" (tenantId: ${tenantId}). Returning empty array.`);
    return [];
  }
  if (trimmedTenantId === '') {
    console.warn(`[getPricingRunsByRfqId] Empty tenantId after trimming: "${tenantId}" (rfqId: ${rfqId}). Returning empty array.`);
    return [];
  }

  if (!uuidRegex.test(trimmedRfqId)) {
    console.warn(`[getPricingRunsByRfqId] Invalid rfqId format: "${rfqId}" (tenantId: ${tenantId}). Expected a valid UUID. Returning empty array.`);
    return [];
  }
  if (!uuidRegex.test(trimmedTenantId)) {
    console.warn(`[getPricingRunsByRfqId] Invalid tenantId format: "${tenantId}" (rfqId: ${rfqId}). Expected a valid UUID. Returning empty array.`);
    return [];
  }

  // Final safety check before query
  console.log(`[getPricingRunsByRfqId] Executing query with rfqId="${trimmedRfqId}", tenantId="${trimmedTenantId}"`);

  // Use tenant context to ensure RLS policies are applied correctly
  const result = await withTenantContext(trimmedTenantId, async (client) => {
    return await client.query(
      `SELECT 
        pr.*,
        pr.version_number,
        pr.is_current,
        pr.superseded_by,
        pr.superseded_reason,
        pr.approval_status,
        pr.created_at
       FROM pricing_runs pr
       JOIN rfqs r ON pr.rfq_id = r.id
       WHERE pr.rfq_id = $1::uuid
       ORDER BY pr.version_number DESC, pr.created_at DESC`,
      [trimmedRfqId]
    );
  });
  return result.rows;
}

/**
 * Gets a pricing run with its items and related RFQ/customer information
 * @param {string} pricingRunId - Pricing run UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Object>} Pricing run with items, RFQ, and customer info
 */
async function getPricingRunById(pricingRunId, tenantId) {
  // Use tenant context to ensure RLS policies are applied correctly
  const runResult = await withTenantContext(tenantId, async (client) => {
    return await client.query(
      `SELECT
        pr.*,
        r.id as rfq_id,
        r.rfq_number as rfq_title,
        r.rfq_name as rfq_description,
        r.status as rfq_status,
        p.id as project_id,
        p.name as project_name,
        c.id as client_id,
        c.name as client_name,
        c.email as client_contact_email,
        c.phone as client_contact_phone
      FROM pricing_runs pr
      JOIN rfqs r ON pr.rfq_id = r.id
      JOIN projects p ON r.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE pr.id = $1`,
      [pricingRunId]
    );
  });

  if (runResult.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const pricingRun = runResult.rows[0];

  // Get pricing run items with RFQ item details and material details using tenant context
  const itemsResult = await withTenantContext(tenantId, async (client) => {
    return await client.query(
      `SELECT
        pri.*,
        ri.description as rfq_item_description,
        ri.quantity as rfq_item_quantity,
        ri.unit as rfq_item_unit,
        ri.material_code as rfq_item_material_code,
        m.material_code,
        m.category,
        m.grade,
        m.spec_standard,
        m.material_type,
        m.origin_type as material_origin_type,
        m.size_description,
        m.beam_type,
        m.beam_depth_mm,
        m.beam_weight_per_m_kg,
        m.od_mm,
        m.wall_thickness_mm,
        m.plate_thickness_mm,
        m.sku
      FROM pricing_run_items pri
      JOIN rfq_items ri ON pri.rfq_item_id = ri.id
      LEFT JOIN materials m ON pri.material_id = m.id
      WHERE pri.pricing_run_id = $1
      ORDER BY pri.created_at`,
      [pricingRunId]
    );
  });

  // Convert numeric fields from database (which may be strings) to numbers
  // Also sanitize to remove any circular references or non-serializable properties
  const { sanitizeForSerialization } = require('../utils/objectSerializer');
  
  const items = itemsResult.rows.map(item => {
    const cleanItem = {
      id: item.id,
      pricing_run_id: item.pricing_run_id,
      rfq_item_id: item.rfq_item_id,
      material_id: item.material_id,
      material_code: item.material_code,
      description: item.description,
      quantity: item.quantity != null ? parseFloat(item.quantity) : 0,
      unit: item.unit,
      base_cost: item.base_cost != null ? parseFloat(item.base_cost) : null,
      markup_pct: item.markup_pct != null ? parseFloat(item.markup_pct) : 0,
      logistics_cost: item.logistics_cost != null ? parseFloat(item.logistics_cost) : 0,
      risk_pct: item.risk_pct != null ? parseFloat(item.risk_pct) : 0,
      risk_cost: item.risk_cost != null ? parseFloat(item.risk_cost) : 0,
      unit_price: item.unit_price != null ? parseFloat(item.unit_price) : 0,
      total_price: item.total_price != null ? parseFloat(item.total_price) : 0,
      currency: item.currency,
      origin_type: item.origin_type,
      pricing_method: item.pricing_method,
      created_at: item.created_at,
      rfq_item_description: item.rfq_item_description,
      rfq_item_quantity: item.rfq_item_quantity != null ? parseFloat(item.rfq_item_quantity) : null,
      rfq_item_unit: item.rfq_item_unit,
      rfq_item_material_code: item.rfq_item_material_code,
      // Material details from materials table
      category: item.category,
      grade: item.grade,
      spec_standard: item.spec_standard,
      material_type: item.material_type,
      material_origin_type: item.material_origin_type,
      size_description: item.size_description,
      beam_type: item.beam_type,
      beam_depth_mm: item.beam_depth_mm != null ? parseFloat(item.beam_depth_mm) : null,
      beam_weight_per_m_kg: item.beam_weight_per_m_kg != null ? parseFloat(item.beam_weight_per_m_kg) : null,
      od_mm: item.od_mm != null ? parseFloat(item.od_mm) : null,
      wall_thickness_mm: item.wall_thickness_mm != null ? parseFloat(item.wall_thickness_mm) : null,
      plate_thickness_mm: item.plate_thickness_mm != null ? parseFloat(item.plate_thickness_mm) : null,
      sku: item.sku,
    };

    // Add optional fields if they exist
    if (item.import_duty_amount !== undefined) cleanItem.import_duty_amount = item.import_duty_amount;
    if (item.hs_code !== undefined) cleanItem.hs_code = item.hs_code;
    if (item.final_import_duty_amount !== undefined) cleanItem.final_import_duty_amount = item.final_import_duty_amount;
    if (item.origin_country !== undefined) cleanItem.origin_country = item.origin_country;

    return cleanItem;
  });
  
  // Create clean pricing run object
  const cleanPricingRun = {
    id: pricingRun.id,
    rfq_id: pricingRun.rfq_id,
    status: pricingRun.status,
    total_price: pricingRun.total_price != null ? parseFloat(pricingRun.total_price) : null,
    subtotal: pricingRun.subtotal != null ? parseFloat(pricingRun.subtotal) : null,
    tax_amount: pricingRun.tax_amount != null ? parseFloat(pricingRun.tax_amount) : null,
    tax_rate: pricingRun.tax_rate != null ? parseFloat(pricingRun.tax_rate) : null,
    tax_country: pricingRun.tax_country,
    tax_type: pricingRun.tax_type,
    total_with_tax: pricingRun.total_with_tax != null ? parseFloat(pricingRun.total_with_tax) : null,
    total_import_duty: pricingRun.total_import_duty != null ? parseFloat(pricingRun.total_import_duty) : null,
    total_final_import_duty: pricingRun.total_final_import_duty != null ? parseFloat(pricingRun.total_final_import_duty) : null,
    currency: pricingRun.currency,
    approval_status: pricingRun.approval_status,
    version_number: pricingRun.version_number,
    is_current: pricingRun.is_current,
    created_at: pricingRun.created_at,
    updated_at: pricingRun.updated_at,
    items: items,
    // Include related RFQ/customer info
    rfq_title: pricingRun.rfq_title,
    rfq_description: pricingRun.rfq_description,
    rfq_status: pricingRun.rfq_status,
    project_id: pricingRun.project_id,
    project_name: pricingRun.project_name,
    client_id: pricingRun.client_id,
    client_name: pricingRun.client_name,
    client_contact_email: pricingRun.client_contact_email,
    client_contact_phone: pricingRun.client_contact_phone,
  };
  
  // Add optional Phase 9 fields if they exist
  if (pricingRun.total_freight_cost !== undefined) cleanPricingRun.total_freight_cost = parseFloat(pricingRun.total_freight_cost) || 0;
  if (pricingRun.total_insurance_cost !== undefined) cleanPricingRun.total_insurance_cost = parseFloat(pricingRun.total_insurance_cost) || 0;
  if (pricingRun.total_handling_cost !== undefined) cleanPricingRun.total_handling_cost = parseFloat(pricingRun.total_handling_cost) || 0;
  if (pricingRun.total_local_charges !== undefined) cleanPricingRun.total_local_charges = parseFloat(pricingRun.total_local_charges) || 0;
  if (pricingRun.total_landed_cost !== undefined) cleanPricingRun.total_landed_cost = parseFloat(pricingRun.total_landed_cost) || 0;

  // Calculate nextAction based on approval_status
  let nextAction = 'Review'; // default
  if (pricingRun.approval_status === 'approved') {
    nextAction = 'Export Quote';
  } else if (pricingRun.approval_status === 'pending_approval') {
    nextAction = 'Review';
  } else if (pricingRun.approval_status === 'rejected') {
    nextAction = 'Revise';
  } else if (pricingRun.approval_status === 'draft') {
    nextAction = 'Submit for Approval';
  }
  cleanPricingRun.nextAction = nextAction;

  // Final sanitization to ensure no circular references or non-serializable properties
  return sanitizeForSerialization(cleanPricingRun);
}

/**
 * Stage 3: Calculate pricing for a specific origin
 * Helper function to calculate pricing for China or Non-China origin
 *
 * Enhanced with NSC pricing policies from pricingRules.js
 *
 * @param {Object} params - Pricing parameters
 * @param {number} params.baseCost - Base cost
 * @param {string} params.originType - Origin type ('CHINA' or 'NON_CHINA')
 * @param {string} params.category - Material category
 * @param {string|null} params.clientId - Client UUID
 * @param {string|null} params.projectType - Project type
 * @param {string} params.currency - Currency
 * @param {string} params.description - Item description
 * @param {Object|null} params.priceAgreement - Price agreement (if applicable)
 * @param {string} params.tenantId - Tenant UUID (required)
 * @param {Object} params.roundingRules - Rounding rules from tenant config
 * @param {number} params.quantity - Quantity for volume discounts
 * @param {string|null} params.clientSegment - Client segment type
 * @param {string|null} params.clientName - Client name for fixed-margin check
 * @param {string|null} params.region - Region for regional adjustments
 * @param {string|null} params.industry - Industry for industry adjustments
 * @returns {Promise<Object>} Pricing calculation result
 */
async function calculatePricingForOrigin({
  baseCost,
  originType,
  category,
  clientId,
  projectType,
  currency,
  description,
  priceAgreement = null,
  tenantId,
  roundingRules,
  quantity = 1,
  clientSegment = 'normal',
  clientName = null,
  region = null,
  industry = null,
  // Optional DB client/pool so we don't open new connections per item
  db = null,
}) {
  let pricingMethod = 'rule_based';
  let priceAgreementId = null;
  let agreementPrice = null;
  let finalBaseCost = baseCost;

  // Check for price agreement FIRST (takes precedence over pricing rules)
  if (priceAgreement) {
    finalBaseCost = parseFloat(priceAgreement.applicable_price);
    pricingMethod = 'agreement';
    priceAgreementId = priceAgreement.id;
    agreementPrice = priceAgreement.applicable_price;
  }

  // NSC POLICY: Apply quantity break discounts
  const quantityBreakAdj = nscPricingRules.getQuantityBreakAdjustment(category, quantity);
  const quantityAdjustedCost = finalBaseCost * (1 + quantityBreakAdj / 100);

  // Find best pricing rule for this origin and project type
  const pricingRule = await findBestPricingRule(
    {
      clientId: clientId,
      originType: originType,
      category: category,
      projectType: projectType,
      tenantId: tenantId,
    },
    db
  );

  // Get tenant pricing config for defaults
  const pricingConfig = await getPricingRulesConfig(tenantId);

  // Use rule values or fallback to tenant defaults
  let markupPct, logisticsPct, riskPct, ruleOriginType, ruleCategory, ruleLevel;

  if (pricingRule) {
    markupPct = pricingRule.markup_pct;
    logisticsPct = pricingRule.logistics_pct;
    riskPct = pricingRule.risk_pct;
    ruleOriginType = pricingRule.origin_type;
    ruleCategory = pricingRule.category;
    ruleLevel = pricingRule.rule_level;
  } else {
    // Fallback to tenant config defaults
    markupPct = pricingConfig.defaultMarkup || 0.20;
    logisticsPct = pricingConfig.defaultLogistics || 0.05;
    riskPct = pricingConfig.defaultRisk || 0.02;
    ruleOriginType = 'FALLBACK';
    ruleCategory = 'FALLBACK';
    ruleLevel = 'FALLBACK';
  }

  // NSC POLICY: Calculate effective margin (client segment + category)
  const effectiveMargin = nscPricingRules.calculateEffectiveMargin(clientSegment, category);

  // NSC POLICY: Check for fixed-margin client
  const isFixedMargin = nscPricingRules.isFixedMarginClient(clientName);

  // If fixed-margin client, enforce target margin
  if (isFixedMargin && markupPct < effectiveMargin.targetMarginPct / 100) {
    markupPct = effectiveMargin.targetMarginPct / 100;
  }

  // Ensure markup doesn't go below minimum margin
  if (markupPct < effectiveMargin.minMarginPct / 100) {
    markupPct = effectiveMargin.minMarginPct / 100;
  }

  // Calculate pricing
  const markupAmount = quantityAdjustedCost * markupPct;
  const logisticsCost = quantityAdjustedCost * logisticsPct;
  const riskCost = quantityAdjustedCost * riskPct;
  let finalUnitPrice = quantityAdjustedCost + markupAmount + logisticsCost + riskCost;

  // NSC POLICY: Apply regional adjustments if enabled
  if (region) {
    const regionalAdj = nscPricingRules.getRegionalAdjustment(region);
    const regionalAdjustmentAmount = finalUnitPrice * (regionalAdj / 100);
    finalUnitPrice += regionalAdjustmentAmount;
  }

  // NSC POLICY: Apply industry adjustments if enabled
  if (industry) {
    const industryAdj = nscPricingRules.getIndustryAdjustment(industry);
    const industryAdjustmentAmount = finalUnitPrice * (industryAdj / 100);
    finalUnitPrice += industryAdjustmentAmount;
  }

  // NSC POLICY: Apply rounding rules (nearest 10 for all categories)
  const priceBeforeRounding = finalUnitPrice;
  finalUnitPrice = nscPricingRules.applyRoundingRule(finalUnitPrice, 'materials');
  const roundingAdjustment = finalUnitPrice - priceBeforeRounding;

  // NSC POLICY: Calculate margin percentage and check approval flags
  const actualMarginPct = ((finalUnitPrice - finalBaseCost) / finalUnitPrice) * 100;
  const discountFromTarget = effectiveMargin.targetMarginPct - actualMarginPct;
  const approvalFlags = nscPricingRules.checkApprovalFlags(actualMarginPct, discountFromTarget);

  return {
    base_cost: finalBaseCost,
    quantity_adjusted_cost: quantityAdjustedCost,
    quantity_break_adjustment_pct: quantityBreakAdj,
    origin_type: originType,
    markup_pct: markupPct,
    markup_amount: markupAmount,
    logistics_pct: logisticsPct,
    logistics_cost: logisticsCost,
    risk_pct: riskPct,
    risk_cost: riskCost,
    unit_price: finalUnitPrice,
    price_before_rounding: priceBeforeRounding,
    rounding_adjustment: roundingAdjustment,
    pricing_method: pricingMethod,
    agreement_price: agreementPrice,
    rule_origin_type: ruleOriginType,
    rule_category: ruleCategory,
    rule_level: ruleLevel,
    currency: currency,
    effective_margin: effectiveMargin,
    actual_margin_pct: actualMarginPct,
    is_fixed_margin_client: isFixedMargin,
    approval_flags: approvalFlags,
  };
}

/**
 * Creates a pricing run for an RFQ
 * Stage 3: Enhanced with dual-origin pricing support
 * For each RFQ item, calculates pricing for both China and Non-China origins when applicable.
 * 
 * @param {string} rfqId - RFQ UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @param {Object} [context] - Optional context with correlationId
 * @returns {Promise<Object>} Created pricing run with items
 */
/**
 * Preflight validation for pricing run creation
 * Validates all required dependencies before attempting to create a pricing run
 * Returns validation result with missing dependencies list
 */
async function validatePricingRunPreflight(rfqId, tenantId) {
  const { isValidUuid } = require('../utils/uuidValidator');
  const { getTenantSetting } = require('../config/tenantConfig');
  const { withTenantContext } = require('../db/tenantContext');
  const db = await connectDb();
  const missing = [];
  const validationErrors = [];

  // 1. Validate UUIDs with enhanced logging
  console.log('[validatePricingRunPreflight] UUID validation check:', {
    rfqId: { value: rfqId, type: typeof rfqId, length: rfqId?.length },
    tenantId: { value: tenantId, type: typeof tenantId, length: tenantId?.length }
  });

  if (!isValidUuid(rfqId)) {
    const errorMsg = `rfqId must be a valid UUID (received: "${rfqId}", type: ${typeof rfqId}, length: ${rfqId?.length})`;
    console.error('[validatePricingRunPreflight] Invalid rfqId:', errorMsg);
    validationErrors.push(errorMsg);
    return { valid: false, missing, validationErrors };
  }
  if (!isValidUuid(tenantId)) {
    const errorMsg = `tenantId must be a valid UUID (received: "${tenantId}", type: ${typeof tenantId}, length: ${tenantId?.length})`;
    console.error('[validatePricingRunPreflight] Invalid tenantId:', errorMsg);
    validationErrors.push(errorMsg);
    return { valid: false, missing, validationErrors };
  }

  // 2. Validate tenant exists and is active
  console.log('[validatePricingRunPreflight] Step 2: Checking tenant exists, tenantId:', tenantId);
  const tenantResult = await db.query(
    `SELECT id, name, is_active FROM tenants WHERE id = $1`,
    [tenantId]
  );
  if (tenantResult.rows.length === 0) {
    validationErrors.push('Tenant does not exist');
    return { valid: false, missing, validationErrors };
  }
  if (!tenantResult.rows[0].is_active) {
    validationErrors.push('Tenant is not active');
    return { valid: false, missing, validationErrors };
  }
  console.log('[validatePricingRunPreflight] Step 2: Tenant validated successfully');

  // 3. Validate RFQ exists and belongs to tenant
  // IMPORTANT: Use withTenantContext to set RLS context for tenant isolation
  console.log('[validatePricingRunPreflight] Step 3: Checking RFQ exists, rfqId:', rfqId, 'tenantId:', tenantId);

  const rfqResult = await withTenantContext(tenantId, async (client) => {
    return await client.query(
      `SELECT id, tenant_id, status FROM rfqs WHERE id = $1::uuid`,
      [rfqId]
    );
  });
  console.log('[validatePricingRunPreflight] Step 3: RFQ query - rows found:', rfqResult.rows.length);

  if (rfqResult.rows.length === 0) {
    validationErrors.push('RFQ not found or does not belong to tenant');
    return { valid: false, missing, validationErrors };
  }
  console.log('[validatePricingRunPreflight] Step 3: RFQ validated successfully');

  // 4. Validate RFQ has items
  console.log('[validatePricingRunPreflight] Step 4: Checking RFQ items count');
  const itemCountResult = await withTenantContext(tenantId, async (client) => {
    return await client.query(
      `SELECT COUNT(*) as count FROM rfq_items WHERE rfq_id = $1`,
      [rfqId]
    );
  });
    const itemCount = parseInt(itemCountResult.rows[0].count || 0);
    if (itemCount < 1) {
      validationErrors.push('RFQ must have at least 1 item to price');
      return { valid: false, missing, validationErrors };
    }
    console.log('[validatePricingRunPreflight] Step 4: RFQ has', itemCount, 'items');

    const reviewCheck = await withTenantContext(tenantId, async (client) => {
      return await client.query(
        `SELECT
          SUM(CASE WHEN needs_review = true THEN 1 ELSE 0 END) AS needs_review_count,
          SUM(CASE WHEN supplier_selected_option IS NULL THEN 1 ELSE 0 END) AS missing_supplier_count
         FROM rfq_items
         WHERE rfq_id = $1`,
        [rfqId]
      );
    });
    const needsReviewCount = parseInt(reviewCheck.rows[0]?.needs_review_count || 0, 10);
    const missingSupplierCount = parseInt(reviewCheck.rows[0]?.missing_supplier_count || 0, 10);

    if (needsReviewCount > 0) {
      validationErrors.push('RFQ items require review before pricing');
    }
    if (missingSupplierCount > 0) {
      validationErrors.push('RFQ items missing supplier selection');
    }

  // 5. Validate required tenant settings
  console.log('[validatePricingRunPreflight] Step 5: Checking tenant settings');
  const requiredSettings = [
    'pricing_rules',
    'approval_rules',
    'rounding_rules'
  ];

  for (const key of requiredSettings) {
    console.log(`[validatePricingRunPreflight] Step 5: Getting setting "${key}" for tenantId:`, tenantId);
    try {
      const value = await getTenantSetting(tenantId, key);
      if (!value) {
        missing.push(`tenant_settings.${key}`);
      }
      console.log(`[validatePricingRunPreflight] Step 5: Setting "${key}" result:`, value ? 'found' : 'missing');
    } catch (err) {
      console.error(`[validatePricingRunPreflight] Step 5: ERROR getting setting "${key}":`, err.message);
      throw err;
    }
  }
  console.log('[validatePricingRunPreflight] Step 5: All settings checked');

  if (missing.length > 0 || validationErrors.length > 0) {
    return {
      valid: false,
      missing,
      validationErrors,
    };
  }

  return {
    valid: true,
    itemCount,
  };
}

async function createPriceRunForRfq(rfqId, tenantId, context = {}) {
  // Use UUID validation utility
  const { validateUuidOrThrow } = require('../utils/uuidValidation');
  
  // Validate inputs with utility
  const trimmedRfqId = validateUuidOrThrow(rfqId, 'rfqId');
  const trimmedTenantId = validateUuidOrThrow(tenantId, 'tenantId');

  const { log } = require('../utils/logger');
  const { createTimingContext } = require('../utils/timing');
  const logContext = {
    correlationId: context.correlationId,
    tenantId: trimmedTenantId,
    rfqId: trimmedRfqId,
    operation: 'pricing_run_creation_start',
  };
  const timing = createTimingContext('Pricing Run Creation', logContext);
  log.logInfo('Pricing run creation started', logContext);

  // Preflight validation: Check all dependencies before proceeding
  const preflight = await validatePricingRunPreflight(trimmedRfqId, trimmedTenantId);
  if (!preflight.valid) {
    const error = new Error('Pricing run preflight validation failed');
    error.code = 'PRICING_PREFLIGHT_FAILED';
    error.statusCode = 409;
    error.details = {
      missing: preflight.missing || [],
      validationErrors: preflight.validationErrors || [],
    };
    
    throw error;
  }

  const db = await connectDb();

  // Get RFQ with client_id and project_type
  const rfq = await getRfqById(trimmedRfqId, trimmedTenantId);
  if (!rfq) {
    throw new Error('RFQ not found');
  }

  // Normalize empty strings to null for UUID fields
  const clientId = (rfq.client_id && rfq.client_id.trim() !== '') ? rfq.client_id.trim() : null;
  const projectType = rfq.project_type || null;
  const projectId = (rfq.project_id && rfq.project_id.trim() !== '') ? rfq.project_id.trim() : null;

  // Get all RFQ items for this RFQ (verify tenant scoping)
  // Use tenant context for RLS-protected rfq_items table
  const rfqItemsResult = await withTenantContext(trimmedTenantId, async (client) => {
    return await client.query(
      `SELECT ri.* FROM rfq_items ri
       JOIN rfqs r ON ri.rfq_id = r.id
       WHERE ri.rfq_id = $1::uuid AND r.tenant_id = $2::uuid
       ORDER BY ri.line_number, ri.created_at`,
      [trimmedRfqId, trimmedTenantId]
    );
  });

  const rfqItems = rfqItemsResult.rows;

  if (rfqItems.length === 0) {
    throw new Error('RFQ has no items to price');
  }

  // Get rounding rules for tenant
  const roundingRules = await getRoundingRules(trimmedTenantId);

  // PERFORMANCE OPTIMIZATION: Fetch client info ONCE before the loop
  let clientSegment = 'normal'; // Default
  let clientName = null;
  let region = null;
  let industry = null;
  let incoterm = rfq.incoterm || rfq.incoterm_code || null;

  if (clientId && clientId.trim() !== '') {
    try {
      // Use tenant context for RLS-protected clients table
      // Check if region column exists to handle different database schemas
      const clientResult = await withTenantContext(trimmedTenantId, async (client) => {
        // First check if region column exists
        const columnCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'clients' 
            AND column_name = 'region'
          );
        `);
        const hasRegionColumn = columnCheck.rows[0].exists;
        
        // Build query dynamically based on available columns
        let query;
        if (hasRegionColumn) {
          query = 'SELECT name, region, industry FROM clients WHERE id = $1';
        } else {
          query = 'SELECT name, industry FROM clients WHERE id = $1';
        }
        
        return await client.query(query, [clientId.trim()]);
      });
      
      if (clientResult.rows.length > 0) {
        const clientInfo = clientResult.rows[0];
        clientName = clientInfo.name;
        // Note: client_type column doesn't exist, using 'normal' as default
        clientSegment = 'normal';
        // Use region if available, otherwise null (gracefully handled in pricing logic)
        region = clientInfo.region || null;
        industry = clientInfo.industry;
      }
      log.logInfo('Client info fetched', {
        ...logContext,
        clientId,
        clientName,
        clientSegment,
      });
    } catch (err) {
      console.warn('Failed to fetch client info:', err.message);
    }
  }

  // Check if tenant has any released V2 agreements (to avoid per-item checks when empty)
  let hasV2Agreements = false;
  try {
    // Use tenant context for RLS-protected agreement_headers table
    const v2Check = await withTenantContext(trimmedTenantId, async (client) => {
      return await client.query(
        `SELECT 1 FROM agreement_headers WHERE tenant_id = $1 AND status = 'released' LIMIT 1`,
        [trimmedTenantId]
      );
    });
    hasV2Agreements = v2Check.rows.length > 0;
  } catch (err) {
    console.warn('V2 agreement presence check failed, continuing with fallback:', err.message);
  }

   // PERFORMANCE OPTIMIZATION: Batch fetch all materials ONCE before the loop
  // Try exact code matching first for performance
  const materialCodes = rfqItems
    .map(item => item.material_code)
    .filter(code => code); // Filter out null/undefined

  // Phase B.2: Pass tenantId for tenant-aware material lookup (with global fallback)
  const materialsMap = await getMaterialsByCodes(materialCodes, trimmedTenantId);

  log.logInfo('Materials batch fetched (exact match)', {
    ...logContext,
    totalCodes: materialCodes.length,
    foundMaterials: materialsMap.size,
  });

  // NEW: If exact matching found 0 materials, try intelligent matching
  const { matchMaterialsForLineItem } = require('./materialMatchService');
  const intelligentMatches = new Map(); // material_code -> material

  if (materialsMap.size === 0 && rfqItems.length > 0) {
    console.log('[PRICING] Exact material matching returned 0 results. Attempting intelligent matching...');

    // Sample first 5 items to attempt intelligent matching
    const sampleItems = rfqItems.slice(0, Math.min(5, rfqItems.length));

    for (const item of sampleItems) {
      try {
        const matches = await matchMaterialsForLineItem(
          {
            description: item.description,
            material_code: item.material_code,
            size: null, // RFQ items don't have parsed size yet
            schedule: null,
            standard: null,
            grade: null,
          },
          {
            maxResults: 1,
            minScore: 25, // Lower threshold for fallback matching
            tenantId: trimmedTenantId,
          }
        );

        if (matches.length > 0) {
          // Get full material object from database
          const materialResult = await withTenantContext(trimmedTenantId, async (client) => {
            return await client.query(
              'SELECT * FROM materials WHERE id = $1 AND tenant_id = $2',
              [matches[0].material_id, trimmedTenantId]
            );
          });

          if (materialResult.rows.length > 0) {
            const material = materialResult.rows[0];
            intelligentMatches.set(item.material_code, material);
            console.log(`[PRICING] Intelligent match: "${item.material_code}" -> ${material.material_code} (score: ${matches[0].score})`);
          }
        }
      } catch (err) {
        console.warn(`[PRICING] Intelligent matching failed for "${item.material_code}":`, err.message);
      }
    }

    log.logInfo('Intelligent material matching attempted', {
      ...logContext,
      intelligentMatches: intelligentMatches.size,
    });
  }

  // Mark fetch phase complete
  timing.phase('loadInputs');

  // Capture permissions + reason upfront (future-proof: defaults disallow superseding approved runs)
  const supersededReason = context.superseded_reason ? context.superseded_reason.trim() : null;
  const hasRepricePermission = context.has_reprice_permission === true;

  // Check for existing current pricing run and handle versioning (initial read; revalidated inside transaction)
  const existingCurrentRun = await withTenantContext(trimmedTenantId, async (client) => {
    const result = await client.query(
      `SELECT pr.id, pr.approval_status, pr.version_number, pr.is_current
       FROM pricing_runs pr
       JOIN rfqs r ON pr.rfq_id = r.id
       WHERE pr.rfq_id = $1::uuid AND pr.is_current = true
       LIMIT 1`,
      [trimmedRfqId]
    );
    return result.rows[0] || null;
  });

  if (existingCurrentRun && existingCurrentRun.approval_status === 'approved' && (!hasRepricePermission || !supersededReason)) {
    throw workflowViolation(
      'Cannot create new pricing run because the current run is already approved. Provide a superseded_reason and explicit permission to proceed.',
      {
        rfq_id: trimmedRfqId,
        pricing_run_id: existingCurrentRun.id,
        current_run_status: existingCurrentRun.approval_status,
      }
    );
  }

  // Compute next version number (finalized inside transaction)
  let nextVersionNumber = 1;

  // Start transaction with proper connection isolation and tenant context
  timing.phase('transactionStart');
  const result = await withTenantTransaction(trimmedTenantId, async (client) => {
    const transactionStartMs = Date.now();
    try {
    // Re-validate current run under lock to enforce single-current invariant
    const currentRunsResult = await client.query(
      `SELECT pr.id, pr.approval_status, pr.version_number, pr.is_current
       FROM pricing_runs pr
       JOIN rfqs r ON pr.rfq_id = r.id
       WHERE pr.rfq_id = $1::uuid AND r.tenant_id = $2::uuid AND pr.is_current = true
       FOR UPDATE`,
      [trimmedRfqId, trimmedTenantId]
    );

    if (currentRunsResult.rows.length > 1) {
      throw workflowViolation(
        'Multiple current pricing runs detected for this RFQ. Resolve the data conflict before creating a new run.',
        {
          rfq_id: trimmedRfqId,
          current_run_count: currentRunsResult.rows.length,
        }
      );
    }

    const activeCurrentRun = currentRunsResult.rows[0] || null;
    if (activeCurrentRun && activeCurrentRun.approval_status === 'approved' && (!hasRepricePermission || !supersededReason)) {
      throw workflowViolation(
        'Cannot create new pricing run because the current run is already approved. Provide a superseded_reason and explicit permission to proceed.',
        {
          rfq_id: trimmedRfqId,
          pricing_run_id: activeCurrentRun.id,
          current_run_status: activeCurrentRun.approval_status,
        }
      );
    }

    const maxVersionResult = await client.query(
      `SELECT COALESCE(MAX(pr.version_number), 0) as max_version
       FROM pricing_runs pr
       JOIN rfqs r ON pr.rfq_id = r.id
       WHERE pr.rfq_id = $1::uuid AND r.tenant_id = $2::uuid`,
      [trimmedRfqId, trimmedTenantId]
    );
    nextVersionNumber = (maxVersionResult.rows[0]?.max_version || 0) + 1;

    log.logInfo('Pricing calculation started', {
      ...logContext,
      operation: 'pricing_calculation_start',
      itemCount: rfqItems.length,
      nextVersionNumber,
      existingCurrentRunId: activeCurrentRun?.id || null,
    });

    // Create pricing run with tenant_id and version_number first
    const pricingRunResult = await client.query(
      `INSERT INTO pricing_runs (rfq_id, approval_status, tenant_id, version_number, is_current, superseded_reason)
       VALUES ($1, 'draft', $2, $3, true, $4)
       RETURNING *`,
      [trimmedRfqId, trimmedTenantId, nextVersionNumber, supersededReason]
    );

    const pricingRun = pricingRunResult.rows[0];

    // If there's a current run, mark it as superseded now that we have the new run ID
    if (activeCurrentRun) {
      await client.query(
        `UPDATE pricing_runs 
         SET is_current = false, 
             superseded_by = $1::uuid,
             superseded_reason = COALESCE($3, superseded_reason)
         WHERE id = $2::uuid AND is_current = true`,
        [pricingRun.id, activeCurrentRun.id, supersededReason]
      );
      log.logInfo('Marked existing current run as superseded', {
        ...logContext,
        supersededRunId: activeCurrentRun.id,
        newRunId: pricingRun.id,
      });
    }

    // pricingRun already declared above
    logContext.pricingRunId = pricingRun.id;
    console.log('[TRANSACTION DEBUG] Created pricing_run:', pricingRun.id);
    const pricingRunItems = [];
    let totalPrice = 0;

    // PERFORMANCE OPTIMIZATION: Warm up database connection pool before processing items
    // This prevents retry delays on first query of each item
    console.log('[PERFORMANCE] Warming up database connection pool...');
    const warmupStartMs = Date.now();
    try {
      await Promise.all([
        client.query('SELECT 1'), // Basic connection test
        client.query('SELECT COUNT(*) FROM materials LIMIT 1'), // Warm up materials table
        clientId ? client.query('SELECT name FROM clients WHERE id = $1', [clientId]) : Promise.resolve(), // Warm up clients table if needed
      ]);
      console.log(`[PERFORMANCE] Connection warmup completed in ${Date.now() - warmupStartMs}ms`);
    } catch (warmupError) {
      console.warn('[PERFORMANCE] Connection warmup had issues (will retry per-item):', warmupError.message);
    }

    const pricingLoopStartMs = Date.now();
    console.log(`[PERFORMANCE] Starting pricing loop for ${rfqItems.length} items at ${new Date().toISOString()}`);
    timing.phase('perItemLoop');

    // Process each RFQ item
    let itemIndex = 0;
    for (const rfqItem of rfqItems) {
      const itemStartMs = Date.now();
      itemIndex++;
      let baseCost = 100; // Default fallback
      let originType = 'NON_CHINA'; // Default fallback
      let category = 'ANY'; // Default fallback
      let currency = 'USD'; // Default
      let materialId = null;
      let notes = null;

      // Try to find material by material_code (using pre-fetched map for performance)
      if (rfqItem.material_code) {
        let material = materialsMap.get(rfqItem.material_code);

        // Fallback: try intelligent matches if exact match failed
        if (!material && intelligentMatches.size > 0) {
          material = intelligentMatches.get(rfqItem.material_code);
          if (material) {
            console.log(`[PRICING] Using intelligent match for "${rfqItem.material_code}" -> ${material.material_code}`);
          }
        }

        if (material) {
          baseCost = parseFloat(material.base_cost);
          originType = material.origin_type;
          category = material.category;
          currency = material.currency;
          // Normalize empty string to null for UUID field
          materialId = (material.id && material.id.trim() !== '') ? material.id.trim() : null;
        } else {
          notes = `Material code "${rfqItem.material_code}" not found in materials table. Using default base_cost.`;
        }
      } else {
        notes = `No material_code specified. Using default base_cost.`;
      }

      // PIPE INTEGRATION: Check if this is a pipe item and enhance pricing with pipe catalogue data
      // This is additive - it doesn't break existing flows if pipe data is not found
      if (category === 'PIPE' || (rfqItem.description && rfqItem.description.toLowerCase().includes('pipe'))) {
        try {
          // Extract pipe specs from RFQ item if available
          // These fields may be added to rfq_items schema in the future
          const dnMm = rfqItem.dn_mm || null;
          const npsInch = rfqItem.nps_inch || null;
          const schedule = rfqItem.schedule || null;
          const lengthM = rfqItem.length_m || 1; // Default to 1m if not specified
          const baseRatePerKg = rfqItem.base_rate_per_kg || baseCost; // Use material base_cost as rate per kg

          if (schedule) {
            const pipeWeight = await getPipeWeightKgPerM({
              dnMm,
              npsInch,
              schedule,
              standard: rfqItem.standard || null,
            });

            if (pipeWeight) {
              // Calculate material cost based on actual pipe weight
              // Formula: weight_kg_per_m * length_m * base_rate_per_kg
              baseCost = pipeWeight * lengthM * baseRatePerKg;
              notes = notes ?
                `${notes} Pipe weight from catalogue: ${pipeWeight} kg/m.` :
                `Pipe weight from catalogue: ${pipeWeight} kg/m, length: ${lengthM}m, rate: ${baseRatePerKg}/kg.`;
            }
          }
        } catch (error) {
          // Pipe lookup failed - fall back to existing material-based pricing
          console.warn('Pipe catalogue lookup failed, using material base_cost:', error);
        }
      }

      // Stage 3: V2 price agreement attempt (safe, tenant-scoped)
      // Ensure clientId and materialId are not empty strings before using
      const normalizedClientId = (clientId && clientId.trim() !== '') ? clientId.trim() : null;
      const normalizedMaterialId = (materialId && materialId.trim() !== '') ? materialId.trim() : null;
      
      let v2Pricing = null;
      if (hasV2Agreements && normalizedClientId && (normalizedMaterialId || category)) {
        try {
          v2Pricing = await priceItemWithAgreementsV2({
            tenantId: trimmedTenantId,
            customerId: normalizedClientId,
            materialId: normalizedMaterialId,
            materialGroup: category || null,
            quantity: parseFloat(rfqItem.quantity),
            date: new Date().toISOString().split('T')[0],
            region,
            incoterm: incoterm || rfqItem.incoterm || rfqItem.incoterm_code || null,
          });
        } catch (err) {
          console.warn('V2 pricing failed, falling back to v1/rules:', err.message);
        }
      }

      // NSC creates separate pricing runs for each option (A/B/C)
      // Origin comes from selected supplier's material record
      // No dual-origin pricing - NSC manually creates Option A (China), B (Mix), C (Non-China)
      let priceAgreement = null;

      // Use origin from material or default
      const primaryOriginType = originType || 'Malaysia';

      // Client info already fetched before loop for performance
      // Using: clientSegment, clientName, region, industry

      // Calculate pricing for primary origin
      let primaryPricing;
      if (v2Pricing) {
        primaryPricing = {
          base_cost: v2Pricing.base_price,
          quantity_adjusted_cost: v2Pricing.base_price,
          quantity_break_adjustment_pct: 0,
          price_before_rounding: v2Pricing.net_price,
          unit_price: v2Pricing.net_price,
          rounding_adjustment: 0,
          markup_pct: 0,
          logistics_pct: 0,
          risk_pct: 0,
          rule_origin_type: primaryOriginType,
          rule_category: category,
          rule_level: 'agreement_v2',
          pricing_method: 'agreement_v2',
          agreement_price: v2Pricing.net_price,
          effective_margin: null,
          actual_margin_pct: null,
          is_fixed_margin_client: false,
          approval_flags: null,
        };
      } else {
        primaryPricing = await calculatePricingForOrigin({
          baseCost: primaryOriginType === 'CHINA' ? chinaBaseCost : nonChinaBaseCost,
          originType: primaryOriginType,
          category,
          clientId: normalizedClientId,
          projectType,
          currency,
          description: rfqItem.description,
          priceAgreement,
          tenantId: trimmedTenantId,
          roundingRules: roundingRules,
          quantity: parseFloat(rfqItem.quantity),
          clientSegment,
          clientName,
          region,
          industry,
          db,
        });
      }

      // Calculate pricing for alternative origin if dual pricing is enabled
      let dualPricingData = null;
      if (!v2Pricing && calculateDual && originSelection.allowedOrigins.length > 1) {
        const alternativeOrigin = originSelection.allowedOrigins.find(o => o !== primaryOriginType);
        if (alternativeOrigin) {
          const alternativePricing = await calculatePricingForOrigin({
            baseCost: alternativeOrigin === 'CHINA' ? chinaBaseCost : nonChinaBaseCost,
            originType: alternativeOrigin,
            category,
            clientId: normalizedClientId,
            projectType,
            currency,
            description: rfqItem.description,
            priceAgreement,
            tenantId: trimmedTenantId,
            roundingRules: roundingRules,
            quantity: parseFloat(rfqItem.quantity),
            clientSegment,
            clientName,
            region,
            industry,
            db,
          });

          dualPricingData = {
            primary: {
              origin_type: primaryOriginType,
              unit_price: primaryPricing.unit_price,
              total_price: primaryPricing.unit_price * parseFloat(rfqItem.quantity),
              base_cost: primaryPricing.base_cost,
              markup_pct: primaryPricing.markup_pct,
              logistics_pct: primaryPricing.logistics_pct,
              risk_pct: primaryPricing.risk_pct,
            },
            alternative: {
              origin_type: alternativeOrigin,
              unit_price: alternativePricing.unit_price,
              total_price: alternativePricing.unit_price * parseFloat(rfqItem.quantity),
              base_cost: alternativePricing.base_cost,
              markup_pct: alternativePricing.markup_pct,
              logistics_pct: alternativePricing.logistics_pct,
              risk_pct: alternativePricing.risk_pct,
            },
            recommended: primaryOriginType,
            recommendation_reason: originSelection.recommendationReason,
            allowed_origins: originSelection.allowedOrigins,
          };
        }
      }

      // Use primary pricing for the main pricing run item
      const finalUnitPrice = primaryPricing.unit_price;
      const totalItemPrice = finalUnitPrice * parseFloat(rfqItem.quantity);
      
      // Update rfq_items with calculated import_duty_amount (for backward compatibility)
      // This uses the base import_duty_rate, not final_import_duty_rate
      if (rfqItem.import_duty_rate !== null && rfqItem.import_duty_rate !== undefined) {
        // Validate rfqItem.id is not empty before using in query
        if (!rfqItem.id || rfqItem.id.trim() === '') {
          throw new Error(`Invalid rfqItem.id: "${rfqItem.id}". Cannot update import_duty_amount.`);
        }
        const baseImportDutyAmount = totalItemPrice * (parseFloat(rfqItem.import_duty_rate) / 100);
        await client.query(
          `UPDATE rfq_items SET import_duty_amount = $1 WHERE id = $2::uuid`,
          [baseImportDutyAmount, rfqItem.id.trim()]
        );
      }
      
      totalPrice += totalItemPrice;

      // Build notes with rounding information
      if (!v2Pricing && Math.abs(primaryPricing.rounding_adjustment) > 0.01) {
        const roundingNote = `Price rounded ${primaryPricing.rounding_adjustment > 0 ? 'up' : 'down'} by ${Math.abs(primaryPricing.rounding_adjustment).toFixed(2)} (${isFabrication(category, rfqItem.description) ? 'fabrication: nearest 1' : 'material: nearest 10'})`;
        notes = notes ? `${notes} ${roundingNote}` : roundingNote;
      }

      if (v2Pricing && v2Pricing.applied_conditions && v2Pricing.applied_conditions.length > 0) {
        notes = notes
          ? `${notes} V2 agreement conditions applied: ${v2Pricing.applied_conditions.join(', ')}.`
          : `V2 agreement conditions applied: ${v2Pricing.applied_conditions.join(', ')}.`;
        try {
          log.logInfo('V2 pricing applied for item', {
            ...logContext,
            pricingRunId: pricingRun.id,
            itemMaterial: materialId,
            appliedConditions: v2Pricing.applied_conditions,
          });
        } catch (_) {
          // ignore logging failures
        }
      }

      // Stage 1 finishing: Add structured pricing metadata with NSC policy information
      const pricingMetadata = {
        calculation_timestamp: new Date().toISOString(),
        base_cost: primaryPricing.base_cost,
        quantity_adjusted_cost: primaryPricing.quantity_adjusted_cost,
        quantity_break_adjustment_pct: primaryPricing.quantity_break_adjustment_pct,
        price_before_rounding: primaryPricing.price_before_rounding,
        price_after_rounding: finalUnitPrice,
        rounding_applied: Math.abs(primaryPricing.rounding_adjustment) > 0.01,
        rounding_amount: primaryPricing.rounding_adjustment,
        rounding_method: 'nearest_10', // NSC policy: all round to nearest 10
        pricing_method: primaryPricing.pricing_method,
        rule_applied: {
          level: primaryPricing.rule_level,
          origin_type: primaryPricing.rule_origin_type,
          category: primaryPricing.rule_category,
          markup_pct: primaryPricing.markup_pct,
          logistics_pct: primaryPricing.logistics_pct,
          risk_pct: primaryPricing.risk_pct,
        },
        currency: currency,
        origin_type: primaryOriginType,
        category: category,
        project_type: projectType,
        dual_pricing_enabled: calculateDual,
        nsc_policies_applied: {
          client_segment: clientSegment,
          client_name: clientName,
          effective_margin: primaryPricing.effective_margin,
          actual_margin_pct: primaryPricing.actual_margin_pct,
          is_fixed_margin_client: primaryPricing.is_fixed_margin_client,
          regional_adjustment: region,
          industry_adjustment: industry,
          approval_flags: primaryPricing.approval_flags,
        },
      };
      
      // Append metadata to notes as JSON string for structured access
      const metadataNote = `[METADATA]${JSON.stringify(pricingMetadata)}[/METADATA]`;
      notes = notes ? `${notes} ${metadataNote}` : metadataNote;

      // Phase 5: Use final_import_duty_amount from rfqItem if available (preferred - includes trade agreement adjustments)
      // Otherwise calculate from final_import_duty_rate, or fall back to base import_duty_rate
      let finalDutyAmount = null;
      
      if (rfqItem.final_import_duty_amount !== null && rfqItem.final_import_duty_amount !== undefined) {
        // Use pre-calculated final duty amount (preferred - includes trade agreement rates)
        finalDutyAmount = parseFloat(rfqItem.final_import_duty_amount) || 0;
      } else if (rfqItem.final_import_duty_rate !== null && rfqItem.final_import_duty_rate !== undefined && rfqItem.final_import_duty_rate > 0) {
        // Calculate from final duty rate (includes trade agreement adjustments)
        finalDutyAmount = totalItemPrice * (parseFloat(rfqItem.final_import_duty_rate) / 100);
      } else if (rfqItem.hs_code && rfqItem.origin_country) {
        // Recalculate if not already set (fallback - ensures accuracy)
        try {
          // Regulatory service removed - skip duty calculation
          if (rfqItem.import_duty_rate !== null && rfqItem.import_duty_rate !== undefined && rfqItem.import_duty_rate > 0) {
            finalDutyAmount = totalItemPrice * (parseFloat(rfqItem.import_duty_rate) / 100);
          }
        } catch (dutyError) {
          console.warn(`[Pricing] Duty calculation skipped - regulatory service removed`);
          if (rfqItem.import_duty_rate !== null && rfqItem.import_duty_rate !== undefined && rfqItem.import_duty_rate > 0) {
            finalDutyAmount = totalItemPrice * (parseFloat(rfqItem.import_duty_rate) / 100);
          }
        }
      } else if (rfqItem.import_duty_rate !== null && rfqItem.import_duty_rate !== undefined && rfqItem.import_duty_rate > 0) {
        // Final fallback to base import duty rate (backward compatibility)
        finalDutyAmount = totalItemPrice * (parseFloat(rfqItem.import_duty_rate) / 100);
      }

      // Phase 9: Calculate logistics costs for landed cost breakdown
      const logisticsCostService = require('./logisticsCostService');
      const logisticsCosts = logisticsCostService.calculateItemLogisticsCosts(rfqItem, {
        tenantId: trimmedTenantId,
        originCountry: rfqItem.origin_country || originType || 'DEFAULT',
        category: category || 'DEFAULT',
        quantity: parseFloat(rfqItem.quantity),
        unitPrice: finalUnitPrice,
        weight: rfqItem.weight || null,
        volume: rfqItem.volume || null,
        totalItems: rfqItems.length, // For distributing fixed costs
      });

      // Calculate item landed cost (unit price + duty + logistics)
      const itemLandedCost = totalItemPrice + (finalDutyAmount || 0) + logisticsCosts.total_logistics_cost;

      // Insert pricing run item with dual pricing data (tenant_id inherited from pricing_run)
      // Validate all UUID fields before inserting
      if (!rfqItem.id || rfqItem.id.trim() === '') {
        throw new Error(`Invalid rfqItem.id: "${rfqItem.id}". Cannot create pricing run item.`);
      }
      if (!pricingRun.id || pricingRun.id.trim() === '') {
        throw new Error(`Invalid pricingRun.id: "${pricingRun.id}". Cannot create pricing run item.`);
      }
      
      // Normalize materialId - ensure it's either a valid UUID or null, never empty string
      const normalizedMaterialIdForInsert = (normalizedMaterialId && normalizedMaterialId.trim() !== '') 
        ? normalizedMaterialId.trim() 
        : null;
      
      // SYSTEMATIC APPROACH: Query schema once to get all column metadata
      // This identifies required (NOT NULL, no default) vs optional columns
      const schemaQuery = await client.query(`
        SELECT 
          column_name,
          is_nullable,
          column_default,
          data_type
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pricing_run_items'
        ORDER BY ordinal_position;
      `);
      
      // Build column metadata map
      const columnMetadata = {};
      schemaQuery.rows.forEach(col => {
        const isRequired = col.is_nullable === 'NO' && col.column_default === null;
        columnMetadata[col.column_name] = {
          exists: true,
          isRequired,
          isNullable: col.is_nullable === 'YES',
          hasDefault: col.column_default !== null,
          dataType: col.data_type
        };
      });
      
      // Helper to check if column exists
      const hasColumn = (name) => columnMetadata[name]?.exists || false;
      const isRequiredColumn = (name) => columnMetadata[name]?.isRequired || false;
      
      // Get all existing column names for quick lookup
      const existingColumns = Object.keys(columnMetadata);
      
      // SYSTEMATIC APPROACH: Build INSERT statement based on schema requirements
      // Step 1: Identify required columns (NOT NULL, no default) - MUST be included
      const requiredColumns = existingColumns.filter(col => isRequiredColumn(col));
      
      // Step 2: Build column-to-value mapping for all available data
      const columnValueMap = {
        // Required base columns
        'pricing_run_id': pricingRun.id.trim(),
        'rfq_item_id': rfqItem.id.trim(),
        'tenant_id': trimmedTenantId,
        'quantity': parseFloat(rfqItem.quantity) || 0, // Required NOT NULL
        'unit_price': finalUnitPrice,
        'total_price': totalItemPrice,
        
        // Cost columns (with fallback logic)
        'base_cost': hasColumn('base_cost') ? (primaryPricing.base_cost || null) : null,
        'unit_cost': hasColumn('unit_cost') ? (primaryPricing.unit_cost || primaryPricing.base_cost || null) : null,
        
        // Markup columns (with fallback logic)
        'markup_pct': hasColumn('markup_pct') ? (primaryPricing.markup_pct || null) : null,
        'markup_percentage': hasColumn('markup_percentage') ? (primaryPricing.markup_percentage || primaryPricing.markup_pct || null) : null,
        
        // Optional pricing columns
        'logistics_cost': hasColumn('logistics_cost') ? primaryPricing.logistics_cost : null,
        'risk_pct': hasColumn('risk_pct') ? primaryPricing.risk_pct : null,
        'risk_cost': hasColumn('risk_cost') ? primaryPricing.risk_cost : null,
        'currency': hasColumn('currency') ? currency : null,
        'origin_type': hasColumn('origin_type') ? primaryOriginType : null,
        'material_id': normalizedMaterialIdForInsert,
        'notes': notes,
        'rule_origin_type': hasColumn('rule_origin_type') ? primaryPricing.rule_origin_type : null,
        'rule_category': hasColumn('rule_category') ? primaryPricing.rule_category : null,
        'rule_level': hasColumn('rule_level') ? primaryPricing.rule_level : null,
        'pricing_method': hasColumn('pricing_method') ? primaryPricing.pricing_method : null,
        'dual_pricing_data': hasColumn('dual_pricing_data') 
          ? (dualPricingData ? JSON.stringify(dualPricingData) : null)
          : null,
        'origin_selection_data': hasColumn('origin_selection_data') 
          ? JSON.stringify(originSelection)
          : null,
        'import_duty_amount': hasColumn('import_duty_amount') ? finalDutyAmount : null,
        'freight_cost': hasColumn('freight_cost') ? logisticsCosts.freight_cost : null,
        'insurance_cost': hasColumn('insurance_cost') ? logisticsCosts.insurance_cost : null,
        'handling_cost': hasColumn('handling_cost') ? logisticsCosts.handling_cost : null,
        'local_charges': hasColumn('local_charges') ? logisticsCosts.local_charges : null,
        'item_landed_cost': hasColumn('item_landed_cost') ? itemLandedCost : null,
      };
      
      // Step 3: Determine which cost/markup columns to use (prefer newer names)
      let costColumn = null;
      let costValue = null;
      if (hasColumn('base_cost')) {
        costColumn = 'base_cost';
        costValue = columnValueMap['base_cost'];
      } else if (hasColumn('unit_cost')) {
        costColumn = 'unit_cost';
        costValue = columnValueMap['unit_cost'];
      }
      
      let markupColumn = null;
      let markupValue = null;
      if (hasColumn('markup_pct')) {
        markupColumn = 'markup_pct';
        markupValue = columnValueMap['markup_pct'];
      } else if (hasColumn('markup_percentage')) {
        markupColumn = 'markup_percentage';
        markupValue = columnValueMap['markup_percentage'];
      }
      
      // Step 4: Build INSERT columns and values systematically
      // Define preferred order for required columns
      const requiredOrder = ['pricing_run_id', 'rfq_item_id', 'tenant_id', 'quantity'];
      
      let insertColumns = [];
      let paramValues = [];
      
      // Add required columns first in preferred order
      for (const reqCol of requiredOrder) {
        if (requiredColumns.includes(reqCol)) {
          const value = columnValueMap[reqCol];
          if (value !== undefined) {
            insertColumns.push(reqCol);
            paramValues.push(value);
          } else {
            // If we don't have a value for a required column, use a safe default
            console.warn(`[WARNING] Required column ${reqCol} has no value, using default`);
            insertColumns.push(reqCol);
            if (reqCol === 'quantity') {
              paramValues.push(0);
            } else {
              paramValues.push(null); // Will fail if truly required, but better than missing column
            }
          }
        }
      }
      
      // Add other required columns (not in preferred order list)
      for (const reqCol of requiredColumns) {
        if (!requiredOrder.includes(reqCol) && !insertColumns.includes(reqCol)) {
          const value = columnValueMap[reqCol];
          if (value !== undefined) {
            insertColumns.push(reqCol);
            paramValues.push(value);
          } else {
            console.warn(`[WARNING] Required column ${reqCol} has no value, using null`);
            insertColumns.push(reqCol);
            paramValues.push(null);
          }
        }
      }
      
      // Step 5: Add optional columns that exist and have values (in logical order)
      // Cost and markup columns (prefer newer names)
      if (costColumn && !insertColumns.includes(costColumn)) {
        insertColumns.push(costColumn);
        paramValues.push(costValue);
      }
      
      if (markupColumn && !insertColumns.includes(markupColumn)) {
        insertColumns.push(markupColumn);
        paramValues.push(markupValue);
      }
      
      // Other optional columns (only if they exist in schema and have values)
      const optionalColumns = [
        'logistics_cost', 'risk_pct', 'risk_cost',
        'currency', 'origin_type',
        'rule_origin_type', 'rule_category', 'rule_level',
        'pricing_method',
        'dual_pricing_data', 'origin_selection_data',
        'import_duty_amount',
        'freight_cost', 'insurance_cost', 'handling_cost', 'local_charges', 'item_landed_cost'
      ];
      
      // material_id and notes are in base schema, add if not already included
      if (hasColumn('material_id') && !insertColumns.includes('material_id')) {
        insertColumns.push('material_id');
        paramValues.push(normalizedMaterialIdForInsert);
      }
      
      if (hasColumn('notes') && !insertColumns.includes('notes')) {
        insertColumns.push('notes');
        paramValues.push(notes);
      }
      
      // Add unit_price and total_price if they exist (recommended for pricing calculations)
      // These are typically in base schema but may not be required
      if (hasColumn('unit_price') && !insertColumns.includes('unit_price')) {
        insertColumns.push('unit_price');
        paramValues.push(finalUnitPrice);
      }
      
      if (hasColumn('total_price') && !insertColumns.includes('total_price')) {
        insertColumns.push('total_price');
        paramValues.push(totalItemPrice);
      }
      
      // Add other optional columns that exist and have non-null values
      for (const optCol of optionalColumns) {
        if (hasColumn(optCol) && !insertColumns.includes(optCol)) {
          const value = columnValueMap[optCol];
          // Only include if value is not null/undefined (or if it's explicitly set to null for nullable columns)
          if (value !== undefined && value !== null) {
            insertColumns.push(optCol);
            paramValues.push(value);
          } else if (columnMetadata[optCol]?.isNullable) {
            // Include nullable columns even with null values if they exist
            insertColumns.push(optCol);
            paramValues.push(null);
          }
        }
      }
      
      // Build VALUES placeholders
      // IMPORTANT: Normalize UUID parameters BEFORE building query to avoid PostgreSQL cast errors
      // Ensure all UUID values are either valid UUIDs or null, never empty strings
      for (let i = 0; i < paramValues.length; i++) {
        const col = insertColumns[i];
        if (col === 'material_id') {
          // Normalize empty strings to null for optional UUID columns
          if (paramValues[i] === '' || paramValues[i] === null || paramValues[i] === undefined) {
            paramValues[i] = null;
          }
        } else if (col === 'pricing_run_id' || col === 'rfq_item_id' || col === 'tenant_id') {
          // Required UUID columns - ensure they're not empty
          if (!paramValues[i] || paramValues[i].trim() === '') {
            throw new Error(`Required UUID column ${col} cannot be empty (value: "${paramValues[i]}")`);
          }
        }
      }

      const valuesPlaceholders = [];
      let paramIndex = 1;
      for (const col of insertColumns) {
        if (col === 'pricing_run_id' || col === 'rfq_item_id' || col === 'tenant_id') {
          valuesPlaceholders.push(`$${paramIndex}::uuid`);
        } else if (col === 'material_id') {
          valuesPlaceholders.push(`$${paramIndex}::uuid`);
        } else {
          valuesPlaceholders.push(`$${paramIndex}`);
        }
        paramIndex++;
      }
      
      console.log('[TRANSACTION DEBUG] Inserting pricing_run_item with pricing_run_id:', pricingRun.id);
      const itemResult = await client.query(
        `INSERT INTO pricing_run_items (
          ${insertColumns.join(', ')}
        )
        VALUES (${valuesPlaceholders.join(', ')})
        RETURNING *`,
        paramValues
      );

      pricingRunItems.push(itemResult.rows[0]);

      const itemDurationMs = Date.now() - itemStartMs;
      console.log(`[PERFORMANCE] Item ${itemIndex}/${rfqItems.length} completed in ${itemDurationMs}ms (${rfqItem.material_code || 'no-code'})`);
    }

    const pricingLoopMs = Date.now() - pricingLoopStartMs;
    console.log(`[PERFORMANCE] Pricing loop completed: ${pricingLoopMs}ms total, avg ${Math.round(pricingLoopMs / rfqItems.length)}ms per item`);
    timing.phase('taxAndTotals');

    // Phase 3: Calculate total import duty and final import duty across all items
    // Check if import_duty_amount column exists in rfq_items table
    let hasRfqItemsImportDutyColumn = false;
    try {
      const rfqItemsColumnCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'rfq_items' 
          AND column_name = 'import_duty_amount'
        );
      `);
      hasRfqItemsImportDutyColumn = rfqItemsColumnCheck.rows[0].exists;
    } catch (err) {
      console.warn('Could not check for import_duty_amount column in rfq_items:', err.message);
      hasRfqItemsImportDutyColumn = false;
    }

    let totalImportDuty = 0;
    if (hasRfqItemsImportDutyColumn) {
      const totalImportDutyResult = await client.query(
        `SELECT COALESCE(SUM(import_duty_amount), 0) as total_import_duty
         FROM rfq_items
         WHERE rfq_id = $1 AND import_duty_amount IS NOT NULL`,
        [trimmedRfqId]
      );
      totalImportDuty = parseFloat(totalImportDutyResult.rows[0].total_import_duty) || 0;
    }

    // Calculate total final import duty from pricing run items (Phase 5)
    // Check if import_duty_amount column exists in pricing_run_items table
    let hasPricingRunItemsImportDutyColumn = false;
    try {
      const pricingRunItemsColumnCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'pricing_run_items' 
          AND column_name = 'import_duty_amount'
        );
      `);
      hasPricingRunItemsImportDutyColumn = pricingRunItemsColumnCheck.rows[0].exists;
    } catch (err) {
      console.warn('Could not check for import_duty_amount column in pricing_run_items:', err.message);
      hasPricingRunItemsImportDutyColumn = false;
    }

    let totalFinalImportDuty = 0;
    if (hasPricingRunItemsImportDutyColumn) {
      const totalFinalImportDutyResult = await client.query(
        `SELECT COALESCE(SUM(import_duty_amount), 0) as total_final_import_duty
         FROM pricing_run_items
         WHERE pricing_run_id = $1 AND import_duty_amount IS NOT NULL`,
        [pricingRun.id]
      );
      totalFinalImportDuty = parseFloat(totalFinalImportDutyResult.rows[0].total_final_import_duty) || 0;
    }

    // Phase 9: Calculate aggregated logistics costs from pricing run items
    // Check if logistics columns exist in pricing_run_items table
    let hasFreightCostColumn = false;
    let hasInsuranceCostColumn = false;
    let hasHandlingCostColumn = false;
    let hasLocalChargesColumn = false;
    
    try {
      const logisticsColumnCheck = await client.query(`
        SELECT column_name
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'pricing_run_items' 
        AND column_name IN ('freight_cost', 'insurance_cost', 'handling_cost', 'local_charges')
      `);
      
      const existingLogisticsColumns = logisticsColumnCheck.rows.map(row => row.column_name);
      hasFreightCostColumn = existingLogisticsColumns.includes('freight_cost');
      hasInsuranceCostColumn = existingLogisticsColumns.includes('insurance_cost');
      hasHandlingCostColumn = existingLogisticsColumns.includes('handling_cost');
      hasLocalChargesColumn = existingLogisticsColumns.includes('local_charges');
    } catch (err) {
      console.warn('Could not check for logistics columns in pricing_run_items:', err.message);
      hasFreightCostColumn = false;
      hasInsuranceCostColumn = false;
      hasHandlingCostColumn = false;
      hasLocalChargesColumn = false;
    }

    // Build logistics query dynamically based on available columns
    let logisticsQuery;
    if (hasFreightCostColumn || hasInsuranceCostColumn || hasHandlingCostColumn || hasLocalChargesColumn) {
      const selectParts = [];
      if (hasFreightCostColumn) selectParts.push('COALESCE(SUM(freight_cost), 0) as total_freight');
      else selectParts.push('0 as total_freight');
      
      if (hasInsuranceCostColumn) selectParts.push('COALESCE(SUM(insurance_cost), 0) as total_insurance');
      else selectParts.push('0 as total_insurance');
      
      if (hasHandlingCostColumn) selectParts.push('COALESCE(SUM(handling_cost), 0) as total_handling');
      else selectParts.push('0 as total_handling');
      
      if (hasLocalChargesColumn) selectParts.push('COALESCE(SUM(local_charges), 0) as total_local');
      else selectParts.push('0 as total_local');
      
      logisticsQuery = `
        SELECT ${selectParts.join(', ')}
        FROM pricing_run_items
        WHERE pricing_run_id = $1
      `;
    } else {
      // No logistics columns exist, return zeros
      logisticsQuery = `
        SELECT 
          0 as total_freight,
          0 as total_insurance,
          0 as total_handling,
          0 as total_local
        FROM pricing_run_items
        WHERE pricing_run_id = $1
        LIMIT 1
      `;
    }
    
    const logisticsAggregateResult = await client.query(logisticsQuery, [pricingRun.id]);
    const logisticsAggregates = logisticsAggregateResult.rows[0] || {};
    const totalFreightCost = parseFloat(logisticsAggregates.total_freight) || 0;
    const totalInsuranceCost = parseFloat(logisticsAggregates.total_insurance) || 0;
    const totalHandlingCost = parseFloat(logisticsAggregates.total_handling) || 0;
    const totalLocalCharges = parseFloat(logisticsAggregates.total_local) || 0;
    const totalLogisticsCost = totalFreightCost + totalInsuranceCost + totalHandlingCost + totalLocalCharges;

    // Calculate tax for the pricing run
    const taxStartMs = Date.now();
    const clientCountry = await getClientCountry(clientId);
    const taxCalculation = await calculatePricingRunTax(
      pricingRun,
      pricingRunItems,
      clientCountry
    );
    const taxMs = Date.now() - taxStartMs;

    // Calculate complete landed cost total (Phase 9)
    const landedCostTotal = totalPrice + totalFinalImportDuty + totalLogisticsCost;

    // Update pricing run with total price, tax, duty, and logistics information
    // Phase 9: Include logistics cost aggregates and total landed cost
    let updateResult;
    try {
      updateResult = await client.query(
        `UPDATE pricing_runs
         SET total_price = $1,
             subtotal = $2,
             tax_amount = $3,
             tax_rate = $4,
             tax_country = $5,
             tax_type = $6,
             total_with_tax = $7,
             total_final_import_duty = $8,
             total_freight_cost = $9,
             total_insurance_cost = $10,
             total_handling_cost = $11,
             total_local_charges = $12,
             total_landed_cost = $13,
             approval_status = 'pending_approval'
         WHERE id = $14
         RETURNING *`,
        [
          totalPrice, // original total (pre-tax)
          taxCalculation.subtotal,
          taxCalculation.tax_amount,
          taxCalculation.tax_rate,
          taxCalculation.tax_country,
          taxCalculation.tax_type,
          taxCalculation.total_with_tax,
          totalFinalImportDuty,
          totalFreightCost,
          totalInsuranceCost,
          totalHandlingCost,
          totalLocalCharges,
          landedCostTotal,
          pricingRun.id
        ]
      );
    } catch (error) {
      // If Phase 9 columns don't exist, fall back to Phase 5 update
      if (error.message && (error.message.includes('total_freight_cost') || error.message.includes('total_landed_cost'))) {
        console.warn('[Pricing] Phase 9 logistics columns not found, using Phase 5 update');
        updateResult = await client.query(
          `UPDATE pricing_runs
           SET total_price = $1,
               subtotal = $2,
               tax_amount = $3,
               tax_rate = $4,
               tax_country = $5,
               tax_type = $6,
               total_with_tax = $7,
               total_final_import_duty = $8,
               approval_status = 'pending_approval'
           WHERE id = $9
           RETURNING *`,
          [
            totalPrice,
            taxCalculation.subtotal,
            taxCalculation.tax_amount,
            taxCalculation.tax_rate,
            taxCalculation.tax_country,
            taxCalculation.tax_type,
            taxCalculation.total_with_tax,
            totalFinalImportDuty,
            pricingRun.id
          ]
        );
      } else {
        throw error;
      }
    }

    // Update each pricing run item with tax information
    for (const itemWithTax of taxCalculation.items) {
      await client.query(
        `UPDATE pricing_run_items
         SET subtotal = $1,
             tax_amount = $2,
             tax_rate = $3,
             tax_exempt = $4,
             exemption_reason = $5,
             total_with_tax = $6
         WHERE id = $7`,
        [
          itemWithTax.subtotal,
          itemWithTax.tax_amount,
          itemWithTax.tax_rate,
          itemWithTax.tax_exempt,
          itemWithTax.exemption_reason || null,
          itemWithTax.total_with_tax,
          itemWithTax.id
        ]
      );
    }

    pricingRun.total_price = totalPrice;
    pricingRun.subtotal = taxCalculation.subtotal;
    pricingRun.tax_amount = taxCalculation.tax_amount;
    pricingRun.tax_rate = taxCalculation.tax_rate;
    pricingRun.tax_country = taxCalculation.tax_country;
    pricingRun.tax_type = taxCalculation.tax_type;
    pricingRun.total_with_tax = taxCalculation.total_with_tax;
    pricingRun.total_import_duty = totalImportDuty; // Phase 3: Total import duty across all items
    pricingRun.status = 'completed';
    // Note: taxCalculation.items can contain circular references, don't assign directly
    // Items will be fetched separately via getPricingRunById if needed

    // Stage 8: Regulatory Advisory Integration (ADVISORY MODE ONLY)
    // This adds advisory metadata without changing pricing totals
    let regulatoryAdvisory = null;
    try {
      const regulatoryStartMs = Date.now();
      // Get project and client info for regulatory validation
      const projectInfo = projectId ? await client.query(
        'SELECT p.*, c.name as client_name FROM projects p JOIN clients c ON p.client_id = c.id WHERE p.id = $1',
        [projectId]
      ).then(r => r.rows[0] || null) : null;
      
      const operator = projectInfo?.client_name || null;
      
      // Build regulatory advisory for each line item
      const regulatoryLines = [];
      
      for (const item of pricingRunItems) {
        // Get material info if available
        let materialGroup = 'OTHER';
        let category = item.origin_type ? 'OTHER' : 'OTHER'; // Will be set from material lookup
        
        if (item.material_id) {
          const materialResult = await client.query(
            'SELECT category, material_type FROM materials WHERE id = $1',
            [item.material_id]
          );
          
          if (materialResult.rows.length > 0) {
            const material = materialResult.rows[0];
            category = material.category || 'OTHER';
            
            // Map material_type to material_group for HS code lookup
            const materialType = (material.material_type || '').toUpperCase();
            if (materialType.includes('CARBON') || materialType.includes('CS')) {
              materialGroup = 'CARBON_STEEL';
            } else if (materialType.includes('STAINLESS') || materialType.includes('SS')) {
              materialGroup = 'STAINLESS_STEEL';
            } else if (materialType.includes('ALLOY')) {
              materialGroup = 'ALLOY_STEEL';
            } else if (materialType.includes('DUPLEX')) {
              materialGroup = 'DUPLEX_STEEL';
            } else if (materialType.includes('NICKEL')) {
              materialGroup = 'NICKEL_ALLOY';
            } else if (materialType.includes('COPPER')) {
              materialGroup = 'COPPER_ALLOY';
            } else if (materialType.includes('ALUMINUM') || materialType.includes('ALUMINIUM')) {
              materialGroup = 'ALUMINUM';
            }
          }
        }
        
        // Find HS code for this item
        const hsCodeResult = await findHsCodeForItem({
          category: category,
          materialGroup: materialGroup,
          materialId: item.material_id
        });
        
        // Calculate duty if HS code found
        let dutyEstimate = null;
        if (hsCodeResult.status === 'FOUND' && hsCodeResult.hsCodeId) {
          // Use origin from item, destination from client country
          const originCountry = item.origin_type === 'CHINA' ? 'CN' : 
                               item.origin_type === 'NON_CHINA' ? 'MY' : 'MY'; // Default to MY
          const destinationCountry = clientCountry || 'MY';
          const customsValue = parseFloat(item.base_cost || 0);
          
          dutyEstimate = await calculateDuty({
            hsCodeId: hsCodeResult.hsCodeId,
            originCountry: originCountry,
            destinationCountry: destinationCountry,
            customsValue: customsValue
          });
        }
        
        regulatoryLines.push({
          lineId: item.id,
          category: category,
          materialGroup: materialGroup,
          hsCode: hsCodeResult.hsCode || null,
          hsCodeId: hsCodeResult.hsCodeId || null,
          dutyEstimate: dutyEstimate ? {
            dutyAmount: dutyEstimate.dutyAmount,
            dutyRatePct: dutyEstimate.dutyRatePct,
            ruleSource: dutyEstimate.ruleSource,
            status: dutyEstimate.status
          } : null,
          status: hsCodeResult.status,
          notes: hsCodeResult.notes
        });
      }
      
      // Validate regulatory compliance
      const complianceItems = pricingRunItems.map(item => ({
        material_family: item.origin_type ? 'OTHER' : 'OTHER', // Simplified
        category: 'OTHER', // Will be enhanced with actual category
        description: item.notes || 'Item'
      }));
      
      const complianceResult = await validateRegulatoryCompliance({
        project: {
          project_type: projectType
        },
        operator: operator,
        items: complianceItems
      });
      
      regulatoryAdvisory = {
        mode: stage8Config.mode,
        lines: regulatoryLines,
        overallIssues: complianceResult.issues || [],
        complianceStatus: complianceResult.status,
        notes: complianceResult.notes
      };
      
      // Store regulatory advisory in pricing_run
      await client.query(
        'UPDATE pricing_runs SET regulatory_advisory = $1 WHERE id = $2',
        [JSON.stringify(regulatoryAdvisory), pricingRun.id]
      );
      
      if (stage8Config.logAdvisoryInfo) {
        console.log(`[Stage 8] Regulatory advisory added to pricing run ${pricingRun.id}`);
      }

      const regulatoryMs = Date.now() - regulatoryStartMs;
      timing.phase('regulatoryAdvisory');
      
    } catch (regulatoryError) {
      // In ADVISORY mode, don't fail pricing if regulatory lookup fails
      if (stage8Config.logAdvisoryInfo) {
        console.warn(`[Stage 8] Error generating regulatory advisory:`, regulatoryError.message);
      }
      // Continue without regulatory advisory
    }

    log.logInfo('Pricing calculation completed', {
      ...logContext,
      operation: 'pricing_calculation_end',
      itemCount: pricingRunItems.length,
      totalPrice,
    });

    log.logInfo('Pricing run creation completed', {
      ...logContext,
      operation: 'pricing_run_creation_end',
    });

    timing.phase('savePricingRun');
    
    // Return the pricing run ID only - we'll fetch a clean version outside the transaction
    return { id: pricingRun.id };
  } catch (error) {
    log.logError('Pricing run creation failed', error, {
      ...logContext,
      operation: 'pricing_run_creation_error',
    });
    timing.fail(error);
    throw error;
  }
  });

  timing.complete();

  const pricingFinishTime = Date.now();
  const pricingFinishTimestamp = new Date().toISOString();
  
  // Calculate time from AI detection to pricing finish
  const aiPricingTimingTracker = require('../utils/aiPricingTimingTracker');
  const aiToPricingTiming = aiPricingTimingTracker.calculateAiToPricingTime(rfqId);
  
  let timingSummary = '';
  if (aiToPricingTiming) {
    timingSummary = `
🤖→💰 [AI DETECTION TO PRICING FINISH]
  AI Detection Start: ${aiToPricingTiming.aiDetectionTimestamp}
  Pricing Finish:     ${aiToPricingTiming.pricingFinishTimestamp}
  ⏱️  TOTAL ELAPSED TIME: ${aiToPricingTiming.elapsedSeconds}s (${aiToPricingTiming.elapsedMs}ms)
============================================`;
  }
  
  console.log(`
============================================
💰 [PRICING FINISH] ${pricingFinishTimestamp}
============================================
[PERFORMANCE SUMMARY] Pricing Run Complete
Items Processed: ${rfqItems.length}
Materials Fetched (batch): ${materialsMap.size}
${timingSummary}
💰 [PRICING FINISH COMPLETE]
============================================
  `);

  // Fetch a clean, serializable version of the pricing run using the service method
  // This ensures we return a properly formatted object without circular references
  const pricingRunId = result.id;
  const cleanPricingRun = await getPricingRunById(pricingRunId, trimmedTenantId);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/05b70e28-6b22-448b-b7a8-b7db24fa959d',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      sessionId:'debug-session',
      runId:'pricing-run-debug',
      hypothesisId:'H3',
      location:'pricingService.js:createPriceRunForRfq:before-return',
      message:'Clean pricing run ready',
      data:{pricingRunId, items:(cleanPricingRun?.items||[]).length, status:cleanPricingRun?.status},
      timestamp:Date.now()
    })
  }).catch(()=>{});
  // #endregion agent log

  return cleanPricingRun;
}

/**
 * Updates pricing run outcome (won/lost)
 * @param {string} pricingRunId - Pricing run UUID
 * @param {string} outcome - 'won' or 'lost'
 * @param {string} tenantId - Tenant UUID (required)
 * @param {string} notes - Optional notes about the outcome
 * @returns {Promise<Object>} Updated pricing run
 */
/**
 * Updates the outcome fields for a pricing run
 * @param {string} pricingRunId - Pricing run UUID
 * @param {string} outcome - Outcome value: 'won', 'lost', 'pending', or 'cancelled'
 * @param {string} tenantId - Tenant UUID (required)
 * @param {string|null} outcomeDate - Optional ISO date string for outcome_date
 * @param {string|null} outcomeReason - Optional reason/notes for the outcome
 * @returns {Promise<Object>} Updated pricing run
 */
async function updatePricingRunOutcome(pricingRunId, outcome, tenantId, outcomeDate = null, outcomeReason = null) {
  const db = await connectDb();

  // Validate outcome
  if (!['won', 'lost', 'pending', 'cancelled'].includes(outcome)) {
    throw new Error('Outcome must be one of: "won", "lost", "pending", "cancelled"');
  }

  // Check if pricing run exists and belongs to tenant
  const checkResult = await db.query(
    `SELECT pr.id, pr.approval_status FROM pricing_runs pr
     JOIN rfqs r ON pr.rfq_id = r.id
     WHERE pr.id = $1 AND pr.tenant_id = $2 AND r.tenant_id = $2`,
    [pricingRunId, tenantId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  // Build UPDATE query with only provided fields
  const updates = [];
  const values = [];
  let paramIndex = 1;

  updates.push(`outcome = $${paramIndex++}`);
  values.push(outcome);

  if (outcomeDate !== null && outcomeDate !== undefined) {
    updates.push(`outcome_date = $${paramIndex++}::timestamptz`);
    values.push(outcomeDate);
  } else if (outcome === 'won' || outcome === 'lost') {
    // Optionally set outcome_date to now() if not provided and outcome is won/lost
    // For minimalism, we'll leave it null unless explicitly provided
  }

  if (outcomeReason !== null && outcomeReason !== undefined) {
    updates.push(`outcome_reason = $${paramIndex++}`);
    values.push(outcomeReason);
  }

  values.push(pricingRunId);
  const whereClause = `WHERE id = $${paramIndex}`;

  // Update the pricing run
  const result = await db.query(
    `UPDATE pricing_runs
     SET ${updates.join(', ')}
     ${whereClause}
     RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Creates a revision of a pricing run
 * Creates a snapshot in pricing_run_versions before creating the new revision
 * @param {string} pricingRunId - Original pricing run UUID
 * @param {string} reason - Reason for revision
 * @param {string} tenantId - Tenant UUID (required)
 * @param {string} createdBy - User creating the revision (optional)
 * @returns {Promise<Object>} New pricing run (revision)
 */
async function createPricingRunRevision(pricingRunId, reason, tenantId, createdBy = null) {
  const db = await connectDb();

  await db.query('BEGIN');

  try {
    // Get original pricing run with all items
    const originalRun = await getPricingRunById(pricingRunId, tenantId);

    if (!originalRun) {
      throw new Error('Original pricing run not found');
    }

    // Get current version number for this pricing run
    const versionResult = await db.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
       FROM pricing_run_versions
       WHERE pricing_run_id = $1`,
      [pricingRunId]
    );
    const nextVersion = versionResult.rows[0]?.next_version || 1;

    // Create snapshot in pricing_run_versions table
    const snapshotData = {
      pricing_run: {
        id: originalRun.id,
        rfq_id: originalRun.rfq_id,
        status: originalRun.status,
        total_price: originalRun.total_price,
        approval_status: originalRun.approval_status,
        created_at: originalRun.created_at,
        updated_at: originalRun.updated_at,
      },
      items: originalRun.items.map(item => ({
        id: item.id,
        rfq_item_id: item.rfq_item_id,
        base_cost: item.base_cost,
        markup_pct: item.markup_pct,
        logistics_cost: item.logistics_cost,
        risk_pct: item.risk_pct,
        risk_cost: item.risk_cost,
        unit_price: item.unit_price,
        total_price: item.total_price,
        currency: item.currency,
        origin_type: item.origin_type,
        material_id: item.material_id,
        notes: item.notes,
        rule_origin_type: item.rule_origin_type,
        rule_category: item.rule_category,
        rule_level: item.rule_level,
        pricing_method: item.pricing_method,
      })),
    };

    // Save snapshot to pricing_run_versions
    await db.query(
      `INSERT INTO pricing_run_versions (
        pricing_run_id,
        version_number,
        snapshot_data,
        revision_reason,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5)`,
      [
        pricingRunId,
        nextVersion,
        JSON.stringify(snapshotData),
        reason || 'Revision created',
        createdBy,
      ]
    );

    // Determine parent version ID (if this is a revision of a revision)
    // Check if original run has a parent_version_id, otherwise use the original run's ID
    // Tenant isolation – Phase 1: Added tenant_id filter via JOIN for defense-in-depth
    // JOIN to rfqs to filter by tenant_id for defense-in-depth
    const parentCheckResult = await db.query(
      `SELECT pr.parent_version_id 
       FROM pricing_runs pr
       JOIN rfqs r ON pr.rfq_id = r.id
       WHERE pr.id = $1 AND r.tenant_id = $2`,
      [pricingRunId, tenantId]
    );
    const parentVersionId = parentCheckResult.rows[0]?.parent_version_id || pricingRunId;

    // Get next version number for the new pricing run
    const newVersionResult = await db.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
       FROM pricing_runs
       WHERE id = $1 OR parent_version_id = $1`,
      [parentVersionId]
    );
    const newVersionNumber = newVersionResult.rows[0]?.next_version || 1;

    // Create new pricing run (revision) with tenant_id
    const newRunResult = await db.query(
      `INSERT INTO pricing_runs (
        rfq_id,
        parent_version_id,
        version_number,
        approval_status,
        tenant_id
      )
      VALUES ($1, $2, $3, 'draft', $4)
      RETURNING *`,
      [originalRun.rfq_id, parentVersionId, newVersionNumber, tenantId]
    );

    const newRun = newRunResult.rows[0];

    // Copy all items from original run (with tenant_id)
    const itemsCopyResult = await db.query(
      `INSERT INTO pricing_run_items (
        pricing_run_id, rfq_item_id,
        base_cost, markup_pct, logistics_cost,
        risk_pct, risk_cost,
        unit_price, total_price,
        currency, origin_type, material_id, notes,
        rule_origin_type, rule_category, rule_level,
        pricing_method, tenant_id
      )
      SELECT
        $1, rfq_item_id,
        base_cost, markup_pct, logistics_cost,
        risk_pct, risk_cost,
        unit_price, total_price,
        currency, origin_type, material_id, notes,
        rule_origin_type, rule_category, rule_level,
        pricing_method, tenant_id
      FROM pricing_run_items
      WHERE pricing_run_id = $2
      RETURNING *`,
      [newRun.id, pricingRunId]
    );

    // Update total price
    const totalPrice = itemsCopyResult.rows.reduce(
      (sum, item) => sum + parseFloat(item.total_price),
      0
    );

    await db.query(
      'UPDATE pricing_runs SET total_price = $1 WHERE id = $2',
      [totalPrice, newRun.id]
    );

    await db.query('COMMIT');

    // Return the new revision with items
    return getPricingRunById(newRun.id, tenantId);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * Gets all versions (revisions) of a pricing run
 * @param {string} pricingRunId - Pricing run UUID (can be parent or child)
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Array>} Array of pricing run versions
 */
async function getPricingRunVersions(pricingRunId, tenantId) {
  const db = await connectDb();

  // First, determine if this is a parent or child and verify tenant
  const checkResult = await db.query(
    `SELECT pr.id, pr.parent_version_id FROM pricing_runs pr
     JOIN rfqs r ON pr.rfq_id = r.id
     WHERE pr.id = $1 AND r.tenant_id = $2`,
    [pricingRunId, tenantId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const run = checkResult.rows[0];
  const parentId = run.parent_version_id || run.id;

  // Get all versions (parent + all children) with tenant scoping
  const result = await db.query(
    `SELECT pr.*,
            COUNT(pri.id) as item_count,
            r.rfq_name as rfq_title,
            c.name as client_name
     FROM pricing_runs pr
     LEFT JOIN pricing_run_items pri ON pr.id = pri.pricing_run_id
     LEFT JOIN rfqs r ON pr.rfq_id = r.id
     LEFT JOIN projects p ON r.project_id = p.id
     LEFT JOIN clients c ON p.client_id = c.id
     WHERE (pr.id = $1 OR pr.parent_version_id = $1)
       AND r.tenant_id = $2
     GROUP BY pr.id, r.rfq_name, c.name
     ORDER BY pr.version_number ASC, pr.created_at ASC`,
    [parentId, tenantId]
  );

  return result.rows;
}

/**
 * Gets version snapshots from pricing_run_versions table
 * @param {string} pricingRunId - Pricing run UUID
 * @param {string} tenantId - Tenant UUID (required)
 * @returns {Promise<Array>} Array of version snapshots
 */
async function getVersionSnapshots(pricingRunId, tenantId) {
  const db = await connectDb();

  // Verify pricing run belongs to tenant
  const verifyResult = await db.query(
    `SELECT pr.id FROM pricing_runs pr
     JOIN rfqs r ON pr.rfq_id = r.id
     WHERE pr.id = $1 AND r.tenant_id = $2`,
    [pricingRunId, tenantId]
  );

  if (verifyResult.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const result = await db.query(
    `SELECT * FROM pricing_run_versions
     WHERE pricing_run_id = $1
     ORDER BY version_number ASC`,
    [pricingRunId]
  );

  return result.rows.map(row => ({
    ...row,
    snapshot_data: typeof row.snapshot_data === 'string' 
      ? JSON.parse(row.snapshot_data) 
      : row.snapshot_data,
  }));
}

/**
 * Compares two versions of a pricing run
 * @param {string} pricingRunId - Pricing run UUID
 * @param {number} version1 - First version number
 * @param {string} tenantId - Tenant UUID (required)
 * @param {number} version2 - Second version number (optional, defaults to current)
 * @returns {Promise<Object>} Comparison result
 */
async function compareVersions(pricingRunId, version1, tenantId, version2 = null) {
  const db = await connectDb();

  // Get version snapshots
  const snapshots = await getVersionSnapshots(pricingRunId, tenantId);

  if (snapshots.length === 0) {
    throw new Error('No version snapshots found for this pricing run');
  }

  // Find version 1
  const v1Snapshot = snapshots.find(s => s.version_number === version1);
  if (!v1Snapshot) {
    throw new Error(`Version ${version1} not found`);
  }

  let v2Snapshot;
  if (version2 === null) {
    // Compare with current pricing run
    const currentRun = await getPricingRunById(pricingRunId, tenantId);
    v2Snapshot = {
      snapshot_data: {
        pricing_run: {
          id: currentRun.id,
          rfq_id: currentRun.rfq_id,
          status: currentRun.status,
          total_price: currentRun.total_price,
          approval_status: currentRun.approval_status,
        },
        items: currentRun.items,
      },
      version_number: 'current',
    };
  } else {
    v2Snapshot = snapshots.find(s => s.version_number === version2);
    if (!v2Snapshot) {
      throw new Error(`Version ${version2} not found`);
    }
  }

  const v1 = v1Snapshot.snapshot_data;
  const v2 = v2Snapshot.snapshot_data;

  // Compare pricing run totals
  const totalPriceDiff = parseFloat(v2.pricing_run.total_price) - parseFloat(v1.pricing_run.total_price);
  const totalPricePercentChange = v1.pricing_run.total_price > 0
    ? (totalPriceDiff / parseFloat(v1.pricing_run.total_price)) * 100
    : 0;

  // Compare items
  const itemComparisons = [];
  const v1ItemsMap = new Map(v1.items.map(item => [item.rfq_item_id, item]));
  const v2ItemsMap = new Map(v2.items.map(item => [item.rfq_item_id, item]));

  // Find all unique item IDs
  const allItemIds = new Set([...v1ItemsMap.keys(), ...v2ItemsMap.keys()]);

  for (const itemId of allItemIds) {
    const v1Item = v1ItemsMap.get(itemId);
    const v2Item = v2ItemsMap.get(itemId);

    if (!v1Item) {
      itemComparisons.push({
        rfq_item_id: itemId,
        status: 'added',
        v1: null,
        v2: v2Item,
        price_diff: parseFloat(v2Item.total_price),
      });
    } else if (!v2Item) {
      itemComparisons.push({
        rfq_item_id: itemId,
        status: 'removed',
        v1: v1Item,
        v2: null,
        price_diff: -parseFloat(v1Item.total_price),
      });
    } else {
      const priceDiff = parseFloat(v2Item.total_price) - parseFloat(v1Item.total_price);
      const unitPriceDiff = parseFloat(v2Item.unit_price) - parseFloat(v1Item.unit_price);
      const hasChanges = priceDiff !== 0 ||
                        v1Item.pricing_method !== v2Item.pricing_method;

      if (hasChanges) {
        itemComparisons.push({
          rfq_item_id: itemId,
          status: 'modified',
          v1: v1Item,
          v2: v2Item,
          price_diff: priceDiff,
          unit_price_diff: unitPriceDiff,
          pricing_method_changed: v1Item.pricing_method !== v2Item.pricing_method,
        });
      }
    }
  }

  return {
    pricing_run_id: pricingRunId,
    version1: {
      number: version1,
      snapshot: v1Snapshot,
    },
    version2: {
      number: version2 === null ? 'current' : version2,
      snapshot: v2Snapshot,
    },
    summary: {
      total_price_diff: totalPriceDiff,
      total_price_percent_change: totalPricePercentChange,
      items_changed: itemComparisons.length,
      items_added: itemComparisons.filter(c => c.status === 'added').length,
      items_removed: itemComparisons.filter(c => c.status === 'removed').length,
      items_modified: itemComparisons.filter(c => c.status === 'modified').length,
    },
    item_changes: itemComparisons,
  };
}

/**
 * Assert that an RFQ has no locked pricing runs.
 * Throws PRICING_RUN_LOCKED error if any locked run exists.
 *
 * @param {string} rfqId - RFQ UUID
 * @param {string} tenantId - Tenant UUID
 * @param {object} client - Database client (optional, uses withTenantContext if not provided)
 * @throws {Error} PRICING_RUN_LOCKED if any locked pricing run exists for this RFQ
 */
async function assertRfqNotLocked(rfqId, tenantId, client = null) {
  const { validateUuidOrThrow } = require('../utils/uuidValidation');
  const trimmedRfqId = validateUuidOrThrow(rfqId, 'rfqId');
  const trimmedTenantId = validateUuidOrThrow(tenantId, 'tenantId');

  const queryFn = async (queryClient) => {
    const result = await queryClient.query(
      `SELECT pr.id, pr.locked_at, pr.locked_by
       FROM pricing_runs pr
       JOIN rfqs r ON pr.rfq_id = r.id
       WHERE pr.rfq_id = $1 AND r.tenant_id = $2 AND pr.is_locked = true
       LIMIT 1`,
      [trimmedRfqId, trimmedTenantId]
    );

    if (result.rows.length > 0) {
      const lockedRun = result.rows[0];
      const error = new Error('RFQ is locked. Create a new pricing run version to edit.');
      error.code = 'PRICING_RUN_LOCKED';
      error.statusCode = 409;
      error.details = {
        pricing_run_id: lockedRun.id,
        locked_at: lockedRun.locked_at,
        locked_by: lockedRun.locked_by,
      };
      throw error;
    }
  };

  if (client) {
    // If client provided, use it directly (already in tenant context)
    await queryFn(client);
  } else {
    // Otherwise establish tenant context
    await withTenantContext(trimmedTenantId, queryFn);
  }
}

async function lockPricingRun(pricingRunId, tenantId, lockedBy = null) {
  const { validateUuidOrThrow } = require('../utils/uuidValidation');
  const trimmedPricingRunId = validateUuidOrThrow(pricingRunId, 'pricingRunId');
  const trimmedTenantId = validateUuidOrThrow(tenantId, 'tenantId');

  return await withTenantContext(trimmedTenantId, async (client) => {
    const result = await client.query(
      `UPDATE pricing_runs pr
       SET is_locked = true,
           locked_at = COALESCE(pr.locked_at, NOW()),
           locked_by = COALESCE($3, pr.locked_by),
           updated_at = NOW()
       FROM rfqs r
       WHERE pr.id = $1 AND pr.rfq_id = r.id AND r.tenant_id = $2
       RETURNING pr.*`,
      [trimmedPricingRunId, trimmedTenantId, lockedBy]
    );

    if (result.rows.length === 0) {
      throw new Error('Pricing run not found');
    }

    return result.rows[0];
  });
}

module.exports = {
  getPricingRunsByRfqId,
  getPricingRunById,
  createPriceRunForRfq,
  updatePricingRunOutcome,
  createPricingRunRevision,
  getPricingRunVersions,
  getVersionSnapshots,
  compareVersions,
  lockPricingRun,
  assertRfqNotLocked,
};
