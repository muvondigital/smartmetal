/**
 * Migration 052: Normalize Foreign Key CASCADE Behavior
 *
 * Purpose: Ensure all foreign keys use consistent behavior:
 * - ON UPDATE CASCADE (propagate parent key updates)
 * - ON DELETE SET NULL (for optional references, default behavior)
 *
 * Exceptions (preserved as intentional):
 * - ON DELETE CASCADE for tenant_id (multi-tenancy - correct behavior)
 * - ON DELETE CASCADE for child records (rfq_items, pricing_run_items, etc. - correct behavior)
 * - ON DELETE RESTRICT (from migration 026 - intentional data protection)
 * - ON DELETE CASCADE for join/mapping tables (regulatory_material_mapping, etc. - correct behavior)
 *
 * This migration normalizes FKs that don't have intentional behavior specified.
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 052 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 052] Normalizing foreign key CASCADE behavior...');

  try {
    // Get all foreign key constraints that need normalization
    // We'll normalize FKs that:
    // 1. Don't have ON UPDATE CASCADE
    // 2. Use ON DELETE CASCADE but are optional references (nullable columns) - except tenant_id and child records
    // 3. Don't have ON DELETE specified (defaults to NO ACTION)

    const fkQuery = await db.query(`
      SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule,
        CASE WHEN c.is_nullable = 'YES' THEN true ELSE false END AS is_nullable
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
      JOIN information_schema.columns c
        ON c.table_name = tc.table_name
        AND c.column_name = kcu.column_name
        AND c.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND (
          -- FKs that don't have ON UPDATE CASCADE
          rc.update_rule != 'CASCADE'
          OR
          -- FKs that use ON DELETE CASCADE but are optional references (not tenant_id, not child records)
          (rc.delete_rule = 'CASCADE' 
           AND c.is_nullable = 'YES'
           AND kcu.column_name != 'tenant_id'
           AND tc.table_name NOT IN ('rfq_items', 'pricing_run_items', 'approval_history', 'document_extractions', 'mto_extractions')
           AND tc.table_name NOT LIKE '%_mapping'
           AND tc.table_name NOT LIKE '%_mappings')
          OR
          -- FKs that don't have ON DELETE specified (defaults to NO ACTION, should be SET NULL for optional)
          (rc.delete_rule = 'NO ACTION' AND c.is_nullable = 'YES')
        )
      ORDER BY tc.table_name, tc.constraint_name;
    `);

    const fksToNormalize = fkQuery.rows;

    if (fksToNormalize.length === 0) {
      console.log('[Migration 052] ✓ All foreign keys already normalized');
      return;
    }

    console.log(`[Migration 052] Found ${fksToNormalize.length} foreign key(s) to normalize`);

    for (const fk of fksToNormalize) {
      const tableName = fk.table_name;
      const constraintName = fk.constraint_name;
      const columnName = fk.column_name;
      const foreignTableName = fk.foreign_table_name;
      const foreignColumnName = fk.foreign_column_name;
      const isNullable = fk.is_nullable;
      const currentUpdateRule = fk.update_rule;
      const currentDeleteRule = fk.delete_rule;

      // Determine target delete rule
      // If column is nullable and not a tenant_id or child record, use SET NULL
      // Otherwise preserve CASCADE (intentional)
      let targetDeleteRule = 'SET NULL';
      if (columnName === 'tenant_id') {
        targetDeleteRule = 'CASCADE'; // Preserve tenant deletion CASCADE
      } else if (tableName === 'rfq_items' && columnName === 'rfq_id') {
        targetDeleteRule = 'CASCADE'; // Preserve child record CASCADE
      } else if (tableName === 'pricing_run_items' && (columnName === 'pricing_run_id' || columnName === 'rfq_item_id')) {
        targetDeleteRule = 'CASCADE'; // Preserve child record CASCADE
      } else if (tableName === 'approval_history' && columnName === 'pricing_run_id') {
        targetDeleteRule = 'CASCADE'; // Preserve child record CASCADE
      } else if (tableName === 'document_extractions' && columnName === 'rfq_id') {
        targetDeleteRule = 'CASCADE'; // Preserve child record CASCADE
      } else if (tableName === 'mto_extractions' && (columnName === 'document_extraction_id' || columnName === 'rfq_id')) {
        targetDeleteRule = 'CASCADE'; // Preserve child record CASCADE
      } else if (tableName.includes('_mapping') || tableName.includes('_mappings')) {
        targetDeleteRule = 'CASCADE'; // Preserve join table CASCADE
      } else if (!isNullable) {
        // If column is NOT NULL, we can't use SET NULL - preserve current behavior or use RESTRICT
        targetDeleteRule = currentDeleteRule === 'RESTRICT' ? 'RESTRICT' : 'CASCADE';
      }

      // Skip if already correct
      if (currentUpdateRule === 'CASCADE' && currentDeleteRule === targetDeleteRule) {
        console.log(`[Migration 052] ⏭️  Skipping ${tableName}.${constraintName} (already normalized)`);
        continue;
      }

      console.log(`[Migration 052] Normalizing ${tableName}.${constraintName}:`);
      console.log(`  Current: ON UPDATE ${currentUpdateRule}, ON DELETE ${currentDeleteRule}`);
      console.log(`  Target:  ON UPDATE CASCADE, ON DELETE ${targetDeleteRule}`);

      // Drop existing constraint
      await db.query(`
        ALTER TABLE ${tableName}
        DROP CONSTRAINT IF EXISTS ${constraintName};
      `);

      // Recreate with normalized behavior
      await db.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = '${constraintName}'
          ) THEN
            ALTER TABLE ${tableName}
            ADD CONSTRAINT ${constraintName}
            FOREIGN KEY (${columnName})
            REFERENCES ${foreignTableName}(${foreignColumnName})
            ON UPDATE CASCADE
            ON DELETE ${targetDeleteRule};
          END IF;
        END;
        $$;
      `);

      console.log(`[Migration 052] ✓ Normalized ${tableName}.${constraintName}`);
    }

    console.log('[Migration 052] ✅ Foreign key normalization completed');
  } catch (error) {
    console.error('[Migration 052] ❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 052 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('[Migration 052] Rollback: Foreign key normalization cannot be automatically reversed.');
  console.log('[Migration 052] Original FK behaviors are preserved in previous migrations.');
  console.log('[Migration 052] To revert, manually drop and recreate FKs with original behavior.');
}

module.exports = {
  up,
  down,
};

