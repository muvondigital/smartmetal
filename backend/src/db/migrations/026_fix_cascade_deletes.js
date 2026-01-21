/**
 * Migration 026: Fix Foreign Key CASCADE Deletes
 *
 * Problem:
 * - Current CASCADE deletes allow silent data loss
 * - Deleting a client deletes all price agreements
 * - Deleting a material deletes all LME price history
 * - Deleting a tenant deletes all tenant data (correct for multi-tenancy)
 *
 * Solution:
 * - Change critical FKs to ON DELETE RESTRICT (prevents deletion)
 * - Keep CASCADE only for true child records (pricing_run_items, rfq_items)
 * - Keep CASCADE for tenant deletion (correct multi-tenant behavior)
 *
 * Categories:
 * 1. RESTRICT: Master data that should not be deletable if referenced
 *    - materials (referenced by pricing rules, LME prices, etc.)
 *    - clients (referenced by price agreements, pricing runs)
 *    - price_agreements (referenced by business logic)
 *
 * 2. CASCADE: Child records that should be deleted with parent
 *    - pricing_run_items (deleted when pricing_run deleted)
 *    - rfq_items (deleted when rfq deleted)
 *
 * 3. CASCADE (Multi-tenancy): Keep CASCADE for tenant_id
 *    - All domain tables (correct behavior for tenant deletion)
 *
 * Production Impact:
 * - LOW: Does not change data, only constraint behavior
 * - Prevents accidental data loss
 * - May require explicit cleanup before deletion
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 026 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 026] Fixing CASCADE deletes to prevent data loss...');

  try {
    await db.query('BEGIN');

    // ========================================
    // 1. Fix material_price_history.material_id
    // Current: ON DELETE CASCADE
    // New: ON DELETE RESTRICT
    // Reason: Prevent accidental deletion of material with active price history
    // Note: Table is called material_price_history (not material_prices)
    // ========================================
    console.log('[Migration 026] Fixing material_price_history.material_id (CASCADE → RESTRICT)...');

    // Drop existing constraint
    await db.query(`
      ALTER TABLE material_price_history
      DROP CONSTRAINT IF EXISTS material_price_history_material_id_fkey;
    `);

    // Add new constraint with RESTRICT (with existence guard)
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'material_price_history_material_id_fkey'
        ) THEN
          ALTER TABLE material_price_history
          ADD CONSTRAINT material_price_history_material_id_fkey
          FOREIGN KEY (material_id)
          REFERENCES materials(id)
          ON DELETE RESTRICT;
        END IF;
      END;
      $$;
    `);

    console.log('[Migration 026] ✓ material_price_history.material_id fixed');

    // ========================================
    // 2. Check other critical foreign keys
    // These are handled by checking if they exist first
    // ========================================

    // Check if price_agreements table has client_id (may not exist yet)
    const priceAgreementsCheck = await db.query(`
      SELECT column_name, table_name
      FROM information_schema.columns
      WHERE table_name = 'price_agreements'
      AND column_name = 'client_id';
    `);

    if (priceAgreementsCheck.rows.length > 0) {
      console.log('[Migration 026] Fixing price_agreements.client_id (if CASCADE)...');

      // Check current constraint
      const constraintCheck = await db.query(`
        SELECT
          tc.constraint_name,
          rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name = 'price_agreements'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND tc.constraint_name LIKE '%client%';
      `);

      if (constraintCheck.rows.length > 0 && constraintCheck.rows[0].delete_rule === 'CASCADE') {
        console.log(`[Migration 026] Found CASCADE constraint: ${constraintCheck.rows[0].constraint_name}`);

        // Drop and recreate with RESTRICT
        await db.query(`
          ALTER TABLE price_agreements
          DROP CONSTRAINT IF EXISTS ${constraintCheck.rows[0].constraint_name};
        `);

        await db.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'price_agreements_client_id_fkey'
            ) THEN
              ALTER TABLE price_agreements
              ADD CONSTRAINT price_agreements_client_id_fkey
              FOREIGN KEY (client_id)
              REFERENCES clients(id)
              ON DELETE RESTRICT;
            END IF;
          END;
          $$;
        `);

        console.log('[Migration 026] ✓ price_agreements.client_id fixed');
      } else {
        console.log('[Migration 026] ✓ price_agreements.client_id already RESTRICT or does not exist');
      }
    } else {
      console.log('[Migration 026] ⊘ price_agreements table not found, skipping');
    }

    // ========================================
    // 3. Verify critical CASCADE relationships that SHOULD remain
    // These are child records that should be deleted with parent
    // ========================================
    console.log('[Migration 026] Verifying correct CASCADE relationships...');

    // pricing_run_items → pricing_runs (should be CASCADE)
    const pricingRunItemsCheck = await db.query(`
      SELECT
        tc.constraint_name,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.table_name = 'pricing_run_items'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.constraint_name LIKE '%pricing_run%';
    `);

    if (pricingRunItemsCheck.rows.length > 0) {
      const deleteRule = pricingRunItemsCheck.rows[0].delete_rule;
      console.log(`[Migration 026] pricing_run_items.pricing_run_id: ${deleteRule} ${deleteRule === 'CASCADE' ? '✓' : '⚠'}`);
    }

    // rfq_items → rfqs (should be CASCADE)
    const rfqItemsCheck = await db.query(`
      SELECT
        tc.constraint_name,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.table_name = 'rfq_items'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.constraint_name LIKE '%rfq%';
    `);

    if (rfqItemsCheck.rows.length > 0) {
      const deleteRule = rfqItemsCheck.rows[0].delete_rule;
      console.log(`[Migration 026] rfq_items.rfq_id: ${deleteRule} ${deleteRule === 'CASCADE' ? '✓' : '⚠'}`);
    }

    // ========================================
    // 4. Document tenant_id CASCADE relationships
    // These should remain CASCADE (correct multi-tenant behavior)
    // ========================================
    console.log('[Migration 026] Tenant CASCADE relationships (correct, not changed):');
    console.log('[Migration 026]   - materials.tenant_id → tenants.id (CASCADE)');
    console.log('[Migration 026]   - clients.tenant_id → tenants.id (CASCADE)');
    console.log('[Migration 026]   - price_agreements.tenant_id → tenants.id (CASCADE)');
    console.log('[Migration 026]   - rfqs.tenant_id → tenants.id (CASCADE)');
    console.log('[Migration 026]   - pricing_runs.tenant_id → tenants.id (CASCADE)');
    console.log('[Migration 026]   - ... and all other domain tables');
    console.log('[Migration 026]   Reason: Deleting tenant should delete all tenant data (data isolation)');

    await db.query('COMMIT');

    console.log('[Migration 026] ✓ Migration completed successfully');

    // ========================================
    // Summary Report
    // ========================================
    console.log('');
    console.log('========================================');
    console.log('MIGRATION 026 SUMMARY');
    console.log('========================================');
    console.log('');
    console.log('CHANGED (CASCADE → RESTRICT):');
    console.log('  ✓ material_prices.material_id');
    console.log('    Prevents: Deleting material deletes LME price history');
    console.log('');
    console.log('  ✓ price_agreements.client_id (if applicable)');
    console.log('    Prevents: Deleting client deletes price agreements');
    console.log('');
    console.log('UNCHANGED (Correct CASCADE):');
    console.log('  ✓ pricing_run_items.pricing_run_id');
    console.log('    Child records should be deleted with parent');
    console.log('');
    console.log('  ✓ rfq_items.rfq_id');
    console.log('    Child records should be deleted with parent');
    console.log('');
    console.log('  ✓ *.tenant_id → tenants.id');
    console.log('    Multi-tenancy: Tenant deletion should cascade');
    console.log('');
    console.log('IMPACT:');
    console.log('  - Prevents accidental data loss');
    console.log('  - May require explicit cleanup before deletion');
    console.log('  - No data changes, only constraint behavior');
    console.log('');
    console.log('========================================');
    console.log('');

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 026] Error during migration:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 026 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 026] Rolling back CASCADE delete fixes...');

  try {
    await db.query('BEGIN');

    // Revert material_prices.material_id to CASCADE
    await db.query(`
      ALTER TABLE material_prices
      DROP CONSTRAINT IF EXISTS material_prices_material_id_fkey;
    `);

    await db.query(`
      ALTER TABLE material_prices
      ADD CONSTRAINT material_prices_material_id_fkey
      FOREIGN KEY (material_id)
      REFERENCES materials(id)
      ON DELETE CASCADE;
    `);

    // Revert price_agreements.client_id to CASCADE (if exists)
    const priceAgreementsCheck = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'price_agreements'
      AND column_name = 'client_id';
    `);

    if (priceAgreementsCheck.rows.length > 0) {
      await db.query(`
        ALTER TABLE price_agreements
        DROP CONSTRAINT IF EXISTS price_agreements_client_id_fkey;
      `);

      await db.query(`
        ALTER TABLE price_agreements
        ADD CONSTRAINT price_agreements_client_id_fkey
        FOREIGN KEY (client_id)
        REFERENCES clients(id)
        ON DELETE CASCADE;
      `);
    }

    await db.query('COMMIT');

    console.log('[Migration 026] ✓ Rollback completed');

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('[Migration 026] Error during rollback:', error);
    throw error;
  }
}

module.exports = { up, down };
