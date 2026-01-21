/**
 * Migration 071: Fix approval_history Column Names
 *
 * Purpose: Add actor_name, actor_email, and notes columns to approval_history table
 *          to match what the code expects while keeping backward compatibility
 *
 * Issue: Code uses actor_name/actor_email/notes but schema has approver_name/approver_email/comments
 *
 * Solution:
 * 1. Add new columns (actor_name, actor_email, notes)
 * 2. Copy existing data from old columns
 * 3. Keep old columns for backward compatibility
 * 4. Future: deprecate old columns after verifying all code uses new columns
 *
 * Created: Dec 17, 2025
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 071 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Adding actor_name, actor_email, and notes columns to approval_history...');

  await db.query(`
    -- Add new columns if they don't exist
    DO $$
    BEGIN
      -- Add actor_name column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approval_history' AND column_name = 'actor_name'
      ) THEN
        ALTER TABLE approval_history ADD COLUMN actor_name TEXT;
        COMMENT ON COLUMN approval_history.actor_name IS 'Name of person/system performing the action (replaces approver_name)';
      END IF;

      -- Add actor_email column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approval_history' AND column_name = 'actor_email'
      ) THEN
        ALTER TABLE approval_history ADD COLUMN actor_email TEXT;
        COMMENT ON COLUMN approval_history.actor_email IS 'Email of person/system performing the action (replaces approver_email)';
      END IF;

      -- Add notes column
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'approval_history' AND column_name = 'notes'
      ) THEN
        ALTER TABLE approval_history ADD COLUMN notes TEXT;
        COMMENT ON COLUMN approval_history.notes IS 'Additional notes/comments about the action (replaces comments)';
      END IF;
    END $$;

    -- Copy data from old columns to new columns (for existing rows)
    UPDATE approval_history
    SET
      actor_name = COALESCE(actor_name, approver_name),
      actor_email = COALESCE(actor_email, approver_email),
      notes = COALESCE(notes, comments)
    WHERE
      actor_name IS NULL OR
      actor_email IS NULL OR
      notes IS NULL;

    -- Create indexes on new columns for performance
    CREATE INDEX IF NOT EXISTS idx_approval_history_actor_email
      ON approval_history(actor_email);

    CREATE INDEX IF NOT EXISTS idx_approval_history_actor_name
      ON approval_history(actor_name);

    COMMENT ON TABLE approval_history IS 'Audit trail of approval actions. Uses actor_name/actor_email/notes (preferred) or approver_name/approver_email/comments (legacy).';
  `);

  console.log('✅ Added actor_name, actor_email, and notes columns to approval_history');
  console.log('✅ Migrated existing data from old columns to new columns');
  console.log('✅ Created indexes for performance');
  console.log('ℹ️  Old columns (approver_name, approver_email, comments) retained for backward compatibility');
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 071 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Removing actor_name, actor_email, and notes columns from approval_history...');

  await db.query(`
    -- Drop indexes
    DROP INDEX IF EXISTS idx_approval_history_actor_email;
    DROP INDEX IF EXISTS idx_approval_history_actor_name;

    -- Drop new columns
    ALTER TABLE approval_history DROP COLUMN IF EXISTS actor_name;
    ALTER TABLE approval_history DROP COLUMN IF EXISTS actor_email;
    ALTER TABLE approval_history DROP COLUMN IF EXISTS notes;
  `);

  console.log('✅ Removed actor_name, actor_email, and notes columns from approval_history');
}

module.exports = { up, down };
