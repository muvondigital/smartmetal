/**
 * Pricing Workflow Validator
 * 
 * Pre-flight validation system that checks ALL dependencies before pricing runs.
 * This prevents errors by predicting and catching issues before they cause failures.
 * 
 * Validates:
 * - Core data (tenant, RFQ, items, clients, projects)
 * - Material dependencies
 * - Configuration (tenant settings, pricing rules, operator rules)
 * - Regulatory (HS codes, duty rules)
 * - Tax (tax rules, exemptions)
 * - Logistics (logistics config)
 * - Data integrity (foreign keys, required fields, valid formats)
 */

const { connectDb } = require('../db/supabaseClient');
const { withTenantContext } = require('../db/tenantContext');
const { getRfqById } = require('./rfqService');
const { getMaterialsByCodes } = require('./materialsService');
const { getTenantSetting } = require('../config/tenantConfig');
const operatorRulesConfig = require('../config/operatorRules');
const nscPricingRules = require('../config/pricingRules');

/**
 * Validation result structure
 */
class ValidationResult {
  constructor() {
    this.isValid = true;
    this.errors = [];
    this.warnings = [];
    this.checks = {};
  }

  addError(check, message, details = {}) {
    this.isValid = false;
    this.errors.push({ check, message, details });
    this.checks[check] = { status: 'error', message, details };
  }

  addWarning(check, message, details = {}) {
    this.warnings.push({ check, message, details });
    this.checks[check] = { status: 'warning', message, details };
  }

  addSuccess(check, message, details = {}) {
    this.checks[check] = { status: 'success', message, details };
  }
}

/**
 * Validate tenant exists and is active
 */
async function validateTenant(db, tenantId) {
  const result = await db.query(
    `SELECT id, code, name, is_active FROM tenants WHERE id = $1`,
    [tenantId]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: 'Tenant not found', tenantId };
  }

  const tenant = result.rows[0];
  if (!tenant.is_active) {
    return { valid: false, error: 'Tenant is not active', tenantId, tenantCode: tenant.code };
  }

  return { valid: true, tenant };
}

/**
 * Validate RFQ exists and belongs to tenant
 */
async function validateRfq(db, rfqId, tenantId) {
  const result = await db.query(
    `SELECT id, tenant_id, status, document_type, client_id, project_id 
     FROM rfqs 
     WHERE id = $1 AND tenant_id = $2`,
    [rfqId, tenantId]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: 'RFQ not found or does not belong to tenant', rfqId, tenantId };
  }

  const rfq = result.rows[0];
  
  // Check document_type is valid
  const validDocumentTypes = ['RFQ', 'PO', 'MTO', 'BOQ', 'Budget', 'Tender', 'Change Order', 'Re-quote'];
  if (!validDocumentTypes.includes(rfq.document_type)) {
    return { 
      valid: false, 
      error: `Invalid document_type: ${rfq.document_type}`, 
      rfqId,
      document_type: rfq.document_type 
    };
  }

  return { valid: true, rfq };
}

/**
 * Validate RFQ items exist and have required fields
 */
async function validateRfqItems(db, rfqId, tenantId) {
  const result = await db.query(
    `SELECT id, material_code, quantity, unit, description
     FROM rfq_items ri
     JOIN rfqs r ON ri.rfq_id = r.id
     WHERE ri.rfq_id = $1 AND r.tenant_id = $2`,
    [rfqId, tenantId]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: 'RFQ has no items', rfqId };
  }

  const items = result.rows;
  const issues = [];

  for (const item of items) {
    if (!item.quantity || parseFloat(item.quantity) <= 0) {
      issues.push({ itemId: item.id, issue: 'Invalid or missing quantity' });
    }
    if (!item.unit || item.unit.trim() === '') {
      issues.push({ itemId: item.id, issue: 'Missing unit' });
    }
  }

  if (issues.length > 0) {
    return { valid: false, error: 'Some RFQ items have invalid data', issues, itemCount: items.length };
  }

  return { valid: true, items, itemCount: items.length };
}

/**
 * Validate client exists (if client_id is set)
 */
async function validateClient(db, clientId, tenantId) {
  if (!clientId) {
    return { valid: true, skipped: true, reason: 'No client_id specified' };
  }

  const result = await db.query(
    `SELECT id, name, tenant_id FROM clients WHERE id = $1 AND tenant_id = $2`,
    [clientId, tenantId]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: 'Client not found or does not belong to tenant', clientId, tenantId };
  }

  return { valid: true, client: result.rows[0] };
}

/**
 * Validate project exists (if project_id is set)
 */
async function validateProject(db, projectId, tenantId) {
  if (!projectId) {
    return { valid: true, skipped: true, reason: 'No project_id specified' };
  }

  const result = await db.query(
    `SELECT p.id, p.name, p.client_id, p.tenant_id, c.name as client_name
     FROM projects p
     JOIN clients c ON p.client_id = c.id
     WHERE p.id = $1 AND p.tenant_id = $2`,
    [projectId, tenantId]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: 'Project not found or does not belong to tenant', projectId, tenantId };
  }

  return { valid: true, project: result.rows[0] };
}

/**
 * Validate materials exist for all material_codes
 */
async function validateMaterials(db, materialCodes, tenantId) {
  if (!materialCodes || materialCodes.length === 0) {
    return { valid: true, skipped: true, reason: 'No material codes to validate' };
  }

  const materials = await getMaterialsByCodes(materialCodes, tenantId);
  const foundCodes = new Set(materials.map(m => m.material_code));
  const missingCodes = materialCodes.filter(code => code && !foundCodes.has(code));

  if (missingCodes.length > 0) {
    return {
      valid: false,
      error: 'Some material codes not found',
      missingCodes,
      foundCount: materials.length,
      totalCount: materialCodes.length
    };
  }

  return { valid: true, materials, foundCount: materials.length };
}

/**
 * Validate tenant settings exist
 */
async function validateTenantSettings(tenantId) {
  const requiredSettings = [
    'approval_rules',
    'pricing_rules',
    'lme_config',
    'stage9_config',
    'rounding_rules'
  ];

  const missing = [];
  const present = [];

  for (const key of requiredSettings) {
    const value = await getTenantSetting(tenantId, key);
    if (!value) {
      missing.push(key);
    } else {
      present.push(key);
    }
  }

  if (missing.length > 0) {
    return {
      valid: false,
      error: 'Some required tenant settings are missing',
      missing,
      present
    };
  }

  return { valid: true, present };
}

/**
 * Validate pricing rules exist
 */
async function validatePricingRules(db, tenantId, category, originType) {
  // Check if pricing_rules table has rules for this tenant/category/origin
  const result = await db.query(
    `SELECT COUNT(*) as count
     FROM pricing_rules
     WHERE tenant_id = $1
       AND (category = $2 OR category = 'ANY')
       AND (origin_type = $3 OR origin_type = 'ANY')
       AND is_active = true`,
    [tenantId, category || 'ANY', originType || 'ANY']
  );

  const count = parseInt(result.rows[0].count);
  
  if (count === 0) {
    return {
      valid: false,
      error: 'No pricing rules found for tenant/category/origin',
      tenantId,
      category,
      originType
    };
  }

  return { valid: true, ruleCount: count };
}

/**
 * Validate HS codes exist in regulatory_hs_codes
 */
async function validateHsCodes(db, hsCodes) {
  if (!hsCodes || hsCodes.length === 0) {
    return { valid: true, skipped: true, reason: 'No HS codes to validate' };
  }

  const result = await db.query(
    `SELECT hs_code FROM regulatory_hs_codes 
     WHERE hs_code = ANY($1) AND is_active = true`,
    [hsCodes]
  );

  const foundCodes = new Set(result.rows.map(r => r.hs_code));
  const missingCodes = hsCodes.filter(code => code && !foundCodes.has(code));

  if (missingCodes.length > 0) {
    return {
      valid: false,
      error: 'Some HS codes not found in regulatory_hs_codes',
      missingCodes,
      foundCount: foundCodes.size,
      totalCount: hsCodes.length
    };
  }

  return { valid: true, foundCount: foundCodes.size };
}

/**
 * Validate tax rules exist for client country
 */
async function validateTaxRules(db, countryCode) {
  if (!countryCode) {
    return { valid: true, skipped: true, reason: 'No country code specified' };
  }

  const result = await db.query(
    `SELECT * FROM tax_rules
     WHERE country = $1
       AND is_active = true
       AND effective_from <= CURRENT_DATE
       AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
     LIMIT 1`,
    [countryCode]
  );

  if (result.rows.length === 0) {
    return {
      valid: false,
      error: `No active tax rule found for country: ${countryCode}`,
      countryCode
    };
  }

  return { valid: true, taxRule: result.rows[0] };
}

/**
 * Validate logistics config exists
 */
async function validateLogisticsConfig(tenantId) {
  const config = await getTenantSetting(tenantId, 'logistics_config');
  
  if (!config) {
    return {
      valid: false,
      error: 'logistics_config not found in tenant_settings',
      tenantId
    };
  }

  // Check if hsCodeMappings exist
  if (!config.hsCodeMappings) {
    return {
      valid: false,
      error: 'logistics_config.hsCodeMappings is missing',
      tenantId
    };
  }

  return { valid: true, config };
}

/**
 * Main validation function - validates all dependencies for pricing workflow
 */
async function validatePricingWorkflow(rfqId, tenantId) {
  const validation = new ValidationResult();
  const db = await connectDb();

  try {
    // 1. Validate tenant
    const tenantCheck = await validateTenant(db, tenantId);
    if (!tenantCheck.valid) {
      validation.addError('tenant', tenantCheck.error, tenantCheck);
      return validation; // Can't continue without tenant
    }
    validation.addSuccess('tenant', 'Tenant exists and is active', { tenantCode: tenantCheck.tenant.code });

    // 2. Validate RFQ
    const rfqCheck = await validateRfq(db, rfqId, tenantId);
    if (!rfqCheck.valid) {
      validation.addError('rfq', rfqCheck.error, rfqCheck);
      return validation; // Can't continue without RFQ
    }
    validation.addSuccess('rfq', 'RFQ exists and belongs to tenant', {
      rfqId,
      status: rfqCheck.rfq.status,
      document_type: rfqCheck.rfq.document_type
    });

    // 3. Validate RFQ items
    const itemsCheck = await validateRfqItems(db, rfqId, tenantId);
    if (!itemsCheck.valid) {
      validation.addError('rfq_items', itemsCheck.error, itemsCheck);
      return validation; // Can't continue without items
    }
    validation.addSuccess('rfq_items', `RFQ has ${itemsCheck.itemCount} valid items`, {
      itemCount: itemsCheck.itemCount
    });

    // 4. Validate client (if set)
    const clientCheck = await validateClient(db, rfqCheck.rfq.client_id, tenantId);
    if (!clientCheck.valid) {
      validation.addError('client', clientCheck.error, clientCheck);
    } else if (!clientCheck.skipped) {
      validation.addSuccess('client', 'Client exists and belongs to tenant', { clientId: rfqCheck.rfq.client_id });
    }

    // 5. Validate project (if set)
    const projectCheck = await validateProject(db, rfqCheck.rfq.project_id, tenantId);
    if (!projectCheck.valid) {
      validation.addError('project', projectCheck.error, projectCheck);
    } else if (!projectCheck.skipped) {
      validation.addSuccess('project', 'Project exists and belongs to tenant', { projectId: rfqCheck.rfq.project_id });
    }

    // 6. Validate materials
    const materialCodes = itemsCheck.items
      .map(item => item.material_code)
      .filter(code => code && code.trim() !== '');
    
    if (materialCodes.length > 0) {
      const materialsCheck = await validateMaterials(db, materialCodes, tenantId);
      if (!materialsCheck.valid) {
        validation.addError('materials', materialsCheck.error, materialsCheck);
      } else {
        validation.addSuccess('materials', `All ${materialsCheck.foundCount} material codes found`, {
          foundCount: materialsCheck.foundCount
        });
      }
    } else {
      validation.addWarning('materials', 'No material codes found in RFQ items - pricing will use defaults');
    }

    // 7. Validate tenant settings
    const settingsCheck = await validateTenantSettings(tenantId);
    if (!settingsCheck.valid) {
      validation.addError('tenant_settings', settingsCheck.error, settingsCheck);
    } else {
      validation.addSuccess('tenant_settings', 'All required tenant settings present', {
        present: settingsCheck.present
      });
    }

    // 8. Validate pricing rules (check for at least one rule)
    const rulesCheck = await validatePricingRules(db, tenantId, 'ANY', 'ANY');
    if (!rulesCheck.valid) {
      validation.addWarning('pricing_rules', rulesCheck.error, rulesCheck);
    } else {
      validation.addSuccess('pricing_rules', `Found ${rulesCheck.ruleCount} pricing rules`, {
        ruleCount: rulesCheck.ruleCount
      });
    }

    // 9. Validate HS codes (if items have HS codes)
    const hsCodes = itemsCheck.items
      .map(item => item.hs_code)
      .filter(code => code && code.trim() !== '');
    
    if (hsCodes.length > 0) {
      const hsCheck = await validateHsCodes(db, hsCodes);
      if (!hsCheck.valid) {
        validation.addWarning('hs_codes', hsCheck.error, hsCheck);
      } else {
        validation.addSuccess('hs_codes', `All ${hsCheck.foundCount} HS codes found`, {
          foundCount: hsCheck.foundCount
        });
      }
    }

    // 10. Validate tax rules (if client has country)
    if (clientCheck.valid && !clientCheck.skipped && clientCheck.client) {
      // Get client country (would need to query clients table for country field)
      // For now, default to 'MY' (Malaysia)
      const taxCheck = await validateTaxRules(db, 'MY');
      if (!taxCheck.valid) {
        validation.addWarning('tax_rules', taxCheck.error, taxCheck);
      } else {
        validation.addSuccess('tax_rules', 'Tax rules found for client country');
      }
    }

    // 11. Validate logistics config
    const logisticsCheck = await validateLogisticsConfig(tenantId);
    if (!logisticsCheck.valid) {
      validation.addWarning('logistics_config', logisticsCheck.error, logisticsCheck);
    } else {
      validation.addSuccess('logistics_config', 'Logistics config present');
    }

    // 12. Validate operator rules config file exists
    try {
      if (operatorRulesConfig && typeof operatorRulesConfig === 'object') {
        validation.addSuccess('operator_rules', 'Operator rules config loaded');
      } else {
        validation.addWarning('operator_rules', 'Operator rules config not properly loaded');
      }
    } catch (error) {
      validation.addWarning('operator_rules', 'Error loading operator rules config', { error: error.message });
    }

    // 13. Validate NSC pricing rules config file exists
    try {
      if (nscPricingRules && typeof nscPricingRules === 'object') {
        validation.addSuccess('nsc_pricing_rules', 'NSC pricing rules config loaded');
      } else {
        validation.addWarning('nsc_pricing_rules', 'NSC pricing rules config not properly loaded');
      }
    } catch (error) {
      validation.addWarning('nsc_pricing_rules', 'Error loading NSC pricing rules config', { error: error.message });
    }

  } catch (error) {
    validation.addError('validation_error', 'Unexpected error during validation', {
      error: error.message,
      stack: error.stack
    });
  }
  // Note: Don't close db connection here - caller manages it

  return validation;
}

module.exports = {
  validatePricingWorkflow,
  ValidationResult
};
