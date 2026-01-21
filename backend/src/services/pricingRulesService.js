const { withTenantContext } = require('../db/tenantContext');

/**
 * Finds the best matching pricing rule for a given client, origin type, category, and project type.
 * Uses specificity scoring to prefer more specific rules over generic ones.
 * 
 * Priority order:
 * 1. Client-specific rules over global rules
 * 2. Specific project_type over NULL
 * 3. Specific origin_type over 'ANY'
 * 4. Specific category over 'ANY'
 * 
 * TENANT ISOLATION (Phase 1):
 * - Uses withTenantContext to enforce RLS policies
 * - All queries are tenant-scoped via RLS
 * - tenantId is required for all operations
 * 
 * @param {Object} params - Search parameters
 * @param {string|null} params.clientId - Client UUID (null for tenant-level rules)
 * @param {string} params.originType - Origin type ('CHINA', 'NON_CHINA', etc.)
 * @param {string} params.category - Material category ('PIPE', 'PLATE', etc.)
 * @param {string|null} params.projectType - Project type ('standard', 'rush', 'ltpa', 'spot', or null)
 * @param {string} params.tenantId - Tenant UUID (required)
 * @param {Object} [db] - Optional database client from withTenantTransaction (for transaction reuse)
 * @returns {Promise<Object|null>} Best matching rule or null if none found
 */
async function findBestPricingRule(
  { clientId, originType, category, projectType = null, tenantId },
  db = null
) {
  // Validate tenantId
  if (!tenantId) {
    throw new Error('tenantId is required for findBestPricingRule');
  }

  // If db client is provided (from transaction), use it directly with tenant context already set
  // Otherwise, use withTenantContext to create a new tenant-scoped query
  const { retryDbOperation } = require('../utils/dbWarmup');

  if (db) {
    // Wrap with retry logic to handle warmup issues
    return await retryDbOperation(
      async () => findBestPricingRuleWithClient(db, { clientId, originType, category, projectType }),
      {
        maxRetries: 2,
        retryDelay: 300,
        operationName: 'Find best pricing rule (with client)',
      }
    );
  } else {
    // Wrap with retry logic to handle warmup issues
    return await retryDbOperation(
      async () => withTenantContext(tenantId, async (client) => {
        return await findBestPricingRuleWithClient(client, { clientId, originType, category, projectType });
      }),
      {
        maxRetries: 2,
        retryDelay: 300,
        operationName: 'Find best pricing rule (new context)',
      }
    );
  }
}

/**
 * Internal helper: Finds best pricing rule using a provided database client
 * (client should already have tenant context set via withTenantContext/withTenantTransaction)
 */
async function findBestPricingRuleWithClient(
  dbClient,
  { clientId, originType, category, projectType = null }
) {

  // Check if table exists and what columns are available
  let hasProjectTypeColumn = false;
  let hasTenantIdColumn = false;
  let tableExists = false;
  
  try {
    // First check if table exists
    const tableCheck = await dbClient.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'client_pricing_rules'
      );
    `);
    tableExists = tableCheck.rows[0].exists;
    
    if (tableExists) {
      // Check for project_type column
      const projectTypeCheck = await dbClient.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'client_pricing_rules' 
          AND column_name = 'project_type'
        );
      `);
      hasProjectTypeColumn = projectTypeCheck.rows[0].exists;
      
      // Check for tenant_id column
      const tenantIdCheck = await dbClient.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'client_pricing_rules' 
          AND column_name = 'tenant_id'
        );
      `);
      hasTenantIdColumn = tenantIdCheck.rows[0].exists;
    }
  } catch (err) {
    // If table doesn't exist or check fails, assume columns don't exist
    console.warn('Could not check client_pricing_rules schema:', err.message);
    tableExists = false;
  }

  // If table doesn't exist, return null
  if (!tableExists) {
    return null;
  }

  // Build query to find matching rules with tenant scoping
  // Rules match if:
  // - tenant_id = given tenantId (if column exists)
  // - client_id = given clientId OR client_id IS NULL (global)
  // - project_type = given projectType OR project_type IS NULL (if column exists)
  // - origin_type = given originType OR origin_type = 'ANY'
  // - category = given category OR category = 'ANY'
  let query;
  let params;
  let paramIndex = 1;

  // Build WHERE clause dynamically based on available columns
  const whereConditions = [];
  params = []; // Initialize params array

  console.log('[findBestPricingRule] Input parameters:', {
    clientId,
    clientIdType: typeof clientId,
    clientIdValue: JSON.stringify(clientId),
    originType,
    category,
    projectType
  });

  // Tenant isolation is handled by RLS policies via withTenantContext
  // No need to filter by tenant_id in WHERE clause - RLS does it automatically

  // Validate clientId before using it in query (prevent empty string UUID casting errors)
  const isValidClientId = clientId && typeof clientId === 'string' && clientId.trim() !== '' && clientId !== 'null' && clientId !== 'undefined';

  if (isValidClientId) {
    whereConditions.push(`(client_id = $${paramIndex} OR client_id IS NULL)`);
    params.push(clientId);
    paramIndex++;
  } else {
    whereConditions.push(`client_id IS NULL`);
  }
  
  if (hasProjectTypeColumn) {
    // Validate projectType to prevent empty string UUID errors
    const isValidProjectType = projectType && typeof projectType === 'string' && projectType.trim() !== '';
    if (isValidProjectType) {
      whereConditions.push(`(project_type = $${paramIndex} OR project_type IS NULL)`);
      params.push(projectType);
      paramIndex++;
    } else {
      whereConditions.push(`project_type IS NULL`);
    }
  }
  
  // Validate originType to prevent empty string errors
  const isValidOriginType = originType && typeof originType === 'string' && originType.trim() !== '';
  if (isValidOriginType) {
    whereConditions.push(`(origin_type = $${paramIndex} OR origin_type = 'ANY')`);
    params.push(originType);
    paramIndex++;
  } else {
    whereConditions.push(`origin_type = 'ANY'`);
  }

  // Validate category to prevent empty string errors
  const isValidCategory = category && typeof category === 'string' && category.trim() !== '';
  if (isValidCategory) {
    whereConditions.push(`(category = $${paramIndex} OR category = 'ANY')`);
    params.push(category);
  } else {
    whereConditions.push(`category = 'ANY'`);
  }
  
  // Build SELECT clause
  const selectColumns = [
    'id',
    'client_id',
    hasProjectTypeColumn ? 'project_type' : 'NULL as project_type',
    'origin_type',
    'category',
    'markup_pct',
    'logistics_pct',
    'risk_pct',
    'notes'
  ];
  
  // Build ORDER BY clause
  const orderByClauses = [
    '(client_id IS NOT NULL)::int DESC'
  ];
  
  if (hasProjectTypeColumn) {
    orderByClauses.push('(project_type IS NOT NULL)::int DESC');
  }
  
  orderByClauses.push('(origin_type != \'ANY\')::int DESC');
  orderByClauses.push('(category != \'ANY\')::int DESC');
  
  query = `
    SELECT
      ${selectColumns.join(', ')}
    FROM client_pricing_rules
    WHERE
      ${whereConditions.join(' AND ')}
    ORDER BY
      ${orderByClauses.join(', ')}
    LIMIT 1
  `;

  console.log('[findBestPricingRule] About to execute query:', {
    paramsLength: params.length,
    params: params,
    paramsJSON: JSON.stringify(params),
    whereConditions: whereConditions
  });

  const result = await dbClient.query(query, params);

  if (result.rows.length === 0) {
    return null;
  }

  const rule = result.rows[0];
  
  return {
    markup_pct: parseFloat(rule.markup_pct),
    logistics_pct: parseFloat(rule.logistics_pct),
    risk_pct: parseFloat(rule.risk_pct),
    project_type: rule.project_type,
    origin_type: rule.origin_type,
    category: rule.category,
    rule_level: rule.client_id ? 'CLIENT_SPECIFIC' : 'TENANT_LEVEL',
    notes: rule.notes,
  };
}

module.exports = {
  findBestPricingRule,
};

