const { connectDb } = require('../db/supabaseClient');
const { log } = require('./logger');

function normalizeTenantCode(code) {
  const sanitized = (code || '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return sanitized || 'GEN';
}

function cleanFilename(name) {
  if (!name) return '';
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  const normalized = withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
    .join(' ')
    .trim();
}

function buildRfqTitle({ customerName, projectName, originalFilename, rfqCode }) {
  const hasCustomer = customerName && customerName.trim() !== '';
  const hasProject = projectName && projectName.trim() !== '';
  const cleanName = cleanFilename(originalFilename);

  if (hasCustomer && hasProject) {
    return `${customerName.trim()} – ${projectName.trim()}`;
  }

  if (hasCustomer && cleanName) {
    return `${customerName.trim()} – ${cleanName}`;
  }

  if (cleanName) {
    return cleanName;
  }

  if (hasCustomer) {
    return `RFQ for ${customerName.trim()}`;
  }

  return rfqCode ? `RFQ ${rfqCode}` : 'New RFQ';
}

async function generateRfqCode({ tenantId, tenantCode, createdAt }, dbOverride = null) {
  if (!tenantId) {
    throw new Error('tenantId is required to generate an RFQ code');
  }

  const db = dbOverride || (await connectDb());
  const year = new Date(createdAt || Date.now()).getFullYear();
  const tenant = normalizeTenantCode(tenantCode);
  const prefix = `RFQ-${tenant}-${year}-`;

  try {
    const result = await db.query(
      `
        SELECT rfq_code
        FROM rfqs
        WHERE tenant_id = $1
          AND rfq_code LIKE $2
        ORDER BY rfq_code DESC
        LIMIT 1
      `,
      [tenantId, `${prefix}%`]
    );

    let nextSequence = 1;
    if (result.rows.length > 0 && result.rows[0].rfq_code) {
      const parts = result.rows[0].rfq_code.split('-');
      const lastPart = parts[parts.length - 1];
      const parsed = parseInt(lastPart, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        nextSequence = parsed + 1;
      }
    }

    return `${prefix}${String(nextSequence).padStart(4, '0')}`;
  } catch (error) {
    log.logWarn('generateRfqCode: falling back to random suffix', {
      error: error.message,
      tenantId: tenantId?.toString().slice(0, 8),
    });
    const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}${randomSuffix}`;
  }
}

module.exports = {
  generateRfqCode,
  buildRfqTitle,
  cleanFilename,
};
