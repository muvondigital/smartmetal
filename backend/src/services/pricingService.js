const { connectDb } = require('../db/supabaseClient');
const { getMaterialByCode } = require('./materialsService');
const { findBestPricingRule } = require('./pricingRulesService');
const { getRfqById } = require('./rfqService');
const { findActiveAgreement } = require('./priceAgreementsService');

/**
 * Gets all pricing runs for an RFQ
 * @param {string} rfqId - RFQ UUID
 * @returns {Promise<Array>} Array of pricing run objects
 */
async function getPricingRunsByRfqId(rfqId) {
  const db = await connectDb();
  const result = await db.query(
    `SELECT * FROM pricing_runs WHERE rfq_id = $1 ORDER BY created_at DESC`,
    [rfqId]
  );
  return result.rows;
}

/**
 * Gets a pricing run with its items and related RFQ/customer information
 * @param {string} pricingRunId - Pricing run UUID
 * @returns {Promise<Object>} Pricing run with items, RFQ, and customer info
 */
async function getPricingRunById(pricingRunId) {
  const db = await connectDb();

  // Get pricing run with RFQ and customer information
  const runResult = await db.query(
    `SELECT 
      pr.*,
      r.id as rfq_id,
      r.title as rfq_title,
      r.description as rfq_description,
      r.status as rfq_status,
      p.id as project_id,
      p.name as project_name,
      c.id as client_id,
      c.name as client_name,
      c.contact_email as client_contact_email,
      c.contact_phone as client_contact_phone
    FROM pricing_runs pr
    JOIN rfqs r ON pr.rfq_id = r.id
    JOIN projects p ON r.project_id = p.id
    JOIN clients c ON p.client_id = c.id
    WHERE pr.id = $1`,
    [pricingRunId]
  );

  if (runResult.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const pricingRun = runResult.rows[0];

  // Get pricing run items with RFQ item details
  const itemsResult = await db.query(
    `SELECT 
      pri.*,
      ri.description as rfq_item_description,
      ri.quantity as rfq_item_quantity,
      ri.unit as rfq_item_unit,
      ri.material_code as rfq_item_material_code
    FROM pricing_run_items pri
    JOIN rfq_items ri ON pri.rfq_item_id = ri.id
    WHERE pri.pricing_run_id = $1
    ORDER BY pri.created_at`,
    [pricingRunId]
  );

  pricingRun.items = itemsResult.rows;
  return pricingRun;
}

/**
 * Creates a pricing run for an RFQ
 * For each RFQ item, looks up material by material_code and uses base_cost from materials table.
 * Falls back to default values if material not found.
 * 
 * @param {string} rfqId - RFQ UUID
 * @returns {Promise<Object>} Created pricing run with items
 */
async function createPriceRunForRfq(rfqId) {
  const db = await connectDb();

  // Get RFQ with client_id
  const rfq = await getRfqById(rfqId);
  if (!rfq) {
    throw new Error('RFQ not found');
  }

  const clientId = rfq.client_id || null;

  // Get all RFQ items for this RFQ
  const rfqItemsResult = await db.query(
    `SELECT * FROM rfq_items WHERE rfq_id = $1 ORDER BY line_number, created_at`,
    [rfqId]
  );

  const rfqItems = rfqItemsResult.rows;

  if (rfqItems.length === 0) {
    throw new Error('RFQ has no items to price');
  }

  // Start transaction
  await db.query('BEGIN');

  try {
    // Create pricing run
    const pricingRunResult = await db.query(
      `INSERT INTO pricing_runs (rfq_id, status)
       VALUES ($1, 'draft')
       RETURNING *`,
      [rfqId]
    );

    const pricingRun = pricingRunResult.rows[0];
    const pricingRunItems = [];
    let totalPrice = 0;

    // Process each RFQ item
    for (const rfqItem of rfqItems) {
      let baseCost = 100; // Default fallback
      let originType = 'NON_CHINA'; // Default fallback
      let category = 'ANY'; // Default fallback
      let currency = 'USD'; // Default
      let materialId = null;
      let notes = null;

      // Try to find material by material_code
      if (rfqItem.material_code) {
        const material = await getMaterialByCode(rfqItem.material_code);
        if (material) {
          baseCost = parseFloat(material.base_cost);
          originType = material.origin_type;
          category = material.category;
          currency = material.currency;
          materialId = material.id;
        } else {
          notes = `Material code "${rfqItem.material_code}" not found in materials table. Using default base_cost.`;
        }
      } else {
        notes = 'No material_code specified. Using default base_cost.`;
      }

      // NEW: Check for price agreement FIRST (takes precedence over pricing rules)
      let pricingMethod = 'rule_based'; // Default
      let priceAgreementId = null;
      let agreementPrice = null;

      if (clientId && (materialId || category)) {
        const agreement = await findActiveAgreement({
          clientId,
          materialId,
          category,
          quantity: parseFloat(rfqItem.quantity),
          date: new Date().toISOString().split('T')[0],
        });

        if (agreement) {
          // Use agreement price instead of base cost
          baseCost = parseFloat(agreement.applicable_price);
          pricingMethod = 'agreement';
          priceAgreementId = agreement.id;
          agreementPrice = agreement.applicable_price;
          notes = notes ?
            `${notes} Price from agreement ${agreement.id}.` :
            `Price from price agreement ${agreement.id}.`;
        }
      }

      // Find best pricing rule (only applies if NOT using agreement price)
      const pricingRule = await findBestPricingRule({
        clientId: clientId,
        originType: originType,
        category: category,
      });

      // Use rule values or fallback to defaults
      let markupPct, logisticsPct, riskPct, ruleOriginType, ruleCategory, ruleLevel;

      if (pricingRule) {
        markupPct = pricingRule.markup_pct;
        logisticsPct = pricingRule.logistics_pct;
        riskPct = pricingRule.risk_pct;
        ruleOriginType = pricingRule.origin_type;
        ruleCategory = pricingRule.category;
        ruleLevel = pricingRule.rule_level;
      } else {
        // Fallback values (same as global NON_CHINA default)
        markupPct = 0.15;
        logisticsPct = 0.05;
        riskPct = 0.02;
        ruleOriginType = 'FALLBACK';
        ruleCategory = 'FALLBACK';
        ruleLevel = 'FALLBACK';
      }

      // Calculate pricing
      const markupAmount = baseCost * markupPct;
      const logisticsCost = baseCost * logisticsPct;
      const riskCost = baseCost * riskPct;
      const finalUnitPrice = baseCost + markupAmount + logisticsCost + riskCost;
      const totalItemPrice = finalUnitPrice * parseFloat(rfqItem.quantity);

      totalPrice += totalItemPrice;

      // Insert pricing run item
      const itemResult = await db.query(
        `INSERT INTO pricing_run_items (
          pricing_run_id, rfq_item_id,
          base_cost, markup_pct, logistics_cost,
          risk_pct, risk_cost,
          unit_price, total_price,
          currency, origin_type, material_id, notes,
          rule_origin_type, rule_category, rule_level,
          pricing_method, price_agreement_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *`,
        [
          pricingRun.id,
          rfqItem.id,
          baseCost,
          markupPct,
          logisticsCost,
          riskPct,
          riskCost,
          finalUnitPrice,
          totalItemPrice,
          currency,
          originType,
          materialId,
          notes,
          ruleOriginType,
          ruleCategory,
          ruleLevel,
          pricingMethod,
          priceAgreementId,
        ]
      );

      pricingRunItems.push(itemResult.rows[0]);
    }

    // Update pricing run with total price
    const updateResult = await db.query(
      `UPDATE pricing_runs SET total_price = $1, status = 'completed' WHERE id = $2 RETURNING *`,
      [totalPrice, pricingRun.id]
    );

    pricingRun.total_price = totalPrice;
    pricingRun.status = 'completed';
    pricingRun.items = pricingRunItems;

    await db.query('COMMIT');
    return pricingRun;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * Updates pricing run outcome (won/lost)
 * @param {string} pricingRunId - Pricing run UUID
 * @param {string} outcome - 'won' or 'lost'
 * @param {string} notes - Optional notes about the outcome
 * @returns {Promise<Object>} Updated pricing run
 */
async function updatePricingRunOutcome(pricingRunId, outcome, notes = null) {
  const db = await connectDb();

  // Validate outcome
  if (!['won', 'lost'].includes(outcome)) {
    throw new Error('Outcome must be "won" or "lost"');
  }

  // Check if pricing run exists
  const checkResult = await db.query(
    'SELECT id, approval_status FROM pricing_runs WHERE id = $1',
    [pricingRunId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  // Update the pricing run
  const result = await db.query(
    `UPDATE pricing_runs
     SET outcome = $1,
         won_lost_date = NOW(),
         won_lost_notes = $2
     WHERE id = $3
     RETURNING *`,
    [outcome, notes, pricingRunId]
  );

  return result.rows[0];
}

/**
 * Creates a revision of a pricing run
 * Creates a snapshot in pricing_run_versions before creating the new revision
 * @param {string} pricingRunId - Original pricing run UUID
 * @param {string} reason - Reason for revision
 * @param {string} createdBy - User creating the revision (optional)
 * @returns {Promise<Object>} New pricing run (revision)
 */
async function createPricingRunRevision(pricingRunId, reason, createdBy = null) {
  const db = await connectDb();

  await db.query('BEGIN');

  try {
    // Get original pricing run with all items
    const originalRun = await getPricingRunById(pricingRunId);

    if (!originalRun) {
      throw new Error('Original pricing run not found');
    }

    // Get current version number for this pricing run
    const versionResult = await db.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
       FROM pricing_run_versions
       WHERE pricing_run_id = $1`,
      [pricingRunId]
    );
    const nextVersion = versionResult.rows[0]?.next_version || 1;

    // Create snapshot in pricing_run_versions table
    const snapshotData = {
      pricing_run: {
        id: originalRun.id,
        rfq_id: originalRun.rfq_id,
        status: originalRun.status,
        total_price: originalRun.total_price,
        approval_status: originalRun.approval_status,
        created_at: originalRun.created_at,
        updated_at: originalRun.updated_at,
      },
      items: originalRun.items.map(item => ({
        id: item.id,
        rfq_item_id: item.rfq_item_id,
        base_cost: item.base_cost,
        markup_pct: item.markup_pct,
        logistics_cost: item.logistics_cost,
        risk_pct: item.risk_pct,
        risk_cost: item.risk_cost,
        unit_price: item.unit_price,
        total_price: item.total_price,
        currency: item.currency,
        origin_type: item.origin_type,
        material_id: item.material_id,
        notes: item.notes,
        rule_origin_type: item.rule_origin_type,
        rule_category: item.rule_category,
        rule_level: item.rule_level,
        pricing_method: item.pricing_method,
        price_agreement_id: item.price_agreement_id,
      })),
    };

    // Save snapshot to pricing_run_versions
    await db.query(
      `INSERT INTO pricing_run_versions (
        pricing_run_id,
        version_number,
        snapshot_data,
        revision_reason,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5)`,
      [
        pricingRunId,
        nextVersion,
        JSON.stringify(snapshotData),
        reason || 'Revision created',
        createdBy,
      ]
    );

    // Determine parent version ID (if this is a revision of a revision)
    // Check if original run has a parent_version_id, otherwise use the original run's ID
    const parentCheckResult = await db.query(
      'SELECT parent_version_id FROM pricing_runs WHERE id = $1',
      [pricingRunId]
    );
    const parentVersionId = parentCheckResult.rows[0]?.parent_version_id || pricingRunId;

    // Get next version number for the new pricing run
    const newVersionResult = await db.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
       FROM pricing_runs
       WHERE id = $1 OR parent_version_id = $1`,
      [parentVersionId]
    );
    const newVersionNumber = newVersionResult.rows[0]?.next_version || 1;

    // Create new pricing run (revision)
    const newRunResult = await db.query(
      `INSERT INTO pricing_runs (
        rfq_id,
        status,
        parent_version_id,
        version_number,
        approval_status
      )
      VALUES ($1, 'draft', $2, $3, 'draft')
      RETURNING *`,
      [originalRun.rfq_id, parentVersionId, newVersionNumber]
    );

    const newRun = newRunResult.rows[0];

    // Copy all items from original run
    const itemsCopyResult = await db.query(
      `INSERT INTO pricing_run_items (
        pricing_run_id, rfq_item_id,
        base_cost, markup_pct, logistics_cost,
        risk_pct, risk_cost,
        unit_price, total_price,
        currency, origin_type, material_id, notes,
        rule_origin_type, rule_category, rule_level,
        pricing_method, price_agreement_id
      )
      SELECT
        $1, rfq_item_id,
        base_cost, markup_pct, logistics_cost,
        risk_pct, risk_cost,
        unit_price, total_price,
        currency, origin_type, material_id, notes,
        rule_origin_type, rule_category, rule_level,
        pricing_method, price_agreement_id
      FROM pricing_run_items
      WHERE pricing_run_id = $2
      RETURNING *`,
      [newRun.id, pricingRunId]
    );

    // Update total price
    const totalPrice = itemsCopyResult.rows.reduce(
      (sum, item) => sum + parseFloat(item.total_price),
      0
    );

    await db.query(
      'UPDATE pricing_runs SET total_price = $1 WHERE id = $2',
      [totalPrice, newRun.id]
    );

    await db.query('COMMIT');

    // Return the new revision with items
    return getPricingRunById(newRun.id);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * Gets all versions (revisions) of a pricing run
 * @param {string} pricingRunId - Pricing run UUID (can be parent or child)
 * @returns {Promise<Array>} Array of pricing run versions
 */
async function getPricingRunVersions(pricingRunId) {
  const db = await connectDb();

  // First, determine if this is a parent or child
  const checkResult = await db.query(
    'SELECT id, parent_version_id FROM pricing_runs WHERE id = $1',
    [pricingRunId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Pricing run not found');
  }

  const run = checkResult.rows[0];
  const parentId = run.parent_version_id || run.id;

  // Get all versions (parent + all children)
  const result = await db.query(
    `SELECT pr.*,
            COUNT(pri.id) as item_count,
            r.title as rfq_title,
            c.name as client_name
     FROM pricing_runs pr
     LEFT JOIN pricing_run_items pri ON pr.id = pri.pricing_run_id
     LEFT JOIN rfqs r ON pr.rfq_id = r.id
     LEFT JOIN projects p ON r.project_id = p.id
     LEFT JOIN clients c ON p.client_id = c.id
     WHERE pr.id = $1 OR pr.parent_version_id = $1
     GROUP BY pr.id, r.title, c.name
     ORDER BY pr.version_number ASC, pr.created_at ASC`,
    [parentId]
  );

  return result.rows;
}

/**
 * Gets version snapshots from pricing_run_versions table
 * @param {string} pricingRunId - Pricing run UUID
 * @returns {Promise<Array>} Array of version snapshots
 */
async function getVersionSnapshots(pricingRunId) {
  const db = await connectDb();

  const result = await db.query(
    `SELECT * FROM pricing_run_versions
     WHERE pricing_run_id = $1
     ORDER BY version_number ASC`,
    [pricingRunId]
  );

  return result.rows.map(row => ({
    ...row,
    snapshot_data: typeof row.snapshot_data === 'string' 
      ? JSON.parse(row.snapshot_data) 
      : row.snapshot_data,
  }));
}

/**
 * Compares two versions of a pricing run
 * @param {string} pricingRunId - Pricing run UUID
 * @param {number} version1 - First version number
 * @param {number} version2 - Second version number (optional, defaults to current)
 * @returns {Promise<Object>} Comparison result
 */
async function compareVersions(pricingRunId, version1, version2 = null) {
  const db = await connectDb();

  // Get version snapshots
  const snapshots = await getVersionSnapshots(pricingRunId);

  if (snapshots.length === 0) {
    throw new Error('No version snapshots found for this pricing run');
  }

  // Find version 1
  const v1Snapshot = snapshots.find(s => s.version_number === version1);
  if (!v1Snapshot) {
    throw new Error(`Version ${version1} not found`);
  }

  let v2Snapshot;
  if (version2 === null) {
    // Compare with current pricing run
    const currentRun = await getPricingRunById(pricingRunId);
    v2Snapshot = {
      snapshot_data: {
        pricing_run: {
          id: currentRun.id,
          rfq_id: currentRun.rfq_id,
          status: currentRun.status,
          total_price: currentRun.total_price,
          approval_status: currentRun.approval_status,
        },
        items: currentRun.items,
      },
      version_number: 'current',
    };
  } else {
    v2Snapshot = snapshots.find(s => s.version_number === version2);
    if (!v2Snapshot) {
      throw new Error(`Version ${version2} not found`);
    }
  }

  const v1 = v1Snapshot.snapshot_data;
  const v2 = v2Snapshot.snapshot_data;

  // Compare pricing run totals
  const totalPriceDiff = parseFloat(v2.pricing_run.total_price) - parseFloat(v1.pricing_run.total_price);
  const totalPricePercentChange = v1.pricing_run.total_price > 0
    ? (totalPriceDiff / parseFloat(v1.pricing_run.total_price)) * 100
    : 0;

  // Compare items
  const itemComparisons = [];
  const v1ItemsMap = new Map(v1.items.map(item => [item.rfq_item_id, item]));
  const v2ItemsMap = new Map(v2.items.map(item => [item.rfq_item_id, item]));

  // Find all unique item IDs
  const allItemIds = new Set([...v1ItemsMap.keys(), ...v2ItemsMap.keys()]);

  for (const itemId of allItemIds) {
    const v1Item = v1ItemsMap.get(itemId);
    const v2Item = v2ItemsMap.get(itemId);

    if (!v1Item) {
      itemComparisons.push({
        rfq_item_id: itemId,
        status: 'added',
        v1: null,
        v2: v2Item,
        price_diff: parseFloat(v2Item.total_price),
      });
    } else if (!v2Item) {
      itemComparisons.push({
        rfq_item_id: itemId,
        status: 'removed',
        v1: v1Item,
        v2: null,
        price_diff: -parseFloat(v1Item.total_price),
      });
    } else {
      const priceDiff = parseFloat(v2Item.total_price) - parseFloat(v1Item.total_price);
      const unitPriceDiff = parseFloat(v2Item.unit_price) - parseFloat(v1Item.unit_price);
      const hasChanges = priceDiff !== 0 || 
                        v1Item.pricing_method !== v2Item.pricing_method ||
                        v1Item.price_agreement_id !== v2Item.price_agreement_id;

      if (hasChanges) {
        itemComparisons.push({
          rfq_item_id: itemId,
          status: 'modified',
          v1: v1Item,
          v2: v2Item,
          price_diff: priceDiff,
          unit_price_diff: unitPriceDiff,
          pricing_method_changed: v1Item.pricing_method !== v2Item.pricing_method,
          agreement_changed: v1Item.price_agreement_id !== v2Item.price_agreement_id,
        });
      }
    }
  }

  return {
    pricing_run_id: pricingRunId,
    version1: {
      number: version1,
      snapshot: v1Snapshot,
    },
    version2: {
      number: version2 === null ? 'current' : version2,
      snapshot: v2Snapshot,
    },
    summary: {
      total_price_diff: totalPriceDiff,
      total_price_percent_change: totalPricePercentChange,
      items_changed: itemComparisons.length,
      items_added: itemComparisons.filter(c => c.status === 'added').length,
      items_removed: itemComparisons.filter(c => c.status === 'removed').length,
      items_modified: itemComparisons.filter(c => c.status === 'modified').length,
    },
    item_changes: itemComparisons,
  };
}

module.exports = {
  getPricingRunsByRfqId,
  getPricingRunById,
  createPriceRunForRfq,
  updatePricingRunOutcome,
  createPricingRunRevision,
  getPricingRunVersions,
  getVersionSnapshots,
  compareVersions,
};

