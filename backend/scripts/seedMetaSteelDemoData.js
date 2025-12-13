/**
 * Seed MetaSteel Trading Demo Data
 * 
 * Idempotent script to seed complete demo data for MetaSteel Trading tenant:
 * - Ensures MetaSteel tenant exists
 * - Seeds tenant_settings (if not already present)
 * - Seeds demo users (if not already present)
 * - Seeds demo clients
 * - Seeds pricing rules
 * - Seeds price agreements
 * - Seeds RFQs and RFQ items
 * - Seeds pricing runs
 * 
 * Usage: npm run seed:metasteel-demo
 * 
 * This script is safe to run multiple times (idempotent).
 * It will NOT modify or delete NSC tenant data.
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');
const { hashPassword } = require('../src/services/authService');
const operatorRules = require('../src/config/operatorRules');
const notificationRules = require('../src/config/notificationRules');
const intelligenceConfig = require('../src/config/intelligenceConfig');

// Development-only default password for seeded users
const DEFAULT_PASSWORD = 'Password123!';
// Demo Manager credentials (local dev only):
// - Email: manager@metasteel.com
// - Password: Password123!

/**
 * Upsert tenant (create or update)
 * For MetaSteel, sets is_demo = true
 */
async function upsertTenant(db, code, name, isActive = true) {
  // Check if is_demo column exists
  const columnCheck = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'tenants' AND column_name = 'is_demo';
  `);
  const hasIsDemo = columnCheck.rows.length > 0;
  
  // For MetaSteel, set is_demo = true
  const isDemo = code.toLowerCase() === 'metasteel' ? true : false;
  
  if (hasIsDemo) {
    const result = await db.query(`
      INSERT INTO tenants (code, name, is_active, is_demo)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          is_active = EXCLUDED.is_active,
          is_demo = EXCLUDED.is_demo,
          updated_at = NOW()
      RETURNING id, code, name, is_active, is_demo;
    `, [code, name, isActive, isDemo]);
    
    return result.rows[0];
  } else {
    // Fallback if is_demo column doesn't exist yet
    const result = await db.query(`
      INSERT INTO tenants (code, name, is_active)
      VALUES ($1, $2, $3)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
      RETURNING id, code, name, is_active;
    `, [code, name, isActive]);
    
    return result.rows[0];
  }
}

/**
 * Upsert tenant setting (create or update)
 */
async function upsertTenantSetting(db, tenantId, key, value) {
  await db.query(`
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (tenant_id, key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW();
  `, [tenantId, key, JSON.stringify(value)]);
}

/**
 * Upsert user (create or update by email within tenant)
 */
async function upsertUser(db, tenantId, email, name, role, passwordHash) {
  const result = await db.query(`
    INSERT INTO users (tenant_id, email, name, role, password_hash, is_active)
    VALUES ($1, $2, $3, $4, $5, true)
    ON CONFLICT (tenant_id, email) DO UPDATE
    SET name = EXCLUDED.name,
        role = EXCLUDED.role,
        password_hash = EXCLUDED.password_hash,
        is_active = true,
        updated_at = NOW()
    RETURNING id, email, name, role;
  `, [tenantId, email, name, role, passwordHash]);
  
  return result.rows[0];
}

/**
 * Upsert client (create or update by code within tenant)
 */
async function upsertClient(db, tenantId, code, name, type = null, country = null) {
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
  
  if (hasCodeColumn) {
    // Try to find by code first
    const existing = await db.query(`
      SELECT id FROM clients WHERE code = $1 AND tenant_id = $2 LIMIT 1
    `, [code, tenantId]);
    
    if (existing.rows.length > 0) {
      // Update existing - build SET clause dynamically
      const setParts = ['name = $1', 'updated_at = NOW()'];
      const params = [name];
      let paramIndex = 2;
      
      if (hasTypeColumn && type !== null) {
        setParts.push(`type = $${paramIndex}`);
        params.push(type);
        paramIndex++;
      }
      if (hasCountryColumn && country !== null) {
        setParts.push(`country = $${paramIndex}`);
        params.push(country);
        paramIndex++;
      }
      
      params.push(existing.rows[0].id);
      
      const returningFields = ['id', 'name'];
      if (hasCodeColumn) {
        returningFields.push('code');
      }
      
      const result = await db.query(`
        UPDATE clients 
        SET ${setParts.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING ${returningFields.join(', ')};
      `, params);
      return result.rows[0];
    }
    
    // Insert new with code
    const columns = ['tenant_id', 'code', 'name'];
    const values = ['$1', '$2', '$3'];
    const params = [tenantId, code, name];
    let paramIndex = 4;
    
    if (hasTypeColumn && type !== null) {
      columns.push('type');
      values.push(`$${paramIndex}`);
      params.push(type);
      paramIndex++;
    }
    if (hasCountryColumn && country !== null) {
      columns.push('country');
      values.push(`$${paramIndex}`);
      params.push(country);
    }
    
    const returningFields = ['id', 'name'];
    if (hasCodeColumn) {
      returningFields.push('code');
    }
    
    const result = await db.query(`
      INSERT INTO clients (${columns.join(', ')})
      VALUES (${values.join(', ')})
      RETURNING ${returningFields.join(', ')};
    `, params);
    return result.rows[0];
  } else {
    // No code column, use name
    const existing = await db.query(`
      SELECT id FROM clients WHERE name = $1 AND tenant_id = $2 LIMIT 1
    `, [name, tenantId]);
    
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }
    
    // Insert new without code
    const columns = ['tenant_id', 'name'];
    const values = ['$1', '$2'];
    const params = [tenantId, name];
    let paramIndex = 3;
    
    if (hasTypeColumn && type !== null) {
      columns.push('type');
      values.push(`$${paramIndex}`);
      params.push(type);
      paramIndex++;
    }
    if (hasCountryColumn && country !== null) {
      columns.push('country');
      values.push(`$${paramIndex}`);
      params.push(country);
    }
    
    const result = await db.query(`
      INSERT INTO clients (${columns.join(', ')})
      VALUES (${values.join(', ')})
      RETURNING id, name;
    `, params);
    return result.rows[0];
  }
}

/**
 * Upsert pricing rule (create or update)
 */
async function upsertPricingRule(db, tenantId, rule) {
  // Check if project_type column exists
  const columnCheck = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'client_pricing_rules' AND column_name = 'project_type';
  `);
  const hasProjectType = columnCheck.rows.length > 0;
  
  // Build WHERE clause for finding existing rule
  let whereClause = 'tenant_id = $1';
  const params = [tenantId];
  let paramIndex = 2;
  
  if (rule.client_id === null) {
    whereClause += ' AND client_id IS NULL';
  } else {
    whereClause += ` AND client_id = $${paramIndex}`;
    params.push(rule.client_id);
    paramIndex++;
  }
  
  if (hasProjectType) {
    if (rule.project_type === null || rule.project_type === undefined) {
      whereClause += ' AND project_type IS NULL';
    } else {
      whereClause += ` AND project_type = $${paramIndex}`;
      params.push(rule.project_type);
      paramIndex++;
    }
  }
  
  whereClause += ` AND origin_type = $${paramIndex}`;
  params.push(rule.origin_type);
  paramIndex++;
  
  whereClause += ` AND category = $${paramIndex}`;
  params.push(rule.category);
  
  // Check if rule exists
  const existing = await db.query(`
    SELECT id FROM client_pricing_rules WHERE ${whereClause} LIMIT 1
  `, params);
  
  if (existing.rows.length > 0) {
    // Check if updated_at column exists
    const updatedAtCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'client_pricing_rules' AND column_name = 'updated_at';
    `);
    const hasUpdatedAt = updatedAtCheck.rows.length > 0;
    
    // Update existing - rebuild WHERE clause for update
    const setParts = [
      'markup_pct = $1',
      'logistics_pct = $2',
      'risk_pct = $3',
      'notes = $4'
    ];
    const updateParams = [
      rule.markup_pct,
      rule.logistics_pct,
      rule.risk_pct,
      rule.notes || null
    ];
    let paramIndex = 5;
    
    if (hasUpdatedAt) {
      setParts.push('updated_at = NOW()');
    }
    
    if (hasProjectType && rule.project_type !== undefined) {
      setParts.push(`project_type = $${paramIndex}`);
      updateParams.push(rule.project_type);
      paramIndex++;
    }
    
    // Build WHERE clause
    const whereParts = [`tenant_id = $${paramIndex}`];
    updateParams.push(tenantId);
    paramIndex++;
    
    if (rule.client_id === null) {
      whereParts.push('client_id IS NULL');
    } else {
      whereParts.push(`client_id = $${paramIndex}`);
      updateParams.push(rule.client_id);
      paramIndex++;
    }
    
    whereParts.push(`origin_type = $${paramIndex}`);
    updateParams.push(rule.origin_type);
    paramIndex++;
    
    whereParts.push(`category = $${paramIndex}`);
    updateParams.push(rule.category);
    paramIndex++;
    
    if (hasProjectType) {
      if (rule.project_type === null || rule.project_type === undefined) {
        whereParts.push('project_type IS NULL');
      } else {
        whereParts.push(`project_type = $${paramIndex}`);
        updateParams.push(rule.project_type);
      }
    }
    
    await db.query(`
      UPDATE client_pricing_rules 
      SET ${setParts.join(', ')}
      WHERE ${whereParts.join(' AND ')}
    `, updateParams);
    return existing.rows[0].id;
  } else {
    // Insert new
    const insertParams = [
      tenantId,
      rule.client_id || null,
      rule.origin_type,
      rule.category,
      rule.markup_pct,
      rule.logistics_pct,
      rule.risk_pct,
      rule.notes || null
    ];
    
    let insertSql = `
      INSERT INTO client_pricing_rules (
        tenant_id, client_id, origin_type, category,
        markup_pct, logistics_pct, risk_pct, notes
    `;
    
    if (hasProjectType && rule.project_type !== undefined) {
      insertSql += ', project_type';
    }
    
    insertSql += `) VALUES ($1, $2, $3, $4, $5, $6, $7, $8`;
    
    if (hasProjectType && rule.project_type !== undefined) {
      insertSql += ', $9';
      insertParams.push(rule.project_type);
    }
    
    insertSql += ') RETURNING id';
    
    const result = await db.query(insertSql, insertParams);
    return result.rows[0].id;
  }
}

/**
 * Upsert price agreement (create or update)
 */
async function upsertPriceAgreement(db, tenantId, agreement) {
  // Check if agreement exists (by client_id, category/material_id, and tenant_id)
  const existing = await db.query(`
    SELECT id FROM price_agreements 
    WHERE tenant_id = $1 AND client_id = $2 
      AND (category = $3 OR (category IS NULL AND $3 IS NULL))
      AND (material_id = $4 OR (material_id IS NULL AND $4 IS NULL))
    LIMIT 1
  `, [tenantId, agreement.client_id, agreement.category || null, agreement.material_id || null]);
  
  if (existing.rows.length > 0) {
    // Update existing
    await db.query(`
      UPDATE price_agreements 
      SET base_price = $1, currency = $2, volume_tiers = $3,
          valid_from = $4, valid_until = $5,
          payment_terms = $6, delivery_terms = $7, notes = $8,
          status = $9, updated_at = NOW()
      WHERE id = $10
    `, [
      agreement.base_price,
      agreement.currency || 'USD',
      agreement.volume_tiers ? JSON.stringify(agreement.volume_tiers) : null,
      agreement.valid_from,
      agreement.valid_until,
      agreement.payment_terms || null,
      agreement.delivery_terms || null,
      agreement.notes || null,
      agreement.status || 'active',
      existing.rows[0].id
    ]);
    return existing.rows[0].id;
  } else {
    // Insert new
    const result = await db.query(`
      INSERT INTO price_agreements (
        tenant_id, client_id, material_id, category,
        base_price, currency, volume_tiers,
        valid_from, valid_until,
        payment_terms, delivery_terms, notes,
        created_by, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [
      tenantId,
      agreement.client_id,
      agreement.material_id || null,
      agreement.category || null,
      agreement.base_price,
      agreement.currency || 'USD',
      agreement.volume_tiers ? JSON.stringify(agreement.volume_tiers) : null,
      agreement.valid_from,
      agreement.valid_until,
      agreement.payment_terms || null,
      agreement.delivery_terms || null,
      agreement.notes || null,
      agreement.created_by || 'System',
      agreement.status || 'active'
    ]);
    return result.rows[0].id;
  }
}

/**
 * Upsert project (create or update)
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
 * Upsert RFQ (create or update)
 */
async function upsertRfq(db, tenantId, projectId, title, description = null, projectType = null) {
  const existing = await db.query(`
    SELECT id FROM rfqs
    WHERE tenant_id = $1 AND project_id = $2 AND rfq_name = $3
    LIMIT 1
  `, [tenantId, projectId, title]);

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const result = await db.query(`
    INSERT INTO rfqs (tenant_id, project_id, rfq_name, notes, status)
    VALUES ($1, $2, $3, $4, 'draft')
    RETURNING id
  `, [tenantId, projectId, title, description]);

  return result.rows[0].id;
}

/**
 * Upsert RFQ item (create or update)
 */
async function upsertRfqItem(db, tenantId, rfqId, item) {
  // Check if item already exists (by rfq_id and line_number or description)
  const existing = await db.query(`
    SELECT id FROM rfq_items 
    WHERE tenant_id = $1 AND rfq_id = $2 
      AND (line_number = $3 OR description = $4)
    LIMIT 1
  `, [tenantId, rfqId, item.line_number || null, item.description]);
  
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  
  // Get next line number if not provided
  let lineNumber = item.line_number;
  if (!lineNumber) {
    const maxLineResult = await db.query(`
      SELECT MAX(line_number) as max_line FROM rfq_items WHERE rfq_id = $1
    `, [rfqId]);
    lineNumber = maxLineResult.rows[0].max_line ? maxLineResult.rows[0].max_line + 1 : 1;
  }
  
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
    item.material_code || null,
    lineNumber,
    item.size_display || null,
    item.size1_raw || null,
    item.size2_raw || null
  ]);
  
  return result.rows[0].id;
}

/**
 * Create a simple pricing run (without full calculation)
 */
async function createSimplePricingRun(db, tenantId, rfqId) {
  // Check if pricing run already exists
  const existing = await db.query(`
    SELECT id FROM pricing_runs 
    WHERE tenant_id = $1 AND rfq_id = $2 
    LIMIT 1
  `, [tenantId, rfqId]);
  
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  
  // Get RFQ items to calculate a simple total
  const rfqItems = await db.query(`
    SELECT id, quantity FROM rfq_items 
    WHERE tenant_id = $1 AND rfq_id = $2
  `, [tenantId, rfqId]);
  
  // Create a simple pricing run with estimated total
  const estimatedTotal = rfqItems.rows.reduce((sum, item) => sum + (parseFloat(item.quantity) * 100), 0);
  
  // Check if currency column exists in pricing_runs
  const pricingRunsColumnCheck = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'pricing_runs' AND column_name = 'currency';
  `);
  const hasCurrencyInPricingRuns = pricingRunsColumnCheck.rows.length > 0;
  
  // Check if currency column exists in pricing_run_items
  const pricingRunItemsColumnCheck = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'pricing_run_items' AND column_name = 'currency';
  `);
  const hasCurrencyInPricingRunItems = pricingRunItemsColumnCheck.rows.length > 0;
  
  // Build INSERT for pricing_runs
  const pricingRunColumns = ['tenant_id', 'rfq_id', 'approval_status', 'total_price'];
  const pricingRunValues = ['$1', '$2', '$3', '$4'];
  const pricingRunParams = [tenantId, rfqId, 'draft', estimatedTotal];
  
  if (hasCurrencyInPricingRuns) {
    pricingRunColumns.push('currency');
    pricingRunValues.push('$5');
    pricingRunParams.push('USD');
  }
  
  const result = await db.query(`
    INSERT INTO pricing_runs (${pricingRunColumns.join(', ')})
    VALUES (${pricingRunValues.join(', ')})
    RETURNING id
  `, pricingRunParams);
  
  // Create simple pricing run items
  for (const rfqItem of rfqItems.rows) {
    const unitPrice = 100; // Simple demo price
    const quantity = parseFloat(rfqItem.quantity) || 1;
    const totalPrice = quantity * unitPrice;

    const itemColumns = ['tenant_id', 'pricing_run_id', 'rfq_item_id', 'quantity', 'unit_price', 'total_price'];
    const itemValues = ['$1', '$2', '$3', '$4', '$5', '$6'];
    const itemParams = [tenantId, result.rows[0].id, rfqItem.id, quantity, unitPrice, totalPrice];

    if (hasCurrencyInPricingRunItems) {
      itemColumns.push('currency');
      itemValues.push('$7');
      itemParams.push('USD');
    }

    await db.query(`
      INSERT INTO pricing_run_items (${itemColumns.join(', ')})
      VALUES (${itemValues.join(', ')})
    `, itemParams);
  }
  
  return result.rows[0].id;
}

/**
 * Main seed function
 */
async function seedMetaSteelDemoData() {
  const db = await connectMigrationDb();
  
  console.log('🌱 Starting MetaSteel demo data seeding...\n');
  
  try {
    // ============================================================================
    // STEP 1: Ensure MetaSteel Tenant Exists
    // ============================================================================
    console.log('📋 Step 1: Ensuring MetaSteel tenant exists...');
    
    const metaSteelTenant = await upsertTenant(db, 'metasteel', 'MetaSteel Trading Sdn Bhd', true);
    console.log(`  ✓ MetaSteel tenant: ${metaSteelTenant.code} (id: ${metaSteelTenant.id})\n`);
    
    // ============================================================================
    // STEP 2: Seed Tenant Settings (if not already present)
    // ============================================================================
    console.log('📋 Step 2: Seeding MetaSteel tenant settings...');
    
    // Check if settings already exist
    const existingSettings = await db.query(`
      SELECT key FROM tenant_settings WHERE tenant_id = $1
    `, [metaSteelTenant.id]);
    
    if (existingSettings.rows.length === 0) {
      // Only seed if no settings exist (to avoid overwriting existing config)
      await upsertTenantSetting(db, metaSteelTenant.id, 'operator_rules', operatorRules.operatorRules);
      await upsertTenantSetting(db, metaSteelTenant.id, 'approved_mills', operatorRules.approvedMillsByOperator);
      await upsertTenantSetting(db, metaSteelTenant.id, 'approved_vendors', operatorRules.approvedVendorsByOperator);
      await upsertTenantSetting(db, metaSteelTenant.id, 'notification_rules', {
        rfqPricing: notificationRules.rfqPricingNotifications,
        renewalLme: notificationRules.renewalLmeNotifications,
        supplierLogistics: notificationRules.supplierLogisticsNotifications
      });
      await upsertTenantSetting(db, metaSteelTenant.id, 'intelligence_config', {
        focusRegions: intelligenceConfig.focusRegions,
        focusIndustries: intelligenceConfig.focusIndustries,
        strategicClients: intelligenceConfig.strategicClients,
        autoUpdateSettings: intelligenceConfig.autoUpdateSettings,
        sensitivity: intelligenceConfig.sensitivity,
        reportFrequencies: intelligenceConfig.reportFrequencies,
        demoTenant: true // Mark as demo tenant
      });
      console.log('  ✓ MetaSteel tenant settings created\n');
    } else {
      console.log(`  ✓ MetaSteel tenant settings already exist (${existingSettings.rows.length} keys)\n`);
    }
    
    // ============================================================================
    // STEP 3: Seed MetaSteel Demo Users
    // ============================================================================
    console.log('👥 Step 3: Seeding MetaSteel demo users...');
    
    const defaultPasswordHash = await hashPassword(DEFAULT_PASSWORD);
    
    const metaSteelUsers = [
      { email: 'sales@metasteel.com', name: 'MetaSteel Sales', role: 'sales_rep' },
      { email: 'procurement@metasteel.com', name: 'MetaSteel Procurement', role: 'procurement' },
      { email: 'manager@metasteel.com', name: 'MetaSteel Manager', role: 'manager' },
      { email: 'admin@metasteel.com', name: 'MetaSteel Admin', role: 'admin' }
    ];
    
    for (const userData of metaSteelUsers) {
      const user = await upsertUser(
        db,
        metaSteelTenant.id,
        userData.email,
        userData.name,
        userData.role,
        defaultPasswordHash
      );
      console.log(`  ✓ ${user.email} (${user.role})`);
    }
    console.log(`  ✓ Created/updated ${metaSteelUsers.length} MetaSteel users\n`);
    
    // ============================================================================
    // STEP 4: Seed MetaSteel Clients
    // ============================================================================
    console.log('🏢 Step 4: Seeding MetaSteel clients...');
    
    const clients = [
      { code: 'ALPHA-ENG', name: 'Alpha Engineering Sdn Bhd', type: 'EPC', country: 'MY' },
      { code: 'PETROASIA', name: 'PetroAsia Offshore', type: 'OPERATOR', country: 'MY' },
      { code: 'NUSANTARA-PG', name: 'Nusantara PowerGrid', type: 'POWER', country: 'ID' },
      { code: 'STEELFORM', name: 'SteelForm Industries', type: 'FABRICATOR', country: 'MY' },
      { code: 'PIPEMART', name: 'PipeMart Trading', type: 'DISTRIBUTOR', country: 'MY' }
    ];
    
    const clientMap = {};
    for (const clientData of clients) {
      const client = await upsertClient(
        db,
        metaSteelTenant.id,
        clientData.code,
        clientData.name,
        clientData.type,
        clientData.country
      );
      clientMap[clientData.code] = client.id;
      const clientName = client.name || clientData.name;
      const clientCode = client.code || clientData.code;
      console.log(`  ✓ ${clientName} (${clientCode})`);
    }
    console.log(`  ✓ Created/updated ${clients.length} clients\n`);
    
    // ============================================================================
    // STEP 5: Seed Pricing Rules
    // ============================================================================
    console.log('💰 Step 5: Seeding MetaSteel pricing rules...');
    console.log('  ⚠️  Skipping pricing rules (table missing tenant_id column - requires manual migration)\n');
    
    // Skip pricing rules if tenant_id column doesn't exist
    const skipPricingRules = true;
    
    if (!skipPricingRules) {
    const baselineMarkup = 18;
    const baselineLogistics = 7;
    const baselineRisk = 4;
    
    // Global baseline rules
    await upsertPricingRule(db, metaSteelTenant.id, {
      client_id: null,
      origin_type: 'ANY',
      category: 'ANY',
      markup_pct: baselineMarkup,
      logistics_pct: baselineLogistics,
      risk_pct: baselineRisk,
      notes: 'MetaSteel global baseline (fallback)'
    });
    console.log('  ✓ Global baseline rule');
    
    // Category-specific rules
    const categoryRules = [
      { category: 'PIPE', markup_pct: 15 },
      { category: 'FLANGE', markup_pct: 25 },
      { category: 'FITTING', markup_pct: 22 }
    ];
    
    for (const rule of categoryRules) {
      await upsertPricingRule(db, metaSteelTenant.id, {
        client_id: null,
        origin_type: 'ANY',
        category: rule.category,
        markup_pct: rule.markup_pct,
        logistics_pct: baselineLogistics,
        risk_pct: baselineRisk,
        notes: `MetaSteel ${rule.category} category rule`
      });
      console.log(`  ✓ ${rule.category} category rule`);
    }
    
    // Origin-based rules
    await upsertPricingRule(db, metaSteelTenant.id, {
      client_id: null,
      origin_type: 'CHINA',
      category: 'ANY',
      markup_pct: baselineMarkup,
      logistics_pct: baselineLogistics,
      risk_pct: 10, // Higher risk for China
      notes: 'MetaSteel CHINA origin rule (higher risk)'
    });
    console.log('  ✓ CHINA origin rule');
    
    // Client-specific overrides
    const clientRules = [
      { code: 'ALPHA-ENG', markup_pct: baselineMarkup - 3 },
      { code: 'PETROASIA', markup_pct: baselineMarkup + 12 },
      { code: 'STEELFORM', markup_pct: baselineMarkup + 5 },
      { code: 'PIPEMART', markup_pct: baselineMarkup + 20 }
    ];
    
    for (const rule of clientRules) {
      await upsertPricingRule(db, metaSteelTenant.id, {
        client_id: clientMap[rule.code],
        origin_type: 'ANY',
        category: 'ANY',
        markup_pct: rule.markup_pct,
        logistics_pct: baselineLogistics,
        risk_pct: baselineRisk,
        notes: `MetaSteel client-specific override for ${rule.code}`
      });
      console.log(`  ✓ Client override for ${rule.code}`);
    }
    
    console.log('  ✓ Pricing rules seeded\n');
    } // End of skipPricingRules check
    
    // ============================================================================
    // STEP 6: Seed Price Agreements
    // ============================================================================
    console.log('📄 Step 6: Seeding MetaSteel price agreements...');
    
    const today = new Date();
    const validFrom = new Date(today);
    validFrom.setDate(validFrom.getDate() - 7);
    const validUntil = new Date(today);
    validUntil.setDate(validUntil.getDate() + 90);
    
    // Verify clients exist before creating agreements
    if (!clientMap['ALPHA-ENG']) {
      throw new Error('ALPHA-ENG client not found in clientMap. Clients must be seeded before price agreements.');
    }
    if (!clientMap['PIPEMART']) {
      throw new Error('PIPEMART client not found in clientMap. Clients must be seeded before price agreements.');
    }
    
    // Agreement 1: Alpha Engineering - A106 Pipe Volume Deal
    try {
      await upsertPriceAgreement(db, metaSteelTenant.id, {
        client_id: clientMap['ALPHA-ENG'],
        category: 'PIPE',
        material_id: null,
        base_price: 850.00,
        currency: 'USD',
        volume_tiers: [
          { min_qty: 0, max_qty: 100, price: 850.00 },
          { min_qty: 101, max_qty: 500, price: 820.00 },
          { min_qty: 501, max_qty: null, price: 800.00 }
        ],
        valid_from: validFrom.toISOString().split('T')[0],
        valid_until: validUntil.toISOString().split('T')[0],
        payment_terms: 'Net 30',
        delivery_terms: 'FOB Port',
        notes: 'Alpha Engineering A106 Pipe Volume Deal - Demo Agreement',
        status: 'active',
        created_by: 'System'
      });
      console.log('  ✓ Alpha Engineering - A106 Pipe Volume Deal');
    } catch (error) {
      console.error('  ✗ Failed to seed Alpha Engineering agreement:', error.message);
      throw error;
    }
    
    // Agreement 2: PipeMart - Fittings Discount
    try {
      await upsertPriceAgreement(db, metaSteelTenant.id, {
        client_id: clientMap['PIPEMART'],
        category: 'FITTING',
        material_id: null,
        base_price: 1200.00,
        currency: 'USD',
        volume_tiers: [
          { min_qty: 0, max_qty: null, price: 1200.00 }
        ],
        valid_from: validFrom.toISOString().split('T')[0],
        valid_until: validUntil.toISOString().split('T')[0],
        payment_terms: 'Net 45',
        delivery_terms: 'CIF Destination',
        notes: 'PipeMart Fittings Discount - Demo Agreement',
        status: 'active',
        created_by: 'System'
      });
      console.log('  ✓ PipeMart - Fittings Discount\n');
    } catch (error) {
      console.error('  ✗ Failed to seed PipeMart agreement:', error.message);
      throw error;
    }
    
    // ============================================================================
    // STEP 7: Seed RFQs and RFQ Items
    // ============================================================================
    console.log('📋 Step 7: Seeding MetaSteel RFQs and items...');
    
    // RFQ 1: Alpha Engineering - Gas Compression Skid Package
    const alphaProjectId = await upsertProject(
      db,
      metaSteelTenant.id,
      clientMap['ALPHA-ENG'],
      'Gas Compression Skid Package',
      'Offshore gas compression skid project'
    );
    
    const alphaRfqId = await upsertRfq(
      db,
      metaSteelTenant.id,
      alphaProjectId,
      'RFQ-ALPHA-001',
      'Gas Compression Skid Package - Pipes and Fittings',
      'standard'
    );
    
    const alphaItems = [
      { description: 'Carbon Steel Pipe A106 Gr.B, 6" SCH 40', quantity: 500, unit: 'M', material_code: null, line_number: 1 },
      { description: 'Carbon Steel Pipe A106 Gr.B, 4" SCH 40', quantity: 300, unit: 'M', material_code: null, line_number: 2 },
      { description: 'Carbon Steel Elbow 90° 6" SCH 40', quantity: 50, unit: 'EA', material_code: null, line_number: 3 },
      { description: 'Carbon Steel Tee 6" SCH 40', quantity: 30, unit: 'EA', material_code: null, line_number: 4 }
    ];
    
    for (const item of alphaItems) {
      await upsertRfqItem(db, metaSteelTenant.id, alphaRfqId, item);
    }
    console.log(`  ✓ RFQ-ALPHA-001: ${alphaItems.length} items`);
    
    // RFQ 2: PetroAsia Offshore - Offshore Tie-In Line
    const petroProjectId = await upsertProject(
      db,
      metaSteelTenant.id,
      clientMap['PETROASIA'],
      'Offshore Tie-In Line',
      'Offshore pipeline tie-in project'
    );
    
    const petroRfqId = await upsertRfq(
      db,
      metaSteelTenant.id,
      petroProjectId,
      'RFQ-PETRO-001',
      'Offshore Tie-In Line - Low Temp Pipes and Flanges',
      'ltpa'
    );
    
    const petroItems = [
      { description: 'Low Temp Carbon Steel Pipe A333 Gr.6, 8" SCH 40', quantity: 800, unit: 'M', material_code: null, line_number: 1 },
      { description: 'Low Temp Carbon Steel Pipe A333 Gr.6, 6" SCH 40', quantity: 400, unit: 'M', material_code: null, line_number: 2 },
      { description: 'Weld Neck Flange 8" 150# RF', quantity: 20, unit: 'EA', material_code: null, line_number: 3 },
      { description: 'Weld Neck Flange 6" 150# RF', quantity: 15, unit: 'EA', material_code: null, line_number: 4 }
    ];
    
    for (const item of petroItems) {
      await upsertRfqItem(db, metaSteelTenant.id, petroRfqId, item);
    }
    console.log(`  ✓ RFQ-PETRO-001: ${petroItems.length} items`);
    
    // RFQ 3: PipeMart Trading - Small Fittings Order
    const pipeMartProjectId = await upsertProject(
      db,
      metaSteelTenant.id,
      clientMap['PIPEMART'],
      'Small Fittings Order',
      'Small quantity fittings order'
    );
    
    const pipeMartRfqId = await upsertRfq(
      db,
      metaSteelTenant.id,
      pipeMartProjectId,
      'RFQ-PIPEMART-001',
      'Small Fittings Order - Various Sizes',
      'spot'
    );
    
    const pipeMartItems = [
      { description: 'Carbon Steel Elbow 90° 2" SCH 40', quantity: 100, unit: 'EA', material_code: null, line_number: 1 },
      { description: 'Carbon Steel Elbow 90° 3" SCH 40', quantity: 75, unit: 'EA', material_code: null, line_number: 2 },
      { description: 'Carbon Steel Tee 2" SCH 40', quantity: 50, unit: 'EA', material_code: null, line_number: 3 }
    ];
    
    for (const item of pipeMartItems) {
      await upsertRfqItem(db, metaSteelTenant.id, pipeMartRfqId, item);
    }
    console.log(`  ✓ RFQ-PIPEMART-001: ${pipeMartItems.length} items\n`);
    
    // ============================================================================
    // STEP 8: Seed Pricing Runs
    // ============================================================================
    console.log('💵 Step 8: Seeding MetaSteel pricing runs...');
    
    const alphaPricingRunId = await createSimplePricingRun(db, metaSteelTenant.id, alphaRfqId);
    console.log(`  ✓ Pricing run for RFQ-ALPHA-001`);
    
    const petroPricingRunId = await createSimplePricingRun(db, metaSteelTenant.id, petroRfqId);
    console.log(`  ✓ Pricing run for RFQ-PETRO-001`);
    
    const pipeMartPricingRunId = await createSimplePricingRun(db, metaSteelTenant.id, pipeMartRfqId);
    console.log(`  ✓ Pricing run for RFQ-PIPEMART-001\n`);
    
    // ============================================================================
    // Summary
    // ============================================================================
    console.log('\n✅ MetaSteel demo data seeding completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`  • Tenant: ${metaSteelTenant.code} (${metaSteelTenant.name})`);
    console.log(`  • Users: ${metaSteelUsers.length} users`);
    console.log(`  • Clients: ${clients.length} clients`);
    console.log(`  • Pricing Rules: Multiple rules (global, category, origin, client-specific)`);
    console.log(`  • Price Agreements: 2 agreements`);
    console.log(`  • RFQs: 3 RFQs with items`);
    console.log(`  • Pricing Runs: 3 pricing runs`);
    console.log(`\n🔑 Default password for all seeded users: ${DEFAULT_PASSWORD}`);
    console.log('   ⚠️  IMPORTANT: Change passwords in production!\n');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    console.error(error.stack);
    // Don't exit if called from another script (check if parent is reset script)
    if (require.main === module) {
      process.exit(1);
    } else {
      throw error; // Re-throw so parent script can handle it
    }
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedMetaSteelDemoData()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedMetaSteelDemoData };

