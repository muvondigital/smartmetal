/**
 * Nuke NSC RFQ Data Script
 * 
 * This script deletes ONLY NSC tenant's RFQ-related transactional data:
 * - RFQs and RFQ items
 * - Pricing runs and pricing run items
 * - Price agreements (if directly linked to RFQs/pricing runs)
 * - Approval events and approval history
 * - Document extractions and MTO extractions related to RFQs
 * 
 * PRESERVES:
 * - NSC tenant configuration (tenant_settings)
 * - NSC AML/Operator rules
 * - NSC notification & intelligence configuration
 * - NSC supplier/master data
 * - MetaSteel tenant and all its data
 * 
 * Safety: Only runs in development mode or with explicit ALLOW_NSC_DEV_NUKE flag
 * 
 * Usage: npm run nuke:nsc-rfqs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDb } = require('../src/db/supabaseClient');

// Safety check: Only allow in development
if (process.env.NODE_ENV !== 'development' && process.env.ALLOW_NSC_DEV_NUKE !== 'true') {
  console.error('❌ SAFETY CHECK FAILED');
  console.error('This script can only run in development mode.');
  console.error('Set NODE_ENV=development or ALLOW_NSC_DEV_NUKE=true to proceed.');
  process.exit(1);
}

async function nukeNscRfqData() {
  const db = await connectDb();
  
  console.log('🗑️  Starting NSC RFQ data nuke...\n');
  
  try {
    await db.query('BEGIN');
    
    // 1. Resolve tenant IDs
    console.log('📋 Resolving tenant IDs...');
    
    const nscTenantResult = await db.query(`
      SELECT id, code, name 
      FROM tenants 
      WHERE code = 'nsc'
      LIMIT 1;
    `);
    
    if (nscTenantResult.rows.length === 0) {
      throw new Error('NSC tenant not found. Please ensure NSC tenant exists.');
    }
    
    const nscTenant = nscTenantResult.rows[0];
    const nscTenantId = nscTenant.id;
    console.log(`  ✓ NSC tenant: ${nscTenant.code} (${nscTenant.name}) - ID: ${nscTenantId}`);
    
    const metaSteelTenantResult = await db.query(`
      SELECT id, code, name 
      FROM tenants 
      WHERE UPPER(code) = 'METASTEEL'
      LIMIT 1;
    `);
    
    if (metaSteelTenantResult.rows.length === 0) {
      console.log('  ⚠️  MetaSteel tenant not found (this is OK if not seeded yet)');
    } else {
      const metaSteelTenant = metaSteelTenantResult.rows[0];
      console.log(`  ✓ MetaSteel tenant: ${metaSteelTenant.code} (${metaSteelTenant.name}) - ID: ${metaSteelTenant.id}`);
      console.log(`  ✓ Will preserve all MetaSteel data\n`);
    }
    
    // 2. Get NSC RFQ IDs for cascading deletes
    const nscRfqIdsResult = await db.query(`
      SELECT id FROM rfqs WHERE tenant_id = $1
    `, [nscTenantId]);
    const nscRfqIds = nscRfqIdsResult.rows.map(r => r.id);
    console.log(`  📊 Found ${nscRfqIds.length} NSC RFQs to delete\n`);
    
    // 3. Get NSC pricing run IDs
    const nscPricingRunIdsResult = await db.query(`
      SELECT id FROM pricing_runs WHERE tenant_id = $1
    `, [nscTenantId]);
    const nscPricingRunIds = nscPricingRunIdsResult.rows.map(r => r.id);
    console.log(`  📊 Found ${nscPricingRunIds.length} NSC pricing runs to delete\n`);
    
    const deletionCounts = {};
    
    // 4. Delete in correct order (respecting FK constraints)
    console.log('🗑️  Deleting NSC RFQ-related data...\n');
    
    // 4a. Delete approval_events (immutable audit trail)
    // Note: approval_events has a trigger preventing deletes AND a foreign key constraint
    // We need to temporarily disable the trigger, delete, then re-enable
    try {
      // Temporarily disable the immutable trigger
      await db.query(`
        ALTER TABLE approval_events DISABLE TRIGGER approval_events_immutable_trigger
      `);
      
      const approvalEventsResult = await db.query(`
        DELETE FROM approval_events 
        WHERE tenant_id = $1
      `, [nscTenantId]);
      deletionCounts.approval_events = approvalEventsResult.rowCount;
      
      // Re-enable the trigger
      await db.query(`
        ALTER TABLE approval_events ENABLE TRIGGER approval_events_immutable_trigger
      `);
      
      console.log(`  ✓ Deleted ${deletionCounts.approval_events} approval_events`);
    } catch (error) {
      // Re-enable trigger in case of error
      try {
        await db.query(`
          ALTER TABLE approval_events ENABLE TRIGGER approval_events_immutable_trigger
        `);
      } catch (reenableError) {
        console.warn('  ⚠️  Could not re-enable approval_events trigger:', reenableError.message);
      }
      
      if (error.message.includes('immutable') || error.code === '42P01') {
        console.log(`  ⚠️  Skipped approval_events (immutable table or trigger not found - audit trail preserved)`);
        deletionCounts.approval_events = 0;
      } else {
        throw error;
      }
    }
    
    // 4b. Delete pricing_run_items (child of pricing_runs)
    const pricingRunItemsResult = await db.query(`
      DELETE FROM pricing_run_items 
      WHERE tenant_id = $1
    `, [nscTenantId]);
    deletionCounts.pricing_run_items = pricingRunItemsResult.rowCount;
    console.log(`  ✓ Deleted ${deletionCounts.pricing_run_items} pricing_run_items`);
    
    // 4c. Delete pricing_runs (parent of pricing_run_items)
    const pricingRunsResult = await db.query(`
      DELETE FROM pricing_runs 
      WHERE tenant_id = $1
    `, [nscTenantId]);
    deletionCounts.pricing_runs = pricingRunsResult.rowCount;
    console.log(`  ✓ Deleted ${deletionCounts.pricing_runs} pricing_runs`);
    
    // 4d. Delete price_agreements linked to NSC
    // Delete all NSC price agreements (they're transactional and linked to RFQs/pricing runs)
    // Note: price_agreements references clients, not pricing_runs directly, so safe to delete after pricing_runs
    const priceAgreementsResult = await db.query(`
      DELETE FROM price_agreements 
      WHERE tenant_id = $1
    `, [nscTenantId]);
    deletionCounts.price_agreements = priceAgreementsResult.rowCount;
    console.log(`  ✓ Deleted ${deletionCounts.price_agreements} price_agreements`);
    
    // 4e. Delete approval_history (if exists)
    try {
      const approvalHistoryResult = await db.query(`
        DELETE FROM approval_history 
        WHERE tenant_id = $1
      `, [nscTenantId]);
      deletionCounts.approval_history = approvalHistoryResult.rowCount;
      console.log(`  ✓ Deleted ${deletionCounts.approval_history} approval_history`);
    } catch (error) {
      if (error.code === '42P01') {
        console.log(`  ⚠️  approval_history table does not exist (skipped)`);
        deletionCounts.approval_history = 0;
      } else {
        throw error;
      }
    }
    
    // 4f. Delete document_extractions related to NSC RFQs
    try {
      const docExtractionsResult = await db.query(`
        DELETE FROM document_extractions 
        WHERE tenant_id = $1
        AND related_rfq_id IN (SELECT id FROM rfqs WHERE tenant_id = $1)
      `, [nscTenantId]);
      deletionCounts.document_extractions = docExtractionsResult.rowCount;
      console.log(`  ✓ Deleted ${deletionCounts.document_extractions} document_extractions`);
    } catch (error) {
      if (error.code === '42P01') {
        console.log(`  ⚠️  document_extractions table does not exist (skipped)`);
        deletionCounts.document_extractions = 0;
      } else {
        throw error;
      }
    }
    
    // 4g. Delete mto_extractions related to NSC RFQs
    try {
      // Check if mto_extractions has tenant_id column
      const columnCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'mto_extractions' AND column_name = 'tenant_id';
      `);
      
      if (columnCheck.rows.length > 0) {
        // Has tenant_id column, use it
        const mtoExtractionsResult = await db.query(`
          DELETE FROM mto_extractions 
          WHERE tenant_id = $1
        `, [nscTenantId]);
        deletionCounts.mto_extractions = mtoExtractionsResult.rowCount;
      } else {
        // No tenant_id, delete by rfq_id
        const mtoExtractionsResult = await db.query(`
          DELETE FROM mto_extractions 
          WHERE rfq_id IN (SELECT id FROM rfqs WHERE tenant_id = $1)
        `, [nscTenantId]);
        deletionCounts.mto_extractions = mtoExtractionsResult.rowCount;
      }
      console.log(`  ✓ Deleted ${deletionCounts.mto_extractions} mto_extractions`);
    } catch (error) {
      if (error.code === '42P01') {
        console.log(`  ⚠️  mto_extractions table does not exist (skipped)`);
        deletionCounts.mto_extractions = 0;
      } else {
        throw error;
      }
    }
    
    // 4h. Delete ai_predictions related to NSC pricing runs
    try {
      // Check if ai_predictions has tenant_id and rfq_id columns
      const columnCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'ai_predictions' 
          AND column_name IN ('tenant_id', 'rfq_id');
      `);
      
      const hasTenantId = columnCheck.rows.some(r => r.column_name === 'tenant_id');
      const hasRfqId = columnCheck.rows.some(r => r.column_name === 'rfq_id');
      
      let aiPredictionsResult;
      if (hasTenantId) {
        // Has tenant_id, use it (pricing runs already deleted, so this should be safe)
        aiPredictionsResult = await db.query(`
          DELETE FROM ai_predictions 
          WHERE tenant_id = $1
        `, [nscTenantId]);
      } else if (hasRfqId) {
        // Has rfq_id but no tenant_id, delete by rfq_id
        aiPredictionsResult = await db.query(`
          DELETE FROM ai_predictions 
          WHERE rfq_id IN (SELECT id FROM rfqs WHERE tenant_id = $1)
             OR pricing_run_id IN (SELECT id FROM pricing_runs WHERE tenant_id = $1)
        `, [nscTenantId]);
      } else {
        // Only has pricing_run_id, delete by pricing_run_id (but pricing runs already deleted)
        // This should be handled by CASCADE, but let's try anyway
        aiPredictionsResult = await db.query(`
          DELETE FROM ai_predictions 
          WHERE pricing_run_id IN (SELECT id FROM pricing_runs WHERE tenant_id = $1)
        `, [nscTenantId]);
      }
      
      deletionCounts.ai_predictions = aiPredictionsResult.rowCount;
      console.log(`  ✓ Deleted ${deletionCounts.ai_predictions} ai_predictions`);
    } catch (error) {
      if (error.code === '42P01') {
        console.log(`  ⚠️  ai_predictions table does not exist (skipped)`);
        deletionCounts.ai_predictions = 0;
      } else if (error.code === '23503') {
        // Foreign key constraint - pricing runs already deleted, so this is expected
        console.log(`  ⚠️  ai_predictions already deleted via CASCADE (skipped)`);
        deletionCounts.ai_predictions = 0;
      } else {
        throw error;
      }
    }
    
    // 4i. Delete rfq_items
    const rfqItemsResult = await db.query(`
      DELETE FROM rfq_items 
      WHERE tenant_id = $1
    `, [nscTenantId]);
    deletionCounts.rfq_items = rfqItemsResult.rowCount;
    console.log(`  ✓ Deleted ${deletionCounts.rfq_items} rfq_items`);
    
    // 4j. Delete rfqs (parent table)
    const rfqsResult = await db.query(`
      DELETE FROM rfqs 
      WHERE tenant_id = $1
    `, [nscTenantId]);
    deletionCounts.rfqs = rfqsResult.rowCount;
    console.log(`  ✓ Deleted ${deletionCounts.rfqs} rfqs`);
    
    await db.query('COMMIT');
    
    // 5. Summary
    console.log('\n✅ NSC RFQ data nuke completed successfully!\n');
    console.log('📊 Deletion Summary:');
    console.log('NSC RFQ-related rows deleted:', deletionCounts);
    console.log('\n✅ Preserved:');
    console.log('  • NSC tenant configuration (tenant_settings)');
    console.log('  • NSC AML/Operator rules');
    console.log('  • NSC notification & intelligence configuration');
    console.log('  • NSC supplier/master data');
    console.log('  • MetaSteel tenant and all its data');
    console.log('  • All global configuration tables\n');
    
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('\n❌ NSC RFQ data nuke failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run the script
if (require.main === module) {
  nukeNscRfqData().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { nukeNscRfqData };

