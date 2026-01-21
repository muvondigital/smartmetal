// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Approval Audit Service - Immutable event logging for compliance

const { connectDb } = require('../db/supabaseClient');
const { log } = require('../utils/logger');

/**
 * Logs an approval event to the immutable audit trail
 *
 * @param {Object} event - Event details
 * @param {string} event.eventType - Type of event ('status_change', 'level_change', 'sla_expired', etc.)
 * @param {string} event.pricingRunId - Pricing run UUID
 * @param {Object} event.actor - Actor information
 * @param {string} event.actor.id - Actor ID
 * @param {string} event.actor.name - Actor name
 * @param {string} event.actor.email - Actor email
 * @param {string} event.actor.role - Actor role ('sales', 'procurement', 'management', 'system', 'ai')
 * @param {string} [event.actor.ipAddress] - IP address
 * @param {string} [event.actor.userAgent] - User agent string
 * @param {Object} event.previousState - Previous state
 * @param {string} [event.previousState.status] - Previous approval status
 * @param {number} [event.previousState.level] - Previous approval level
 * @param {string} [event.previousState.approver] - Previous approver
 * @param {Object} event.newState - New state
 * @param {string} [event.newState.status] - New approval status
 * @param {number} [event.newState.level] - New approval level
 * @param {string} [event.newState.approver] - New approver
 * @param {string} [event.notes] - Additional notes
 * @param {Object} [event.metadata] - Additional metadata (JSONB)
 * @param {boolean} [event.isAutomated] - True if automated action
 * @param {boolean} [event.requiresReview] - True if requires manual review
 * @param {string} [event.correlationId] - Request correlation ID
 * @param {string} [event.tenantId] - Tenant UUID
 *
 * @returns {Promise<Object>} Created event
 */
async function logApprovalEvent(event) {
  const db = await connectDb();

  try {
    const result = await db.query(
      `INSERT INTO approval_events (
        event_type,
        event_timestamp,
        pricing_run_id,
        actor_id,
        actor_name,
        actor_email,
        actor_role,
        actor_ip_address,
        actor_user_agent,
        previous_status,
        previous_level,
        previous_approver,
        new_status,
        new_level,
        new_approver,
        notes,
        metadata,
        correlation_id,
        tenant_id,
        is_automated,
        requires_review
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING *`,
      [
        event.eventType,
        event.eventTimestamp || new Date(),
        event.pricingRunId,
        event.actor?.id || null,
        event.actor?.name || null,
        event.actor?.email || null,
        event.actor?.role || null,
        event.actor?.ipAddress || null,
        event.actor?.userAgent || null,
        event.previousState?.status || null,
        event.previousState?.level || null,
        event.previousState?.approver || null,
        event.newState?.status || null,
        event.newState?.level || null,
        event.newState?.approver || null,
        event.notes || null,
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.correlationId || null,
        event.tenantId || null,
        event.isAutomated || false,
        event.requiresReview || false,
      ]
    );

    log.info('Approval event logged', {
      eventId: result.rows[0].id,
      eventType: event.eventType,
      pricingRunId: event.pricingRunId,
      actor: event.actor?.name,
      correlationId: event.correlationId,
    });

    return result.rows[0];
  } catch (error) {
    log.error('Failed to log approval event', error, {
      eventType: event.eventType,
      pricingRunId: event.pricingRunId,
    });
    // Don't throw - audit logging should not break the main flow
    // But log the error for investigation
    return null;
  }
}

/**
 * Gets approval events for a pricing run
 *
 * @param {string} pricingRunId - Pricing run UUID
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Maximum events to return
 * @param {number} [options.offset] - Offset for pagination
 * @param {string} [options.eventType] - Filter by event type
 *
 * @returns {Promise<Array>} Approval events
 */
async function getApprovalEvents(pricingRunId, options = {}) {
  const db = await connectDb();

  const { limit = 100, offset = 0, eventType } = options;

  let query = `
    SELECT * FROM approval_events
    WHERE pricing_run_id = $1
  `;
  const params = [pricingRunId];

  if (eventType) {
    query += ` AND event_type = $${params.length + 1}`;
    params.push(eventType);
  }

  query += ` ORDER BY event_timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await db.query(query, params);

  return result.rows;
}

/**
 * Gets approval events by actor
 *
 * @param {string} actorEmail - Actor email
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Maximum events to return
 * @param {string} [options.tenantId] - Filter by tenant
 *
 * @returns {Promise<Array>} Approval events
 */
async function getApprovalEventsByActor(actorEmail, options = {}) {
  const db = await connectDb();

  const { limit = 100, tenantId } = options;

  let query = `
    SELECT * FROM approval_events
    WHERE actor_email = $1
  `;
  const params = [actorEmail];

  if (tenantId) {
    query += ` AND tenant_id = $${params.length + 1}`;
    params.push(tenantId);
  }

  query += ` ORDER BY event_timestamp DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await db.query(query, params);

  return result.rows;
}

/**
 * Gets approval events by correlation ID (for tracing a full request flow)
 *
 * @param {string} correlationId - Correlation ID
 *
 * @returns {Promise<Array>} Approval events
 */
async function getApprovalEventsByCorrelation(correlationId) {
  const db = await connectDb();

  const result = await db.query(
    `SELECT * FROM approval_events
     WHERE correlation_id = $1
     ORDER BY event_timestamp ASC`,
    [correlationId]
  );

  return result.rows;
}

/**
 * Gets approval event statistics
 *
 * @param {Object} options - Query options
 * @param {string} [options.tenantId] - Filter by tenant
 * @param {Date} [options.startDate] - Start date filter
 * @param {Date} [options.endDate] - End date filter
 *
 * @returns {Promise<Object>} Event statistics
 */
async function getApprovalEventStatistics(options = {}) {
  const db = await connectDb();

  const { tenantId, startDate, endDate } = options;

  let query = `
    SELECT
      event_type,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE is_automated = true) as automated_count,
      COUNT(*) FILTER (WHERE requires_review = true) as review_required_count
    FROM approval_events
    WHERE 1=1
  `;
  const params = [];

  if (tenantId) {
    query += ` AND tenant_id = $${params.length + 1}`;
    params.push(tenantId);
  }

  if (startDate) {
    query += ` AND event_timestamp >= $${params.length + 1}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND event_timestamp <= $${params.length + 1}`;
    params.push(endDate);
  }

  query += ` GROUP BY event_type ORDER BY count DESC`;

  const result = await db.query(query, params);

  return result.rows;
}

module.exports = {
  logApprovalEvent,
  getApprovalEvents,
  getApprovalEventsByActor,
  getApprovalEventsByCorrelation,
  getApprovalEventStatistics,
};
