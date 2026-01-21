// Load environment variables
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

/**
 * Migration: Create AI Predictions Table for Stage 4
 *
 * This table stores AI-powered win probability predictions and pricing recommendations
 * for pricing runs, enabling:
 * - Win probability prediction
 * - Optimal pricing recommendations
 * - Performance tracking (predicted vs actual outcomes)
 * - Continuous model improvement via feedback loop
 */
async function up(db) {
  // db parameter is REQUIRED - migrations must use MIGRATION_DATABASE_URL
  if (!db) {
    throw new Error('Migration 006 requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Running migration: Create AI Predictions Table (Stage 4)');

  try {
    // Check if pricing_runs table exists
    const pricingRunsExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pricing_runs'
      );
    `);
    
    // Create ai_predictions table
    // Note: FK constraint will be added later when pricing_runs table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS ai_predictions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pricing_run_id UUID,

        -- Prediction results
        predicted_win_probability DECIMAL(5,4) NOT NULL CHECK (predicted_win_probability >= 0 AND predicted_win_probability <= 1),
        confidence_score DECIMAL(5,4) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
        risk_level VARCHAR(20) CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),

        -- Current pricing analysis
        current_margin_pct DECIMAL(5,2),
        current_total_price DECIMAL(12,2),
        current_expected_revenue DECIMAL(12,2), -- total_price * win_probability

        -- Recommended pricing
        recommended_margin_pct DECIMAL(5,2),
        recommended_total_price DECIMAL(12,2),
        recommended_win_probability DECIMAL(5,4) CHECK (recommended_win_probability >= 0 AND recommended_win_probability <= 1),
        recommended_expected_revenue DECIMAL(12,2),
        optimization_gain_pct DECIMAL(6,2), -- % improvement in expected revenue

        -- Rationale and reasoning
        rationale JSONB, -- Array of reasons for recommendation
        risk_analysis JSONB, -- {downside_risk, upside_potential, confidence}
        similar_quotes JSONB, -- Historical quotes used for prediction

        -- Features used for prediction
        features JSONB, -- All extracted features (client, material, temporal, etc.)

        -- Actual outcome (filled in later for feedback loop)
        actual_outcome VARCHAR(20) CHECK (actual_outcome IN ('won', 'lost', 'pending', 'cancelled')),
        actual_final_price DECIMAL(12,2),
        actual_margin_pct DECIMAL(5,2),
        outcome_recorded_at TIMESTAMP WITH TIME ZONE,

        -- User interaction tracking
        user_action VARCHAR(50) CHECK (user_action IN ('accepted', 'rejected', 'modified', 'ignored')),
        user_applied_recommendation BOOLEAN DEFAULT false,
        user_feedback TEXT, -- Optional user notes

        -- Metadata
        model_version VARCHAR(50) DEFAULT 'gpt-4o-v1',
        prediction_time_ms INTEGER, -- How long prediction took
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✓ Created table: ai_predictions');

    // Create indexes for performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_predictions_pricing_run
      ON ai_predictions(pricing_run_id);
    `);
    console.log('✓ Added index: ai_predictions(pricing_run_id)');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_predictions_created
      ON ai_predictions(created_at DESC);
    `);
    console.log('✓ Added index: ai_predictions(created_at)');

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_predictions_outcome
      ON ai_predictions(actual_outcome, created_at DESC)
      WHERE actual_outcome IS NOT NULL;
    `);
    console.log('✓ Added index: ai_predictions(actual_outcome, created_at) (partial)');

    // Create updated_at trigger
    await db.query(`
      DROP TRIGGER IF EXISTS update_ai_predictions_updated_at ON ai_predictions;
      CREATE TRIGGER update_ai_predictions_updated_at
      BEFORE UPDATE ON ai_predictions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('✓ Created trigger: update_ai_predictions_updated_at');

    // Add FK constraint to pricing_runs if pricing_runs table exists
    if (pricingRunsExists.rows[0].exists) {
      // Check if FK constraint already exists
      const fkExists = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.table_constraints
          WHERE table_name = 'ai_predictions'
          AND constraint_name = 'ai_predictions_pricing_run_id_fkey'
          AND constraint_type = 'FOREIGN KEY'
        );
      `);
      
      if (!fkExists.rows[0].exists) {
        await db.query(`
          ALTER TABLE ai_predictions
          ADD CONSTRAINT ai_predictions_pricing_run_id_fkey
          FOREIGN KEY (pricing_run_id) REFERENCES pricing_runs(id) ON DELETE CASCADE;
        `);
        console.log('✅ Added FK constraint: ai_predictions.pricing_run_id → pricing_runs.id');
      }
    } else {
      console.log('⚠️  pricing_runs table does not exist yet, FK constraint will be added when pricing_runs is created');
    }

    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback migration
 */
async function down(db) {
  if (!db) {
    throw new Error('Migration 006 down() requires db parameter. Migrations must use MIGRATION_DATABASE_URL.');
  }

  console.log('Rolling back migration: Create AI Predictions Table');

  try {
    await db.query(`
      DROP TRIGGER IF EXISTS update_ai_predictions_updated_at ON ai_predictions;
      DROP INDEX IF EXISTS idx_ai_predictions_outcome;
      DROP INDEX IF EXISTS idx_ai_predictions_created;
      DROP INDEX IF EXISTS idx_ai_predictions_pricing_run;
      DROP TABLE IF EXISTS ai_predictions CASCADE;
    `);
    console.log('✓ Dropped table and indexes: ai_predictions');

    console.log('✅ Rollback completed successfully');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  up()
    .then(() => {
      console.log('\n✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { up, down };
