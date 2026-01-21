// Load environment variables
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

/**
 * Migration: Add AI Approval Columns to pricing_runs
 *
 * Adds columns to store AI risk assessment results:
 * - ai_risk_level: LOW, MEDIUM, HIGH
 * - ai_risk_score: 0-100 numeric score
 * - ai_recommendation: AUTO_APPROVE, MANUAL_REVIEW
 * - ai_risk_factors: JSONB with detailed risk factors
 * - ai_rationale: Text with AI-generated explanation
 * - ai_assessed_at: Timestamp when assessment was performed
 */
async function up(db) {
  // db parameter is REQUIRED - migrations must use MIGRATION_DATABASE_URL
  if (!db) {
    throw new Error('Migration 004 requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Running migration: Add AI Approval Columns');

  try {
    // Check if pricing_runs table exists
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pricing_runs'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('⚠️  pricing_runs table does not exist, skipping AI approval columns migration');
      return;
    }

    // Add AI risk assessment columns
    await db.query(`
      ALTER TABLE pricing_runs
      ADD COLUMN IF NOT EXISTS ai_risk_level TEXT,
      ADD COLUMN IF NOT EXISTS ai_risk_score INTEGER,
      ADD COLUMN IF NOT EXISTS ai_recommendation TEXT,
      ADD COLUMN IF NOT EXISTS ai_risk_factors JSONB,
      ADD COLUMN IF NOT EXISTS ai_rationale TEXT,
      ADD COLUMN IF NOT EXISTS ai_key_points TEXT[],
      ADD COLUMN IF NOT EXISTS ai_warnings TEXT[],
      ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(3,2),
      ADD COLUMN IF NOT EXISTS ai_assessed_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('✓ Added AI columns to pricing_runs');

    // Add constraint for ai_risk_level
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'check_ai_risk_level'
          AND conrelid = 'pricing_runs'::regclass
        ) THEN
          ALTER TABLE pricing_runs
            ADD CONSTRAINT check_ai_risk_level
            CHECK (ai_risk_level IS NULL OR ai_risk_level IN ('LOW', 'MEDIUM', 'HIGH'));
        END IF;
      END $$;
    `);
    console.log('✓ Added constraint: check_ai_risk_level');

    // Add constraint for ai_recommendation
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'check_ai_recommendation'
          AND conrelid = 'pricing_runs'::regclass
        ) THEN
          ALTER TABLE pricing_runs
            ADD CONSTRAINT check_ai_recommendation
            CHECK (ai_recommendation IS NULL OR ai_recommendation IN ('AUTO_APPROVE', 'MANUAL_REVIEW'));
        END IF;
      END $$;
    `);
    console.log('✓ Added constraint: check_ai_recommendation');

    // Add constraint for ai_risk_score
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'check_ai_risk_score'
          AND conrelid = 'pricing_runs'::regclass
        ) THEN
          ALTER TABLE pricing_runs
            ADD CONSTRAINT check_ai_risk_score
            CHECK (ai_risk_score IS NULL OR (ai_risk_score >= 0 AND ai_risk_score <= 100));
        END IF;
      END $$;
    `);
    console.log('✓ Added constraint: check_ai_risk_score');

    // Add constraint for ai_confidence
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'check_ai_confidence'
          AND conrelid = 'pricing_runs'::regclass
        ) THEN
          ALTER TABLE pricing_runs
            ADD CONSTRAINT check_ai_confidence
            CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1));
        END IF;
      END $$;
    `);
    console.log('✓ Added constraint: check_ai_confidence');

    // Add index for querying by AI recommendation
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_ai_recommendation
      ON pricing_runs(ai_recommendation, ai_assessed_at DESC)
      WHERE ai_recommendation IS NOT NULL;
    `);
    console.log('✓ Added index: pricing_runs(ai_recommendation, ai_assessed_at)');

    // Add index for querying by risk level
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_runs_ai_risk_level
      ON pricing_runs(ai_risk_level, ai_risk_score)
      WHERE ai_risk_level IS NOT NULL;
    `);
    console.log('✓ Added index: pricing_runs(ai_risk_level, ai_risk_score)');

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback migration
 */
async function down(db) {
  if (!db) {
    throw new Error('Migration 004 down() requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Rolling back migration: Add AI Approval Columns');

  try {
    // Remove indexes
    await db.query(`
      DROP INDEX IF EXISTS idx_pricing_runs_ai_recommendation;
      DROP INDEX IF EXISTS idx_pricing_runs_ai_risk_level;
    `);
    console.log('✓ Removed indexes');

    // Remove constraints
    await db.query(`
      ALTER TABLE pricing_runs
      DROP CONSTRAINT IF EXISTS check_ai_risk_level,
      DROP CONSTRAINT IF EXISTS check_ai_recommendation,
      DROP CONSTRAINT IF EXISTS check_ai_risk_score,
      DROP CONSTRAINT IF EXISTS check_ai_confidence;
    `);
    console.log('✓ Removed constraints');

    // Remove columns
    await db.query(`
      ALTER TABLE pricing_runs
      DROP COLUMN IF EXISTS ai_risk_level,
      DROP COLUMN IF EXISTS ai_risk_score,
      DROP COLUMN IF EXISTS ai_recommendation,
      DROP COLUMN IF EXISTS ai_risk_factors,
      DROP COLUMN IF EXISTS ai_rationale,
      DROP COLUMN IF EXISTS ai_key_points,
      DROP COLUMN IF EXISTS ai_warnings,
      DROP COLUMN IF EXISTS ai_confidence,
      DROP COLUMN IF EXISTS ai_assessed_at;
    `);
    console.log('✓ Removed AI columns');

    console.log('Rollback completed successfully');
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
};

