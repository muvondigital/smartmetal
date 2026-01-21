/**
 * Seed MetaSteel RFQs and Pricing Runs (STEP 3 of MetaSteel Enablement)
 * 
 * Creates:
 * - 3 realistic RFQs for MetaSteel tenant
 * - Line items using MetaSteel materials created in STEP 2
 * - Pricing runs using materials.base_cost with margins
 * - Sets statuses so dashboard/analytics show active RFQs and revenue
 * 
 * IMPORTANT FIXES:
 * - RFQ matching: Finds RFQs by title within tenant (handles project_id changes).
 *   This ensures rfq_items are attached to the RFQ the UI shows, not a duplicate.
 * - RFQ items: Uses NSC-compatible pattern (line_number/description matching, includes size columns).
 * - Dashboard alignment: Sets created_at within last 30 days and approval_status values
 *   that match dashboard query filters (approved, pending_approval, draft).
 * - Comprehensive debugging: Logs RFQ IDs, item counts, and simulates dashboard queries.
 * 
 * DO NOT touch Step 1 (KYC config) or Step 2 (suppliers + materials) scripts or NSC data.
 * 
 * This script is idempotent - safe to run multiple times.
 * 
 * Usage: node scripts/seedMetaSteelRfqsAndPricing.js
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

// Ensure we can see output immediately
process.stdout.write('📋 Loading seed script...\n');

/**
 * MetaSteel RFQ Definitions
 */
const metaSteelRfqs = [
  {
    rfqCode: 'RFQ-PIPEMART-001',
    title: 'RFQ-PIPEMART-001',
    customer: 'PipeMart Trading',
    project: 'Small Fittings Order',
    status: 'draft',
    projectType: 'standard',
    currency: 'USD',
    incoterm: 'EXW',
    notes: 'This RFQ is used to demonstrate small stock orders and fittings-heavy RFQs.',
    items: [
      { material_code: 'M-CS-ELBOW90-2-SCH40-A234WPB', quantity: 12, unit: 'EA', description: 'Elbow 90° NPS 2" SCH40 ASTM A234 WPB' },
      { material_code: 'M-CS-TEE-4-SCH40-A234WPB', quantity: 6, unit: 'EA', description: 'Tee Equal NPS 4" SCH40 ASTM A234 WPB' },
      { material_code: 'M-CS-FLANGE-WN-4-150-A105', quantity: 4, unit: 'EA', description: 'Flange Weld Neck 4" Class 150 ASTM A105' },
      { material_code: 'M-CS-PIPE-2-SCH40-A106B', quantity: 60, unit: 'M', description: 'Pipe NPS 2" SCH40 ASTM A106 Gr.B' },
      { material_code: 'M-CS-PIPE-4-SCH40-A106B', quantity: 40, unit: 'M', description: 'Pipe NPS 4" SCH40 ASTM A106 Gr.B' },
      { material_code: 'M-CS-COUPLING-2-MALLEABLE', quantity: 24, unit: 'EA', description: 'Coupling 2" Malleable Iron Galvanised' }
    ]
  },
  {
    rfqCode: 'RFQ-PETRO-001',
    title: 'RFQ-PETRO-001',
    customer: 'PetroAsia Offshore',
    project: 'Offshore Tie-In Line',
    status: 'draft',
    projectType: 'standard',
    currency: 'USD',
    incoterm: 'FOB',
    notes: 'Project-style RFQ with heavier pipes and flanges.',
    items: [
      { material_code: 'M-CS-PIPE-6-SCH80-A106B', quantity: 80, unit: 'M', description: 'Pipe NPS 6" SCH80 ASTM A106 Gr.B' },
      { material_code: 'M-CS-PIPE-4-SCH40-A106B', quantity: 40, unit: 'M', description: 'Pipe NPS 4" SCH40 ASTM A106 Gr.B' },
      { material_code: 'M-CS-ELBOW90-6-SCH80-A234WPB', quantity: 12, unit: 'EA', description: 'Elbow 90° NPS 6" SCH80 ASTM A234 WPB' },
      { material_code: 'M-CS-REDUCER-6X4-CONC-A234WPB', quantity: 6, unit: 'EA', description: 'Reducer Concentric 6" x 4" ASTM A234 WPB' },
      { material_code: 'M-CS-FLANGE-WN-6-300-A105', quantity: 8, unit: 'EA', description: 'Flange Weld Neck 6" Class 300 ASTM A105' },
      { material_code: 'M-CS-VALVE-GATE-6-600-API6D', quantity: 4, unit: 'EA', description: 'Gate Valve 6" Class 600 API 6D' }
    ]
  },
  {
    rfqCode: 'RFQ-ALPHA-001',
    title: 'RFQ-ALPHA-001',
    customer: 'Alpha Industrial Supplies',
    project: 'Warehouse Replenishment',
    status: 'draft',
    projectType: 'standard',
    currency: 'USD',
    incoterm: 'EXW',
    notes: 'Mixed items to show warehouse/stock replenishment.',
    items: [
      { material_code: 'M-CS-PIPE-2-SCH40-A106B', quantity: 50, unit: 'M', description: 'Pipe NPS 2" SCH40 ASTM A106 Gr.B' },
      { material_code: 'M-CS-PIPE-4-SCH40-A106B', quantity: 30, unit: 'M', description: 'Pipe NPS 4" SCH40 ASTM A106 Gr.B' },
      { material_code: 'M-CS-ELBOW90-2-SCH40-A234WPB', quantity: 20, unit: 'EA', description: 'Elbow 90° NPS 2" SCH40 ASTM A234 WPB' },
      { material_code: 'M-CS-TEE-4-SCH40-A234WPB', quantity: 10, unit: 'EA', description: 'Tee Equal NPS 4" SCH40 ASTM A234 WPB' },
      { material_code: 'M-CS-FLANGE-WN-4-150-A105', quantity: 10, unit: 'EA', description: 'Flange Weld Neck 4" Class 150 ASTM A105' },
      { material_code: 'M-STRUCT-BEAM-HEA200-S275', quantity: 5, unit: 'TON', description: 'HEA 200 Beam S275JR' }
    ]
  }
];

/**
 * Margin percentages by category (approximate MetaSteel pricing rules)
 */
const MARGINS = {
  PIPE: 0.15,           // 15% for pipes
  FITTING: 0.16,        // 16% for fittings
  FLANGE: 0.17,         // 17% for flanges
  VALVE: 0.20,          // 20% for valves (higher margin)
  STRUCTURAL: 0.13      // 13% for structural (lower margin)
};

/**
 * Upsert client (create or update by name within tenant)
 */
async function upsertClient(db, tenantId, name, type = null, country = null) {
  // Check which optional columns exist
  const columnCheck = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'clients' 
      AND column_name IN ('code', 'type', 'country');
  `);
  
  const existingColumns = columnCheck.rows.map(r => r.column_name);
  const hasCodeColumn = existingColumns.includes('code');
  const hasTypeColumn = existingColumns.includes('type');
  const hasCountryColumn = existingColumns.includes('country');
  
  // Try to find by name first
  const existing = await db.query(`
    SELECT id FROM clients WHERE name = $1 AND tenant_id = $2 LIMIT 1
  `, [name, tenantId]);
  
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  
  // Build INSERT statement
  const insertCols = ['tenant_id', 'name'];
  const insertVals = [tenantId, name];
  let paramIndex = 3;
  
  if (hasCodeColumn) {
    // Generate a code from name
    const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 20);
    insertCols.push('code');
    insertVals.push(code);
    paramIndex++;
  }
  
  if (hasTypeColumn && type) {
    insertCols.push('type');
    insertVals.push(type);
    paramIndex++;
  }
  
  if (hasCountryColumn && country) {
    insertCols.push('country');
    insertVals.push(country);
    paramIndex++;
  }
  
  const result = await db.query(`
    INSERT INTO clients (${insertCols.join(', ')})
    VALUES (${insertCols.map((_, i) => `$${i + 1}`).join(', ')})
    RETURNING id
  `, insertVals);
  
  return result.rows[0].id;
}

/**
 * Upsert project (create or update by name within tenant)
 */
async function upsertProject(db, tenantId, clientId, name, description = null) {
  const existing = await db.query(`
    SELECT id FROM projects 
    WHERE tenant_id = $1 AND client_id = $2 AND name = $3 
    LIMIT 1
  `, [tenantId, clientId, name]);
  
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  
  const result = await db.query(`
    INSERT INTO projects (tenant_id, client_id, name, description)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [tenantId, clientId, name, description]);
  
  return result.rows[0].id;
}

/**
 * Upsert RFQ (create or update by title within tenant)
 * IMPORTANT: Matches RFQs by title within tenant to ensure we attach items to the RFQ the UI shows.
 * If multiple RFQs exist with the same title, uses the most recently updated one.
 */
async function upsertRfq(db, tenantId, projectId, title, description = null, projectType = null, status = 'draft') {
  // First, try to find by rfq_name + project_id (exact match)
  let existing = await db.query(`
    SELECT id, rfq_name, project_id, status, created_at, updated_at
    FROM rfqs 
    WHERE tenant_id = $1 AND project_id = $2 AND rfq_name = $3 
    ORDER BY updated_at DESC
    LIMIT 1
  `, [tenantId, projectId, title]);
  
  // If not found, try to find by rfq_name alone within tenant (in case project_id changed)
  if (existing.rows.length === 0) {
    existing = await db.query(`
      SELECT id, rfq_name, project_id, status, created_at, updated_at
      FROM rfqs 
      WHERE tenant_id = $1 AND rfq_name = $2 
      ORDER BY updated_at DESC
      LIMIT 1
    `, [tenantId, title]);
  }
  
  if (existing.rows.length > 0) {
    const rfq = existing.rows[0];
    // Update project_id if it changed (to keep data consistent)
    if (rfq.project_id !== projectId) {
      await db.query(`
        UPDATE rfqs 
        SET project_id = $1, notes = $2, project_type = $3, updated_at = NOW()
        WHERE id = $4
      `, [projectId, description, projectType, rfq.id]);
    }
    return rfq.id;
  }
  
  // Create new RFQ (document_type defaults to 'RFQ' via migration)
  const result = await db.query(`
    INSERT INTO rfqs (tenant_id, project_id, rfq_name, notes, status, project_type, document_type)
    VALUES ($1, $2, $3, $4, $5, $6, 'RFQ')
    RETURNING id
  `, [tenantId, projectId, title, description, status, projectType]);
  
  return result.rows[0].id;
}

/**
 * Upsert RFQ item
 * Matches NSC seed pattern: uses line_number or description to check for existing items,
 * and includes optional size columns for consistency.
 */
async function upsertRfqItem(db, tenantId, rfqId, item, lineNumber) {
  // Check if material exists (if material_code is provided)
  // Materials may be tenant-scoped (migration 058+) or global (pre-migration 058)
  let materialCodeToUse = null;
  if (item.material_code) {
    // Check if materials table has tenant_id column
    const tenantIdCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'materials' AND column_name = 'tenant_id';
    `);
    const hasTenantId = tenantIdCheck.rows.length > 0;
    
    let materialCheck;
    if (hasTenantId) {
      // Materials are tenant-scoped
      materialCheck = await db.query(`
        SELECT material_code FROM materials 
        WHERE tenant_id = $1 AND material_code = $2 
        LIMIT 1
      `, [tenantId, item.material_code]);
    } else {
      // Legacy: materials are global
      materialCheck = await db.query(`
        SELECT material_code FROM materials WHERE material_code = $1 LIMIT 1
      `, [item.material_code]);
    }
    
    if (materialCheck.rows.length > 0) {
      materialCodeToUse = item.material_code;
    } else {
      console.warn(`    ⚠️  Material ${item.material_code} not found in materials table, using null`);
    }
  }
  
  // Check if item already exists (match NSC pattern: by line_number or description)
  const existing = await db.query(`
    SELECT id FROM rfq_items 
    WHERE tenant_id = $1 AND rfq_id = $2 
      AND (line_number = $3 OR description = $4)
    LIMIT 1
  `, [tenantId, rfqId, lineNumber, item.description]);
  
  if (existing.rows.length > 0) {
    // Update existing item
    await db.query(`
      UPDATE rfq_items 
      SET quantity = $1, unit = $2, description = $3, line_number = $4, 
          material_code = $5, updated_at = NOW()
      WHERE id = $6
    `, [item.quantity, item.unit, item.description, lineNumber, materialCodeToUse, existing.rows[0].id]);
    return existing.rows[0].id;
  }
  
  // Insert new item (match NSC pattern: include optional size columns)
  const result = await db.query(`
    INSERT INTO rfq_items (
      tenant_id, rfq_id, description, quantity, unit,
      material_code, line_number, size_display, size1_raw, size2_raw
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
  `, [
    tenantId,
    rfqId,
    item.description,
    item.quantity,
    item.unit,
    materialCodeToUse,
    lineNumber,
    null, // size_display
    null, // size1_raw
    null  // size2_raw
  ]);
  
  return result.rows[0].id;
}

/**
 * Get material by material_code (tenant-scoped after migration 058)
 * Returns null if material doesn't exist (instead of throwing)
 */
async function getMaterial(db, materialCode, tenantId) {
  if (!materialCode) {
    return null;
  }
  
  // Check if materials table has tenant_id column (migration 058)
  const tenantIdCheck = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'materials' AND column_name = 'tenant_id';
  `);
  const hasTenantId = tenantIdCheck.rows.length > 0;
  
  if (hasTenantId && tenantId) {
    // Materials are tenant-scoped (migration 058+)
    const result = await db.query(`
      SELECT id, material_code, category, base_cost, currency, size_description
      FROM materials
      WHERE tenant_id = $1 AND material_code = $2
      LIMIT 1
    `, [tenantId, materialCode]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } else {
    // Legacy: materials are global (pre-migration 058)
    const result = await db.query(`
      SELECT id, material_code, category, base_cost, currency, size_description
      FROM materials
      WHERE material_code = $1
      LIMIT 1
    `, [materialCode]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  }
}

/**
 * Get margin percentage for a material category
 */
function getMarginForCategory(category) {
  const normalizedCategory = category.toUpperCase();
  if (normalizedCategory === 'PIPE') return MARGINS.PIPE;
  if (normalizedCategory === 'FITTING') return MARGINS.FITTING;
  if (normalizedCategory === 'FLANGE') return MARGINS.FLANGE;
  if (normalizedCategory === 'VALVE') return MARGINS.VALVE;
  if (normalizedCategory === 'STRUCTURAL') return MARGINS.STRUCTURAL;
  return 0.15; // Default 15% margin
}

/**
 * Get date range for dashboard queries (matches analyticsService.getDateRange)
 */
function getDateRange(filters) {
  const filtersObj = filters || {};
  let end_date = filtersObj.end_date || filtersObj.endDate;
  if (!end_date) {
    end_date = new Date().toISOString().split('T')[0];
  } else {
    const testDate = new Date(end_date);
    if (isNaN(testDate.getTime())) {
      end_date = new Date().toISOString().split('T')[0];
    } else {
      end_date = testDate.toISOString().split('T')[0];
    }
  }
  
  let start_date = filtersObj.start_date || filtersObj.startDate;
  if (!start_date) {
    const date = new Date();
    date.setDate(date.getDate() - 90);
    start_date = date.toISOString().split('T')[0];
  } else {
    const testDate = new Date(start_date);
    if (isNaN(testDate.getTime())) {
      const date = new Date();
      date.setDate(date.getDate() - 90);
      start_date = date.toISOString().split('T')[0];
    } else {
      start_date = testDate.toISOString().split('T')[0];
    }
  }
  
  return { start_date, end_date };
}

/**
 * Create pricing run and items manually (using base_cost from materials)
 */
async function createPricingRun(db, tenantId, rfqId, rfqItems, approvalStatus = 'draft') {
  // Check if pricing run already exists
  const existing = await db.query(`
    SELECT id FROM pricing_runs 
    WHERE tenant_id = $1 AND rfq_id = $2 
    ORDER BY created_at DESC
    LIMIT 1
  `, [tenantId, rfqId]);
  
  let pricingRunId;
  let isNewRun = false;
  
  // Set created_at to recent date (within last 30 days) to ensure dashboard metrics pick it up
  // Dashboard queries filter by created_at within last 90 days, so we ensure data is visible
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - Math.floor(Math.random() * 30)); // Random date in last 30 days
  const createdAtStr = recentDate.toISOString();
  
  // Also set submitted_at if column exists (some dashboards may filter by this)
  const submittedAtStr = approvalStatus === 'approved' || approvalStatus === 'pending_approval' 
    ? recentDate.toISOString() 
    : null;
  
  // Check for submitted_at column
  const submittedAtCheck = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'pricing_runs' AND column_name = 'submitted_at';
  `);
  const hasSubmittedAt = submittedAtCheck.rows.length > 0;
  
  if (existing.rows.length > 0) {
    pricingRunId = existing.rows[0].id;
    // Update existing pricing run (also update created_at if it's too old)
    let updateQuery = `
      UPDATE pricing_runs 
      SET approval_status = $1, updated_at = NOW(),
          created_at = CASE 
            WHEN created_at < NOW() - INTERVAL '90 days' THEN $3
            ELSE created_at
          END`;
    const updateParams = [approvalStatus, pricingRunId, createdAtStr];
    
    if (hasSubmittedAt && submittedAtStr) {
      updateQuery += `, submitted_at = $4`;
      updateParams.push(submittedAtStr);
    }
    
    updateQuery += ` WHERE id = $2`;
    await db.query(updateQuery, updateParams);
  } else {
    // Check if currency column exists
    const currencyCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pricing_runs' AND column_name = 'currency';
    `);
    const hasCurrency = currencyCheck.rows.length > 0;
    
    // Build INSERT columns and values
    const insertCols = ['tenant_id', 'rfq_id', 'approval_status', 'created_at'];
    const insertVals = [tenantId, rfqId, approvalStatus, createdAtStr];
    
    if (hasCurrency) {
      insertCols.push('currency');
      insertVals.push('USD');
    }
    
    if (hasSubmittedAt && submittedAtStr) {
      insertCols.push('submitted_at');
      insertVals.push(submittedAtStr);
    }
    
    // Create new pricing run with explicit created_at within last 30 days
    const pricingRunResult = await db.query(`
      INSERT INTO pricing_runs (${insertCols.join(', ')})
      VALUES (${insertCols.map((_, i) => `$${i + 1}`).join(', ')})
      RETURNING id
    `, insertVals);
    pricingRunId = pricingRunResult.rows[0].id;
    
    isNewRun = true;
  }
  
  // Delete existing pricing run items if updating
  if (!isNewRun) {
    await db.query(`
      DELETE FROM pricing_run_items 
      WHERE pricing_run_id = $1
    `, [pricingRunId]);
  }
  
  // Create pricing run items
  const pricingRunItems = [];
  let totalPrice = 0;
  let costTotal = 0;
  
  for (const rfqItem of rfqItems) {
    // Get material details (may be null if material doesn't exist)
    const material = await getMaterial(db, rfqItem.material_code, tenantId);
    
    // Skip items without materials or use default pricing
    if (!material) {
      console.warn(`    ⚠️  Skipping pricing for item ${rfqItem.material_code || rfqItem.description}: material not found`);
      continue;
    }
    
    const baseCost = parseFloat(material.base_cost) || 0;
    const quantity = parseFloat(rfqItem.quantity) || 0;
    
    // Calculate margin
    const marginPct = getMarginForCategory(material.category);
    
    // Calculate prices
    const unitPrice = baseCost * (1 + marginPct);
    const itemTotalPrice = unitPrice * quantity;
    const itemCostTotal = baseCost * quantity;
    
    totalPrice += itemTotalPrice;
    costTotal += itemCostTotal;
    
    // Get material_id
    const materialId = material.id;
    
    // Check which columns exist in pricing_run_items
    const columnCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'pricing_run_items' 
        AND column_name IN ('material_code', 'material_id', 'base_cost', 'markup_pct', 'currency', 'origin_type', 'pricing_method');
    `);
    
    const existingColumns = columnCheck.rows.map(r => r.column_name);
    const hasMaterialCode = existingColumns.includes('material_code');
    const hasMaterialId = existingColumns.includes('material_id');
    const hasBaseCost = existingColumns.includes('base_cost');
    const hasMarkupPct = existingColumns.includes('markup_pct');
    const hasCurrency = existingColumns.includes('currency');
    const hasOriginType = existingColumns.includes('origin_type');
    const hasPricingMethod = existingColumns.includes('pricing_method');
    
    // Build INSERT statement dynamically based on available columns
    const insertCols = ['tenant_id', 'pricing_run_id', 'rfq_item_id', 'quantity', 'unit_price', 'total_price'];
    const insertVals = [tenantId, pricingRunId, rfqItem.id, quantity, unitPrice, itemTotalPrice];
    let paramIndex = 7;
    
    if (hasMaterialId && materialId) {
      insertCols.push('material_id');
      insertVals.push(materialId);
      paramIndex++;
    }
    
    if (hasMaterialCode && material) {
      insertCols.push('material_code');
      insertVals.push(material.material_code);
      paramIndex++;
    }
    
    if (hasBaseCost) {
      insertCols.push('base_cost');
      insertVals.push(baseCost);
      paramIndex++;
    }
    
    if (hasMarkupPct) {
      insertCols.push('markup_pct');
      insertVals.push(marginPct * 100); // Store as percentage
      paramIndex++;
    }
    
    if (hasCurrency && material) {
      insertCols.push('currency');
      insertVals.push(material.currency || 'USD');
      paramIndex++;
    }
    
    if (hasOriginType && material) {
      insertCols.push('origin_type');
      insertVals.push(material.origin_type || 'NON_CHINA');
      paramIndex++;
    }
    
    if (hasPricingMethod) {
      insertCols.push('pricing_method');
      insertVals.push('rule_based');
      paramIndex++;
    }
    
    // Insert pricing run item
    const itemResult = await db.query(`
      INSERT INTO pricing_run_items (${insertCols.join(', ')})
      VALUES (${insertCols.map((_, i) => `$${i + 1}`).join(', ')})
      RETURNING id
    `, insertVals);
    
    pricingRunItems.push({
      id: itemResult.rows[0].id,
      rfq_item_id: rfqItem.id,
      material_code: material ? material.material_code : null,
      base_cost: baseCost,
      unit_price: unitPrice,
      total_price: itemTotalPrice
    });
  }
  
  // Update pricing run total
  await db.query(`
    UPDATE pricing_runs 
    SET total_price = $1, updated_at = NOW()
    WHERE id = $2
  `, [totalPrice, pricingRunId]);
  
  // Warn if no items were priced
  if (pricingRunItems.length === 0) {
    console.warn(`    ⚠️  Warning: No pricing run items created (all items missing materials)`);
  }
  
  return {
    pricingRunId,
    pricingRunItems,
    totalPrice,
    costTotal
  };
}

/**
 * Main seed function
 * @param {Object} options - Options for the seed function
 * @param {boolean} options.skipPoolClose - If true, don't close the pool (when called from parent script)
 */
async function seedMetaSteelRfqsAndPricing(options = {}) {
  const { skipPoolClose = false } = options;
  let db = null;
  try {
    process.stdout.write('🚀 Script started - connecting to database (migration mode)...\n');
    db = await connectMigrationDb();
    process.stdout.write('✅ Database connected\n');
    
    process.stdout.write('🌱 Starting MetaSteel RFQs and Pricing seeding (STEP 3)...\n\n');
  
    // 1. Resolve MetaSteel tenant ID
    console.log('📋 Step 1: Looking up MetaSteel tenant...');
    const tenantResult = await db.query(`
      SELECT id, code, name FROM tenants WHERE UPPER(code) = 'METASTEEL' LIMIT 1
    `);
    
    if (tenantResult.rows.length === 0) {
      throw new Error('MetaSteel tenant not found. Please run seedTenantsAndUsers.js first.');
    }
    
    const metaSteelTenant = tenantResult.rows[0];
    const metaSteelTenantId = metaSteelTenant.id;
    console.log(`  ✓ Found MetaSteel tenant: ${metaSteelTenant.code} (${metaSteelTenant.name}) - ID: ${metaSteelTenantId}\n`);
    
    // 2. Get MetaSteel users (for created_by if needed)
    console.log('👥 Step 2: Looking up MetaSteel users...');
    const usersResult = await db.query(`
      SELECT id, email, name, role 
      FROM users 
      WHERE tenant_id = $1 
      ORDER BY email
      LIMIT 5
    `, [metaSteelTenantId]);
    
    const metaSteelUsers = usersResult.rows;
    if (metaSteelUsers.length === 0) {
      console.log('  ⚠️  No MetaSteel users found. RFQs will be created without created_by reference.\n');
    } else {
      console.log(`  ✓ Found ${metaSteelUsers.length} MetaSteel users`);
      if (metaSteelUsers.some(u => u.role === 'manager')) {
        const manager = metaSteelUsers.find(u => u.role === 'manager');
        console.log(`  ✓ Manager: ${manager.email} (${manager.name})\n`);
      } else {
        console.log('  ⚠️  No manager user found (approvals will still work with status updates)\n');
      }
    }
    
    // 3. Create/upsert clients and projects
    console.log('🏢 Step 3: Creating/upserting clients and projects...');
    const clients = {};
    const projects = {};
    
    for (const rfqData of metaSteelRfqs) {
      const clientName = rfqData.customer;
      const projectName = rfqData.project;
      
      if (!clients[clientName]) {
        clients[clientName] = await upsertClient(
          db, metaSteelTenantId, clientName, 'CLIENT', 'MALAYSIA'
        );
        console.log(`  ✓ Client: ${clientName}`);
      }
      
      const clientId = clients[clientName];
      const projectKey = `${clientName}_${projectName}`;
      
      if (!projects[projectKey]) {
        projects[projectKey] = await upsertProject(
          db, metaSteelTenantId, clientId, projectName, rfqData.notes
        );
        console.log(`  ✓ Project: ${projectName} (${clientName})`);
      }
    }
    console.log('');
    
    // 4. Create RFQs and items
    console.log('📝 Step 4: Creating RFQs and line items...');
    const rfqs = {};
    const rfqItemsMap = {};
    let rfqCount = 0;
    let itemCount = 0;
    
    for (const rfqData of metaSteelRfqs) {
      const clientName = rfqData.customer;
      const projectName = rfqData.project;
      const projectKey = `${clientName}_${projectName}`;
      const projectId = projects[projectKey];
      
      // Debug: Check what RFQs exist with this rfq_name
      const existingRfqsCheck = await db.query(`
        SELECT id, rfq_name, project_id, status, created_at, updated_at
        FROM rfqs 
        WHERE tenant_id = $1 AND rfq_name = $2
        ORDER BY updated_at DESC
      `, [metaSteelTenantId, rfqData.title]);
      
      if (existingRfqsCheck.rows.length > 0) {
        console.log(`  🔍 Found ${existingRfqsCheck.rows.length} existing RFQ(s) with rfq_name "${rfqData.title}":`);
        existingRfqsCheck.rows.forEach(rfq => {
          console.log(`    - ID: ${rfq.id}, Project: ${rfq.project_id}, Status: ${rfq.status}, Updated: ${rfq.updated_at}`);
        });
      }
      
      // Create/update RFQ
      const rfqId = await upsertRfq(
        db,
        metaSteelTenantId,
        projectId,
        rfqData.title,
        rfqData.notes,
        rfqData.projectType,
        rfqData.status
      );
      
      // Verify RFQ was found/created
      const rfqVerify = await db.query(`
        SELECT id, rfq_name, project_id, status, 
               (SELECT COUNT(*) FROM rfq_items WHERE rfq_id = rfqs.id) as item_count
        FROM rfqs 
        WHERE id = $1
      `, [rfqId]);
      
      if (rfqVerify.rows.length === 0) {
        throw new Error(`Failed to create/find RFQ: ${rfqData.title}`);
      }
      
      const rfqInfo = rfqVerify.rows[0];
      rfqs[rfqData.rfqCode] = rfqId;
      rfqCount++;
      console.log(`  ✓ RFQ: ${rfqData.rfqCode} (${rfqData.title})`);
      console.log(`    → ID: ${rfqId}`);
      console.log(`    → Existing items before seeding: ${rfqInfo.item_count}`);
      
      // Create RFQ items
      rfqItemsMap[rfqData.rfqCode] = [];
      let lineNumber = 1;
      
      for (const item of rfqData.items) {
        try {
          const rfqItemId = await upsertRfqItem(
            db,
            metaSteelTenantId,
            rfqId,
            item,
            lineNumber
          );
          
          rfqItemsMap[rfqData.rfqCode].push({
            id: rfqItemId,
            material_code: item.material_code,
            quantity: item.quantity,
            unit: item.unit,
            description: item.description
          });
          
          itemCount++;
          lineNumber++;
        } catch (error) {
          console.error(`  ✗ Error creating RFQ item ${item.material_code} for ${rfqData.rfqCode}:`, error.message);
        }
      }
      
      // Verify items were created
      const itemsAfter = await db.query(`
        SELECT COUNT(*) as count FROM rfq_items 
        WHERE tenant_id = $1 AND rfq_id = $2
      `, [metaSteelTenantId, rfqId]);
      const finalItemCount = parseInt(itemsAfter.rows[0].count) || 0;
      
      console.log(`    → Seeded ${rfqData.items.length} items, total in DB: ${finalItemCount}\n`);
    }
    
    // 5. Create pricing runs
    console.log('💰 Step 5: Creating pricing runs...');
    const pricingRuns = {};
    let pricingRunCount = 0;
    let totalQuotedValue = 0;
    
    // Create pricing run for RFQ-PIPEMART-001 (will be approved)
    const pipemartRfqId = rfqs['RFQ-PIPEMART-001'];
    const pipemartItems = rfqItemsMap['RFQ-PIPEMART-001'] || [];
    
    if (pipemartRfqId && pipemartItems.length > 0) {
      const pipemartPricing = await createPricingRun(
        db,
        metaSteelTenantId,
        pipemartRfqId,
        pipemartItems,
        'approved' // Mark as approved for dashboard metrics
      );
      
      pricingRuns['RFQ-PIPEMART-001'] = pipemartPricing;
      pricingRunCount++;
      totalQuotedValue += pipemartPricing.totalPrice;
      
      console.log(`  ✓ RFQ-PIPEMART-001 pricing run: $${pipemartPricing.totalPrice.toFixed(2)} (APPROVED)`);
      console.log(`    → Cost: $${pipemartPricing.costTotal.toFixed(2)}, Margin: ${((pipemartPricing.totalPrice - pipemartPricing.costTotal) / pipemartPricing.costTotal * 100).toFixed(1)}%`);
    }
    
    // Create pricing run for RFQ-PETRO-001 (pending approval)
    const petroRfqId = rfqs['RFQ-PETRO-001'];
    const petroItems = rfqItemsMap['RFQ-PETRO-001'] || [];
    
    if (petroRfqId && petroItems.length > 0) {
      const petroPricing = await createPricingRun(
        db,
        metaSteelTenantId,
        petroRfqId,
        petroItems,
        'pending_approval'
      );
      
      pricingRuns['RFQ-PETRO-001'] = petroPricing;
      pricingRunCount++;
      totalQuotedValue += petroPricing.totalPrice;
      
      console.log(`  ✓ RFQ-PETRO-001 pricing run: $${petroPricing.totalPrice.toFixed(2)} (PENDING APPROVAL)`);
      console.log(`    → Cost: $${petroPricing.costTotal.toFixed(2)}, Margin: ${((petroPricing.totalPrice - petroPricing.costTotal) / petroPricing.costTotal * 100).toFixed(1)}%`);
    }
    
    // Optionally create pricing run for RFQ-ALPHA-001 (draft)
    const alphaRfqId = rfqs['RFQ-ALPHA-001'];
    const alphaItems = rfqItemsMap['RFQ-ALPHA-001'] || [];
    
    if (alphaRfqId && alphaItems.length > 0) {
      const alphaPricing = await createPricingRun(
        db,
        metaSteelTenantId,
        alphaRfqId,
        alphaItems,
        'draft'
      );
      
      pricingRuns['RFQ-ALPHA-001'] = alphaPricing;
      pricingRunCount++;
      totalQuotedValue += alphaPricing.totalPrice;
      
      console.log(`  ✓ RFQ-ALPHA-001 pricing run: $${alphaPricing.totalPrice.toFixed(2)} (DRAFT)`);
      console.log(`    → Cost: $${alphaPricing.costTotal.toFixed(2)}, Margin: ${((alphaPricing.totalPrice - alphaPricing.costTotal) / alphaPricing.costTotal * 100).toFixed(1)}%`);
    }
    
    console.log('');
    
    // 6. Verify rfq_items were created and test API query pattern
    console.log('🔍 Step 6: Verifying rfq_items with API query pattern...');
    let verifiedItemCount = 0;
    for (const rfqData of metaSteelRfqs) {
      const rfqId = rfqs[rfqData.rfqCode];
      
      // Test the exact query pattern used by the API
      const apiQueryTest = await db.query(`
        SELECT ri.* FROM rfq_items ri
        JOIN rfqs r ON ri.rfq_id = r.id
        WHERE ri.rfq_id = $1 AND r.tenant_id = $2
        ORDER BY ri.line_number, ri.created_at
      `, [rfqId, metaSteelTenantId]);
      
      const apiCount = apiQueryTest.rows.length;
      verifiedItemCount += apiCount;
      
      // Also check direct query
      const directQuery = await db.query(`
        SELECT COUNT(*) as count FROM rfq_items 
        WHERE tenant_id = $1 AND rfq_id = $2
      `, [metaSteelTenantId, rfqId]);
      const directCount = parseInt(directQuery.rows[0].count) || 0;
      
      console.log(`  ✓ ${rfqData.rfqCode} (ID: ${rfqId}):`);
      console.log(`    → Direct query: ${directCount} items`);
      console.log(`    → API query pattern: ${apiCount} items`);
      
      if (apiCount === 0 && directCount > 0) {
        console.log(`    ⚠️  WARNING: Items exist but API query returns 0!`);
        console.log(`    → Checking RFQ tenant_id match...`);
        const rfqCheck = await db.query(`
          SELECT id, tenant_id, rfq_name FROM rfqs WHERE id = $1
        `, [rfqId]);
        if (rfqCheck.rows.length > 0) {
          console.log(`    → RFQ tenant_id: ${rfqCheck.rows[0].tenant_id}`);
          console.log(`    → MetaSteel tenant_id: ${metaSteelTenantId}`);
          console.log(`    → Match: ${rfqCheck.rows[0].tenant_id === metaSteelTenantId ? 'YES' : 'NO'}`);
        }
      }
    }
    console.log('');
    
    // 7. Summary
    console.log('✅ MetaSteel RFQs and Pricing seeding completed successfully!\n');
    console.log('📊 SUMMARY:');
    console.log(`  • Tenant: ${metaSteelTenant.code} (${metaSteelTenant.name})`);
    console.log(`  • Clients created/updated: ${Object.keys(clients).length}`);
    console.log(`  • Projects created/updated: ${Object.keys(projects).length}`);
    console.log(`  • RFQs ensured: ${rfqCount}`);
    console.log(`  • RFQ items ensured: ${itemCount} (verified: ${verifiedItemCount} in database)`);
    console.log(`  • Pricing runs ensured: ${pricingRunCount}`);
    
    // 7. Test dashboard query patterns
    console.log('📊 Step 7: Testing dashboard query patterns...');
    const { start_date, end_date } = getDateRange({});
    console.log(`  → Dashboard date range: ${start_date} to ${end_date}`);
    
    // Test the exact dashboard query
    const dashboardQueryTest = await db.query(`
      SELECT
        COUNT(*) as total_quotes,
        COUNT(*) FILTER (WHERE approval_status = 'draft' OR approval_status = 'pending_approval') as pending_quotes,
        COUNT(*) FILTER (WHERE approval_status = 'approved') as approved_quotes,
        COUNT(*) FILTER (WHERE approval_status = 'rejected') as rejected_quotes,
        SUM(total_price) as total_value,
        AVG(total_price) as average_quote_value
      FROM pricing_runs
      WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
    `, [metaSteelTenantId, start_date, end_date]);
    
    const dashboardResults = dashboardQueryTest.rows[0];
    console.log(`  → Dashboard will see:`);
    console.log(`    - Total Quotes: ${parseInt(dashboardResults.total_quotes) || 0}`);
    console.log(`    - Pending Approval: ${parseInt(dashboardResults.pending_quotes) || 0}`);
    console.log(`    - Approved Quotes: ${parseInt(dashboardResults.approved_quotes) || 0}`);
    console.log(`    - Quote Revenue: $${parseFloat(dashboardResults.total_value || 0).toFixed(2)}`);
    console.log('');
    
    // Count by status (all time, not just date range)
    const statusCounts = await db.query(`
      SELECT 
        approval_status,
        COUNT(*) as count,
        SUM(total_price) as total_value
      FROM pricing_runs
      WHERE tenant_id = $1
      GROUP BY approval_status
    `, [metaSteelTenantId]);
    
    let pendingCount = 0;
    let approvedCount = 0;
    let draftCount = 0;
    for (const row of statusCounts.rows) {
      if (row.approval_status === 'approved') approvedCount = parseInt(row.count);
      else if (row.approval_status === 'pending_approval') pendingCount = parseInt(row.count);
      else if (row.approval_status === 'draft') draftCount = parseInt(row.count);
    }
    
    
    console.log(`  • Pricing runs by status:`);
    console.log(`    - Approved: ${approvedCount}`);
    console.log(`    - Pending Approval: ${pendingCount}`);
    console.log(`    - Draft: ${draftCount}`);
    console.log(`  • Total quoted value: $${totalQuotedValue.toFixed(2)} USD`);
    console.log('');
    console.log('📋 RFQ Details:');
    for (const rfqData of metaSteelRfqs) {
      const rfqId = rfqs[rfqData.rfqCode];
      const pricing = pricingRuns[rfqData.rfqCode];
      const itemCheck = await db.query(`
        SELECT COUNT(*) as count FROM rfq_items 
        WHERE tenant_id = $1 AND rfq_id = $2
      `, [metaSteelTenantId, rfqId]);
      const itemCountForRfq = parseInt(itemCheck.rows[0].count) || 0;
      const status = pricing ? 'PRICED' : 'NO PRICING';
      const approvalStatus = pricing ? 
        (rfqData.rfqCode === 'RFQ-PIPEMART-001' ? 'APPROVED' : 
         rfqData.rfqCode === 'RFQ-PETRO-001' ? 'PENDING APPROVAL' : 'DRAFT') : 'NO PRICING';
      console.log(`  • ${rfqData.rfqCode}: ${itemCountForRfq} rfq_items, ${status}, ${approvalStatus}`);
      if (pricing) {
        console.log(`    → Total: $${pricing.totalPrice.toFixed(2)}`);
      }
    }
    console.log('');
    console.log('💡 Next Steps:');
    console.log('  - RFQs are visible in the RFQ listing (3 active RFQs)');
    console.log('  - Line Items tab should show all items (rfq_items table)');
    console.log('  - Dashboard should show:');
    console.log(`    * Total Quotes: ${pricingRunCount}`);
    console.log(`    * Pending Approval: ${pendingCount}`);
    console.log(`    * Approved Quotes: ${approvedCount}`);
    console.log(`    * Quote Revenue: $${totalQuotedValue.toFixed(2)}`);
    console.log('  - All data is tenant-scoped to MetaSteel only\n');
    
  } catch (error) {
    process.stderr.write(`\n❌ Seeding failed: ${error.message}\n`);
    process.stderr.write(`${error.stack}\n`);

    // Only exit if running directly (not when called from parent script)
    if (!skipPoolClose && require.main === module) {
      process.exit(1);
    }
    throw error; // Re-throw so caller can handle
  } finally {
    // Only close pool if running directly (not when called from parent script)
    if (db && typeof db.end === 'function' && !skipPoolClose) {
      await db.end();
    }
  }
}

// Run if called directly
if (require.main === module) {
  console.log('📋 MetaSteel seed script entry point reached');
  seedMetaSteelRfqsAndPricing()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      console.error('Stack:', error.stack);
      process.exit(1);
    });
}

module.exports = {
  seedMetaSteelRfqsAndPricing,
  metaSteelRfqs,
  MARGINS
};
