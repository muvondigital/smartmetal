/**
 * Migration: Add Multi-Level Approval Workflow Support
 * 
 * Purpose: Adds columns to support 3-level approval workflow (Sales → Procurement → Management)
 * Part of: Stage 7 - Approval Workflow v2
 * 
 * Approval Levels:
 * - Level 0: Draft (Created by AI/Sales)
 * - Level 1: Sales Review → Approve/Reject
 * - Level 2: Procurement Review → Approve/Reject (cost verification)
 * - Level 3: Management Review → Approve/Reject (margin check)
 * - Level 4: Approved → Ready to send to client
 * 
 * SLA Tracking:
 * - Sales: 24 hours
 * - Procurement: 48 hours
 * - Management: 48 hours
 * - Backup approver after 24h idle
 */

async function up(db) {
  console.log('Running migration: 019_add_multi_level_approval');
  
  try {
    // 1. Add approval_level column to track current approval level
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS approval_level INTEGER DEFAULT 0
      CHECK (approval_level >= 0 AND approval_level <= 4);
    `);
    console.log('✅ Added approval_level column to pricing_runs table');
    
    // 2. Add level-specific approval tracking columns
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS sales_approved_by TEXT,
      ADD COLUMN IF NOT EXISTS sales_approved_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS sales_submitted_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS procurement_approved_by TEXT,
      ADD COLUMN IF NOT EXISTS procurement_approved_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS procurement_submitted_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS management_approved_by TEXT,
      ADD COLUMN IF NOT EXISTS management_approved_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS management_submitted_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('✅ Added level-specific approval columns to pricing_runs table');
    
    // 3. Add SLA tracking columns
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS sales_sla_deadline TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS procurement_sla_deadline TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS management_sla_deadline TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS sla_expired BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS escalated_to TEXT,
      ADD COLUMN IF NOT EXISTS backup_approver_assigned BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS backup_approver_assigned_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS backup_approver_email TEXT;
    `);
    console.log('✅ Added SLA tracking columns to pricing_runs table');
    
    // 4. Add approval path tracking (JSONB to store the determined approval path)
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS approval_path JSONB;
    `);
    console.log('✅ Added approval_path column to pricing_runs table');
    
    // 5. Create indexes for performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_approval_level
      ON pricing_runs(approval_level)
      WHERE approval_status = 'pending_approval';
    `);
    console.log('✅ Created index on approval_level');
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_sla_deadlines
      ON pricing_runs(sales_sla_deadline, procurement_sla_deadline, management_sla_deadline)
      WHERE approval_status = 'pending_approval';
    `);
    console.log('✅ Created index on SLA deadlines');
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_escalated
      ON pricing_runs(escalated)
      WHERE escalated = true;
    `);
    console.log('✅ Created index on escalated flag');
    
    // 6. Update users table to support procurement role (if table exists)
    const usersTableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);

    if (usersTableCheck.rows[0].exists) {
      await db.query(`
        DO $$
        DECLARE
          invalid_count INTEGER;
        BEGIN
          -- Drop existing constraint if it exists
          IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'check_role'
            AND conrelid = 'users'::regclass
          ) THEN
            ALTER TABLE users DROP CONSTRAINT check_role;
          END IF;

          -- Find and fix users with invalid roles
          -- Map common invalid roles to valid ones
          UPDATE users
          SET role = CASE
            WHEN role IS NULL THEN 'sales_rep'
            WHEN role NOT IN ('sales_rep', 'procurement', 'manager', 'admin') THEN 'sales_rep'
            ELSE role
          END
          WHERE role IS NULL OR role NOT IN ('sales_rep', 'procurement', 'manager', 'admin');

          GET DIAGNOSTICS invalid_count = ROW_COUNT;
          IF invalid_count > 0 THEN
            RAISE NOTICE 'Fixed % user(s) with invalid roles', invalid_count;
          END IF;

          -- Add new constraint with procurement role
          ALTER TABLE users
          ADD CONSTRAINT check_role
          CHECK (role IN ('sales_rep', 'procurement', 'manager', 'admin'));
        END $$;
      `);
      console.log('✅ Updated users table to support procurement role');
    } else {
      console.log('⚠️  Table users does not exist, skipping users table changes');
    }
    
    console.log('✅ Migration completed: Multi-level approval support added');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down(db) {
  console.log('Rolling back migration: 019_add_multi_level_approval');
  
  try {
    // Remove indexes
    await db.query(`DROP INDEX IF EXISTS idx_pricing_runs_escalated;`);
    await db.query(`DROP INDEX IF EXISTS idx_pricing_runs_sla_deadlines;`);
    await db.query(`DROP INDEX IF EXISTS idx_pricing_runs_approval_level;`);
    
    // Remove columns
    await db.query(`
      ALTER TABLE pricing_runs
      DROP COLUMN IF EXISTS approval_path,
      DROP COLUMN IF EXISTS backup_approver_email,
      DROP COLUMN IF EXISTS backup_approver_assigned_at,
      DROP COLUMN IF EXISTS backup_approver_assigned,
      DROP COLUMN IF EXISTS escalated_to,
      DROP COLUMN IF EXISTS escalated_at,
      DROP COLUMN IF EXISTS escalated,
      DROP COLUMN IF EXISTS sla_expired,
      DROP COLUMN IF EXISTS management_sla_deadline,
      DROP COLUMN IF EXISTS procurement_sla_deadline,
      DROP COLUMN IF EXISTS sales_sla_deadline,
      DROP COLUMN IF EXISTS management_submitted_at,
      DROP COLUMN IF EXISTS management_approved_at,
      DROP COLUMN IF EXISTS management_approved_by,
      DROP COLUMN IF EXISTS procurement_submitted_at,
      DROP COLUMN IF EXISTS procurement_approved_at,
      DROP COLUMN IF EXISTS procurement_approved_by,
      DROP COLUMN IF EXISTS sales_submitted_at,
      DROP COLUMN IF EXISTS sales_approved_at,
      DROP COLUMN IF EXISTS sales_approved_by,
      DROP COLUMN IF EXISTS approval_level;
    `);
    
    // Restore original role constraint
    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'check_role'
          AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users DROP CONSTRAINT check_role;
        END IF;
        
        ALTER TABLE users
        ADD CONSTRAINT check_role
        CHECK (role IN ('sales_rep', 'manager', 'admin'));
      END $$;
    `);
    
    console.log('✅ Migration rolled back: Multi-level approval support removed');
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };

