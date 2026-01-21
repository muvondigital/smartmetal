/**
 * Migration: Add Project Type Support for Advanced Pricing
 * 
 * Purpose: Adds project_type column to rfqs and client_pricing_rules tables
 * Part of: Phase 3 - Advanced Pricing Logic
 * 
 * Project types:
 * - 'standard': Standard projects (15-25% markup)
 * - 'rush': Rush/Urgent projects (30-40% markup)
 * - 'ltpa': Long-term price agreement (12-20% markup)
 * - 'spot': One-time spot orders (20-30% markup)
 */

async function up(db) {
  console.log('Running migration: 018_add_project_type_support');
  
  try {
    // 1. Add project_type to rfqs table
    await db.query(`
      ALTER TABLE rfqs
      ADD COLUMN IF NOT EXISTS project_type TEXT 
      CHECK (project_type IS NULL OR project_type IN ('standard', 'rush', 'ltpa', 'spot'));
    `);
    console.log('✅ Added project_type column to rfqs table');
    
    // 2. Create index for project_type on rfqs
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_rfqs_project_type
      ON rfqs(project_type)
      WHERE project_type IS NOT NULL;
    `);
    console.log('✅ Created index on rfqs.project_type');
    
    // 3. Add project_type to client_pricing_rules table (if it exists)
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'client_pricing_rules'
      );
    `);

    if (tableCheck.rows[0].exists) {
      try {
        await db.query(`
          ALTER TABLE client_pricing_rules
          ADD COLUMN IF NOT EXISTS project_type TEXT
          CHECK (project_type IS NULL OR project_type IN ('standard', 'rush', 'ltpa', 'spot'));
        `);
        console.log('✅ Added project_type column to client_pricing_rules table');

        // 4. Create index for project_type on pricing rules
        await db.query(`
          CREATE INDEX IF NOT EXISTS idx_pricing_rules_project_type
          ON client_pricing_rules(project_type)
        WHERE project_type IS NOT NULL;
      `);
      console.log('✅ Created index on client_pricing_rules.project_type');

      // 5. Update composite index to include project_type
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_pricing_rules_composite_with_project_type
        ON client_pricing_rules(client_id, origin_type, category, project_type)
        WHERE project_type IS NOT NULL;
      `);
      console.log('✅ Created composite index including project_type');
      } catch (permError) {
        // If permissions error, that's okay - table owned by different user
        if (permError.code === '42501') {
          console.log('⚠️  Cannot modify client_pricing_rules (permissions). This is expected if table was created by init script.');
        } else {
          throw permError;
        }
      }
    } else {
      console.log('⚠️  Table client_pricing_rules does not exist, skipping related changes');
    }
    
    console.log('✅ Migration completed: Project type support added');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  console.log('Rolling back migration: 018_add_project_type_support');
  
  try {
    // Remove indexes
    await db.query(`DROP INDEX IF EXISTS idx_pricing_rules_composite_with_project_type;`);
    await db.query(`DROP INDEX IF EXISTS idx_pricing_rules_project_type;`);
    await db.query(`DROP INDEX IF EXISTS idx_rfqs_project_type;`);
    
    // Remove columns
    await db.query(`ALTER TABLE client_pricing_rules DROP COLUMN IF EXISTS project_type;`);
    await db.query(`ALTER TABLE rfqs DROP COLUMN IF EXISTS project_type;`);
    
    console.log('✅ Migration rolled back: Project type support removed');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };

