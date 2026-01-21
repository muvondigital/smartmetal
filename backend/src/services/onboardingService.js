const { connectDb } = require('../db/supabaseClient');
const { withTenantContext } = require('../db/tenantContext');
const { ValidationError } = require('../middleware/errorHandler');
const { log } = require('../utils/logger');

const ALLOWED_STATUSES = ['not_started', 'in_progress', 'completed'];
const ALLOWED_STEPS = [
  'profile',
  'approval_rules',
  'operator_rules',
  'pricing',
  'catalog',
  'notifications',
  'regulatory',
  'review',
];

const ACTIVITY_EVENT_TYPES = {
  ENTER_STEP: 'ENTER_STEP',
  COMPLETE_STEP: 'COMPLETE_STEP',
};

function normalizeStatus(row) {
  return {
    tenantId: row.tenant_id,
    status: row.status,
    currentStep: row.current_step || null,
    completedSteps: Array.isArray(row.completed_steps) ? row.completed_steps : [],
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

function ensureStepIsValid(step) {
  if (!step || typeof step !== 'string') {
    throw new ValidationError('step is required');
  }
  if (!ALLOWED_STEPS.includes(step)) {
    throw new ValidationError(`step must be one of: ${ALLOWED_STEPS.join(', ')}`);
  }
}

async function getOrCreateTenantOnboardingStatus(tenantId) {
  if (!tenantId) {
    throw new ValidationError('tenantId is required');
  }

  return await withTenantContext(tenantId, async (client) => {
    const existing = await client.query('SELECT * FROM tenant_onboarding_status WHERE tenant_id = $1', [tenantId]);
    if (existing.rows[0]) {
      return normalizeStatus(existing.rows[0]);
    }

    const created = await client.query(
      `INSERT INTO tenant_onboarding_status (tenant_id)
       VALUES ($1)
       ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
       RETURNING *`,
      [tenantId]
    );

    return normalizeStatus(created.rows[0]);
  });
}

async function updateTenantOnboardingStep(tenantId, { step, markCompleted = false } = {}) {
  ensureStepIsValid(step);

  if (markCompleted !== undefined && typeof markCompleted !== 'boolean') {
    throw new ValidationError('markCompleted must be a boolean');
  }

  const current = await getOrCreateTenantOnboardingStatus(tenantId);

  if (current.status === 'completed') {
    throw new ValidationError('Onboarding already completed for this tenant');
  }

  const completedSteps = Array.isArray(current.completedSteps) ? [...current.completedSteps] : [];
  if (markCompleted && !completedSteps.includes(step)) {
    completedSteps.push(step);
  }

  const nextStatus = current.status === 'not_started' ? 'in_progress' : current.status;

  return await withTenantContext(tenantId, async (client) => {
    const result = await client.query(
      `
        UPDATE tenant_onboarding_status
        SET current_step = $1,
            status = $2,
            completed_steps = $3,
            updated_at = NOW()
        WHERE tenant_id = $4
        RETURNING *
      `,
      [step, nextStatus, JSON.stringify(completedSteps), tenantId]
    );

    const updated = result.rows[0];
    const eventType = markCompleted ? ACTIVITY_EVENT_TYPES.COMPLETE_STEP : ACTIVITY_EVENT_TYPES.ENTER_STEP;
    log.info('Updated tenant onboarding status', {
      tenantId,
      step,
      markCompleted,
      status: updated?.status,
      eventType,
      timestamp: new Date().toISOString(),
    });

    try {
      await client.query(
        `
          INSERT INTO onboarding_activity_log (tenant_id, step, event_type)
          VALUES ($1, $2, $3)
        `,
        [tenantId, step, eventType]
      );
    } catch (error) {
      log.warn('Failed to record onboarding activity log', {
        tenantId,
        step,
        eventType,
        error: error?.message,
      });
    }

    return normalizeStatus(updated);
  });
}

async function markTenantOnboardingComplete(tenantId) {
  if (!tenantId) {
    throw new ValidationError('tenantId is required');
  }

  await getOrCreateTenantOnboardingStatus(tenantId);

  return await withTenantContext(tenantId, async (client) => {
    const result = await client.query(
      `
        UPDATE tenant_onboarding_status
        SET status = 'completed',
            completed_at = NOW(),
            updated_at = NOW()
        WHERE tenant_id = $1
        RETURNING *
      `,
      [tenantId]
    );

    const updated = result.rows[0];
    log.info('Tenant onboarding marked complete', { tenantId });

    return normalizeStatus(updated);
  });
}

module.exports = {
  ALLOWED_STATUSES,
  ALLOWED_STEPS,
  getOrCreateTenantOnboardingStatus,
  updateTenantOnboardingStep,
  markTenantOnboardingComplete,
};
