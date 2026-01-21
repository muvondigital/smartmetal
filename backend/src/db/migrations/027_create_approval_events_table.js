/**
 * Migration 027: Create Approval Events Table (Immutable Audit Trail)
 *
 * Purpose: Creates an immutable approval events table for complete audit trail
 *
 * Features:
 * - Immutable log of all approval actions (INSERT-only, no updates/deletes)
 * - Captures before/after state for all status changes
 * - Includes actor information, IP address, user agent
 * - Supports compliance/audit requirements
 * - Separate from approval_history table which can be summarized
 *
 * Use Cases:
 * - Compliance audits (who changed what when)
 * - Security investigations (unauthorized changes)
 * - Dispute resolution (complete timeline)
 * - Performance analytics (approval bottlenecks)
 *
 * Created: Dec 3, 2025
 */

async function up(db) {
  if (!db) {
    throw new Error('Migration 027 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Creating approval_events table (immutable audit trail)...');

  await db.query(`
    -- Approval Events Table (Immutable Audit Trail)
    CREATE TABLE IF NOT EXISTS approval_events (
      -- Primary key
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Event metadata
      event_type VARCHAR(50) NOT NULL, -- 'status_change', 'level_change', 'sla_expired', 'escalated', 'backup_assigned'
      event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pricing_run_id UUID NOT NULL REFERENCES pricing_runs(id) ON DELETE RESTRICT,

      -- Actor information
      actor_id VARCHAR(255), -- User ID from auth system
      actor_name VARCHAR(255),
      actor_email VARCHAR(255),
      actor_role VARCHAR(50), -- 'sales', 'procurement', 'management', 'system', 'ai'
      actor_ip_address INET, -- IP address for security audit
      actor_user_agent TEXT, -- Browser/client user agent

      -- State before change
      previous_status VARCHAR(50),
      previous_level INT,
      previous_approver VARCHAR(255),

      -- State after change
      new_status VARCHAR(50),
      new_level INT,
      new_approver VARCHAR(255),

      -- Additional context
      notes TEXT,
      metadata JSONB, -- Flexible field for additional data (risk scores, AI assessment, etc.)

      -- Correlation and tracing
      correlation_id UUID, -- Request correlation ID for tracing
      tenant_id UUID, -- Multi-tenant support

      -- Compliance fields
      is_automated BOOLEAN DEFAULT false, -- True if action was automated (AI, SLA enforcement)
      requires_review BOOLEAN DEFAULT false, -- True if action requires manual review

      -- Indexes will be created separately
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Indexes for fast querying
    CREATE INDEX IF NOT EXISTS idx_approval_events_pricing_run
      ON approval_events(pricing_run_id, event_timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_approval_events_actor
      ON approval_events(actor_email, event_timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_approval_events_tenant
      ON approval_events(tenant_id, event_timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_approval_events_type
      ON approval_events(event_type, event_timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_approval_events_correlation
      ON approval_events(correlation_id);

    -- Trigger to prevent updates/deletes (immutable log)
    CREATE OR REPLACE FUNCTION prevent_approval_events_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'approval_events table is immutable. Updates are not allowed. Event ID: %', OLD.id;
      ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'approval_events table is immutable. Deletes are not allowed. Event ID: %', OLD.id;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS approval_events_immutable_trigger ON approval_events;
    CREATE TRIGGER approval_events_immutable_trigger
    BEFORE UPDATE OR DELETE ON approval_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_approval_events_modification();

    COMMENT ON TABLE approval_events IS 'Immutable audit trail for all approval-related events. INSERT-only table for compliance.';
    COMMENT ON COLUMN approval_events.event_type IS 'Type of event: status_change, level_change, sla_expired, escalated, backup_assigned';
    COMMENT ON COLUMN approval_events.metadata IS 'JSONB field for additional context: risk_score, ai_confidence, sla_deadline, etc.';
    COMMENT ON COLUMN approval_events.is_automated IS 'True if action was automated (AI auto-approval, SLA enforcement)';
  `);

  console.log('✅ approval_events table created successfully');
  console.log('✅ Immutability trigger created (prevents updates/deletes)');
  console.log('✅ Indexes created for fast querying');
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 027 requires db parameter. Use runAllMigrations.js to run migrations.');
  }

  console.log('Dropping approval_events table...');

  await db.query(`
    DROP TRIGGER IF EXISTS approval_events_immutable_trigger ON approval_events;
    DROP FUNCTION IF EXISTS prevent_approval_events_modification();
    DROP TABLE IF EXISTS approval_events CASCADE;
  `);

  console.log('✅ approval_events table dropped');
}

module.exports = { up, down };
