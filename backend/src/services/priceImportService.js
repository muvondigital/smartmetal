/**
 * Price Import Service
 * 
 * Handles bulk price imports from CSV files with:
 * - CSV parsing and validation
 * - Preview of changes before applying
 * - Price history tracking
 * - Audit trail logging
 * 
 * Part of Phase 2: Manufacturer Price Management System
 */

const { parse } = require('csv-parse/sync');
const { query, transaction } = require('../db/supabaseClient');

/**
 * Parse CSV file content and validate format
 * @param {Buffer} fileBuffer - CSV file buffer
 * @returns {Promise<Array>} Parsed and validated records
 */
async function parsePriceCSV(fileBuffer) {
  const csvContent = fileBuffer.toString('utf-8');
  
  // Parse CSV
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    cast: (value, context) => {
      // Handle numeric columns
      if (context.column === 'base_cost' || context.column === 'price') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? null : parsed;
      }
      return value;
    }
  });

  // Validate required columns
  const requiredColumns = ['material_code', 'base_cost'];
  const firstRecord = records[0];
  
  if (!firstRecord) {
    throw new Error('CSV file is empty or has no valid rows');
  }

  const missingColumns = requiredColumns.filter(col => !(col in firstRecord) && !(col.replace('_', '') in firstRecord));
  
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}. Required: ${requiredColumns.join(', ')}`);
  }

  return records;
}

/**
 * Preview price changes before applying
 * @param {Array} csvRecords - Parsed CSV records
 * @param {string} effectiveDate - Effective date for price changes (YYYY-MM-DD)
 * @param {string} source - Source of price update ('manufacturer_feed', 'manual_update', 'lme_adjustment')
 * @returns {Promise<Object>} Preview with changes summary
 */
async function previewPriceChanges(csvRecords, effectiveDate, source = 'manufacturer_feed') {
  const preview = {
    totalRecords: csvRecords.length,
    materialsFound: [],
    materialsNotFound: [],
    priceChanges: [],
    unchanged: [],
    errors: []
  };

  for (const record of csvRecords) {
    const materialCode = record.material_code?.trim();
    const newBaseCost = parseFloat(record.base_cost || record.price);

    if (!materialCode) {
      preview.errors.push({
        row: csvRecords.indexOf(record) + 1,
        error: 'Missing material_code'
      });
      continue;
    }

    if (!newBaseCost || isNaN(newBaseCost) || newBaseCost < 0) {
      preview.errors.push({
        row: csvRecords.indexOf(record) + 1,
        material_code: materialCode,
        error: 'Invalid base_cost (must be a positive number)'
      });
      continue;
    }

    try {
      // Find material in database
      const materialResult = await query(
        `SELECT id, material_code, base_cost, category, size_description 
         FROM materials 
         WHERE material_code = $1`,
        [materialCode]
      );

      if (materialResult.rows.length === 0) {
        preview.materialsNotFound.push({
          material_code: materialCode,
          base_cost: newBaseCost
        });
        continue;
      }

      const material = materialResult.rows[0];
      const currentCost = parseFloat(material.base_cost) || 0;
      // Use size_description or material_code as display name (materials table doesn't have 'name' column)
      const materialDisplayName = material.size_description || material.material_code;
      
      preview.materialsFound.push({
        material_id: material.id,
        material_code: materialCode,
        category: material.category,
        name: materialDisplayName
      });

      if (currentCost === newBaseCost) {
        preview.unchanged.push({
          material_code: materialCode,
          base_cost: newBaseCost
        });
      } else {
        const changePct = currentCost > 0 
          ? ((newBaseCost - currentCost) / currentCost * 100).toFixed(2)
          : null;

        preview.priceChanges.push({
          material_id: material.id,
          material_code: materialCode,
          category: material.category,
          name: materialDisplayName,
          current_base_cost: currentCost,
          new_base_cost: newBaseCost,
          change_amount: newBaseCost - currentCost,
          change_percentage: changePct ? parseFloat(changePct) : null,
          effective_date: effectiveDate || new Date().toISOString().split('T')[0],
          notes: record.notes || '',
          source: source
        });
      }
    } catch (error) {
      preview.errors.push({
        row: csvRecords.indexOf(record) + 1,
        material_code: materialCode,
        error: error.message
      });
    }
  }

  return preview;
}

/**
 * Apply price changes from preview
 * @param {Array} priceChanges - Array of price change objects from preview
 * @param {string} uploadedBy - User ID or name who uploaded the changes
 * @returns {Promise<Object>} Import results
 */
async function applyPriceChanges(priceChanges, uploadedBy = 'system') {
  const results = {
    updated: 0,
    historyEntries: 0,
    errors: []
  };

  if (!priceChanges || priceChanges.length === 0) {
    return results;
  }

  // Process each change in a transaction per material to ensure consistency
  for (const change of priceChanges) {
    try {
      await transaction(async (client) => {
        // Get previous price from history (if exists) or current materials table
        const prevPriceResult = await client.query(
          `SELECT base_cost as previous_price
           FROM material_price_history
           WHERE material_id = $1
           ORDER BY effective_date DESC, created_at DESC
           LIMIT 1`,
          [change.material_id]
        );

        let previousBaseCost = null;
        if (prevPriceResult.rows.length > 0) {
          previousBaseCost = parseFloat(prevPriceResult.rows[0].previous_price);
        } else {
          // Get current price from materials table
          const currentPriceResult = await client.query(
            'SELECT base_cost FROM materials WHERE id = $1',
            [change.material_id]
          );
          if (currentPriceResult.rows.length > 0) {
            previousBaseCost = parseFloat(currentPriceResult.rows[0].base_cost) || null;
          }
        }

        // Update materials.base_cost
        await client.query(
          `UPDATE materials 
           SET base_cost = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [change.new_base_cost, change.material_id]
        );

        // Insert into price history
        await client.query(
          `INSERT INTO material_price_history (
            material_id, base_cost, currency, effective_date,
            source, notes, uploaded_by, previous_base_cost, price_change_pct
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            change.material_id,
            change.new_base_cost,
            change.currency || 'USD',
            change.effective_date || new Date().toISOString().split('T')[0],
            change.source || 'manufacturer_feed',
            change.notes || '',
            uploadedBy,
            previousBaseCost,
            change.change_percentage
          ]
        );
      });

      results.updated++;
      results.historyEntries++;
    } catch (error) {
      results.errors.push({
        material_code: change.material_code,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Get price history for a material
 * @param {string} materialId - Material UUID
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} Price history records
 */
async function getPriceHistory(materialId, limit = 50) {
  try {
    const result = await query(
      `SELECT 
        id, base_cost, currency, effective_date, source, notes,
        uploaded_by, previous_base_cost, price_change_pct, created_at
       FROM material_price_history
       WHERE material_id = $1
       ORDER BY effective_date DESC, created_at DESC
       LIMIT $2`,
      [materialId, limit]
    );

    return result.rows;
  } catch (error) {
    // If table doesn't exist, return empty array instead of throwing
    if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('material_price_history')) {
      // Log warning only once per process to avoid log spam
      if (!getPriceHistory._hasLoggedWarning) {
        console.warn('[Price Import] material_price_history table does not exist. Run migration 016 to create it. Returning empty history.');
        getPriceHistory._hasLoggedWarning = true;
      }
      return [];
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Get recent price changes for dashboard notifications
 * @param {number} days - Number of days to look back
 * @param {number} limit - Maximum number of records
 * @returns {Promise<Array>} Recent price changes
 */
async function getRecentPriceChanges(days = 7, limit = 50) {
  try {
    // Validate days parameter to prevent SQL injection
    const safeDays = Math.max(1, Math.min(365, parseInt(days) || 7));
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit) || 50));
    
    // Calculate the cutoff date in JavaScript and pass as parameter
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - safeDays);
    
    // Use parameterized query with date parameter
    const result = await query(
      `SELECT 
        mph.id,
        mph.material_id,
        m.material_code,
        COALESCE(m.size_description, m.material_code) as material_name,
        m.category,
        mph.previous_base_cost,
        mph.base_cost as new_base_cost,
        mph.price_change_pct,
        mph.effective_date,
        mph.source,
        mph.uploaded_by,
        mph.created_at
       FROM material_price_history mph
       JOIN materials m ON mph.material_id = m.id
       WHERE mph.created_at >= $1
       ORDER BY mph.created_at DESC
       LIMIT $2`,
      [cutoffDate, safeLimit]
    );

    return result.rows;
  } catch (error) {
    // If table doesn't exist, return empty array instead of throwing
    if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('material_price_history')) {
      // Log warning only once per process to avoid log spam
      if (!getRecentPriceChanges._hasLoggedWarning) {
        console.warn('[Price Import] material_price_history table does not exist. Run migration 016 to create it. Returning empty results.');
        getRecentPriceChanges._hasLoggedWarning = true;
      }
      return [];
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Get price change statistics for dashboard
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>} Statistics summary
 */
async function getPriceChangeStats(days = 7) {
  try {
    const result = await query(
      `SELECT 
        COUNT(*) as total_changes,
        COUNT(DISTINCT material_id) as materials_affected,
        COUNT(*) FILTER (WHERE price_change_pct > 0) as price_increases,
        COUNT(*) FILTER (WHERE price_change_pct < 0) as price_decreases,
        COUNT(*) FILTER (WHERE price_change_pct = 0 OR price_change_pct IS NULL) as unchanged,
        AVG(price_change_pct) FILTER (WHERE price_change_pct IS NOT NULL) as avg_change_pct,
        MAX(price_change_pct) as max_increase_pct,
        MIN(price_change_pct) as max_decrease_pct
       FROM material_price_history
       WHERE created_at >= NOW() - INTERVAL '${days} days'`,
      []
    );

    return result.rows[0] || {
      total_changes: 0,
      materials_affected: 0,
      price_increases: 0,
      price_decreases: 0,
      unchanged: 0,
      avg_change_pct: null,
      max_increase_pct: null,
      max_decrease_pct: null
    };
  } catch (error) {
    // If table doesn't exist, return empty stats instead of throwing
    if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('material_price_history')) {
      // Log warning only once per process to avoid log spam
      if (!getPriceChangeStats._hasLoggedWarning) {
        console.warn('[Price Import] material_price_history table does not exist. Run migration 016 to create it. Returning empty stats.');
        getPriceChangeStats._hasLoggedWarning = true;
      }
      return {
        total_changes: 0,
        materials_affected: 0,
        price_increases: 0,
        price_decreases: 0,
        unchanged: 0,
        avg_change_pct: null,
        max_increase_pct: null,
        max_decrease_pct: null
      };
    }
    // Re-throw other errors
    throw error;
  }
}

module.exports = {
  parsePriceCSV,
  previewPriceChanges,
  applyPriceChanges,
  getPriceHistory,
  getRecentPriceChanges,
  getPriceChangeStats
};

