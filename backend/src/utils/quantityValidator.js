/**
 * Quantity Validation Utility
 *
 * Validates and fixes quantity values that look like length measurements.
 * This catches cases where the AI extracted total_length_m as quantity.
 */

/**
 * Estimates piece count from weight data if available
 * For beams/tubulars: pieces = total_weight / (unit_weight * average_length)
 *
 * @param {Object} item - Item with potential weight data
 * @param {number} lengthInMeters - Length value that's currently in quantity field
 * @returns {number|null} - Estimated piece count or null if can't estimate
 */
function estimatePieceCountFromWeight(item, lengthInMeters) {
  const totalWeight = item.total_weight_kg || item.total_weight || item.totalWeight;
  const unitWeight = item.unit_weight_kg || item.unit_weight || item.unitWeight;

  // If we have total weight and unit weight (kg/m), we can estimate
  // pieces = total_weight / (unit_weight * length_per_piece)
  // For MTO: length is usually total length, so pieces = length / average_length_per_piece

  // Typical average lengths for structural steel:
  // - Beams: 12m standard lengths
  // - Tubulars: varies, but often 12m or 6m

  if (totalWeight && unitWeight && lengthInMeters > 0) {
    // pieces ≈ total_weight / (unit_weight * (length / estimated_pieces))
    // This requires iteration, so let's try a simpler approach
    const standardLength = 12; // meters (typical beam/pipe length)
    const estimatedPieces = Math.round(lengthInMeters / standardLength);

    if (estimatedPieces > 0 && estimatedPieces <= 500) {
      return estimatedPieces;
    }
  }

  return null;
}

/**
 * Extracts piece count from notes field if present
 * Looks for patterns like "36 pcs", "Qty: 36", "Pieces: 36"
 *
 * @param {string} notes - Notes field content
 * @returns {number|null} - Extracted piece count or null
 */
function extractPieceCountFromNotes(notes) {
  if (!notes) return null;

  // Patterns to match piece count in notes
  const patterns = [
    /(\d+)\s*(?:pcs|pieces|ea|each)/i,           // "36 pcs", "36 pieces"
    /(?:qty|quantity|pcs|pieces)[\s:]*(\d+)/i,   // "Qty: 36", "Quantity: 36"
    /round\s*qty[\s:]*(\d+)/i,                    // "Round Qty: 36"
    /(\d+)\s*(?:nos|units)/i                      // "36 nos", "36 units"
  ];

  for (const pattern of patterns) {
    const match = notes.match(pattern);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count > 0 && count <= 10000) {
        return count;
      }
    }
  }

  return null;
}

/**
 * Validates and fixes quantity values that look like length measurements
 *
 * @param {Array} items - Array of extracted items
 * @returns {Object} - { items: fixedItems, warnings: Array, fixedCount: number }
 */
function validateAndFixQuantities(items) {
  if (!Array.isArray(items)) {
    return { items: [], warnings: [], fixedCount: 0 };
  }

  const warnings = [];
  let fixedCount = 0;

  const fixedItems = items.map((item, idx) => {
    const qty = item.quantity;
    const totalLength = item.total_length_m || item.total_length_area || item.total_length;
    const unit = (item.unit || '').toUpperCase();

    // Skip if no quantity
    if (qty === null || qty === undefined) {
      return item;
    }

    // Heuristics to detect if quantity looks like a length value:
    // 1. Unit is "M" (meters) - definitely a length, not pieces
    // 2. Quantity is > 100 and has significant decimal places (e.g., 428.91)
    // 3. Quantity has decimals and unit suggests meters

    const isUnitMeters = unit === 'M' || unit === 'MTR' || unit === 'METER' || unit === 'METERS';
    const hasSignificantDecimals = qty !== Math.floor(qty) && (qty % 1) >= 0.01;
    const isLargeWithDecimals = qty > 100 && hasSignificantDecimals;
    const isVeryLarge = qty > 500;

    const quantityLooksLikeLength = (
      isUnitMeters ||
      isLargeWithDecimals ||
      (totalLength && qty > 50 && qty > totalLength * 5)
    );

    if (quantityLooksLikeLength) {
      const warning = {
        itemIndex: idx,
        lineNumber: item.line_number,
        description: (item.description || '').substring(0, 50),
        originalQuantity: qty,
        originalUnit: unit,
        reason: isUnitMeters ? 'unit_is_meters' :
                isLargeWithDecimals ? 'large_decimal_value' :
                isVeryLarge ? 'very_large_quantity' :
                'quantity_larger_than_length'
      };
      warnings.push(warning);

      // Strategy 1: If we have total_length and it looks like a piece count, swap them
      if (totalLength && totalLength > 0 && totalLength < 500 && totalLength === Math.floor(totalLength)) {
        console.log(`[Quantity Fix] Item ${item.line_number}: Swapping quantity=${qty} ↔ total_length=${totalLength}`);
        fixedCount++;
        return {
          ...item,
          quantity: totalLength,
          total_length_m: qty,
          unit: 'EA',
          _quantity_fixed: {
            original_quantity: qty,
            original_unit: unit,
            reason: warning.reason,
            method: 'swap_with_total_length'
          }
        };
      }

      // Strategy 2: Extract piece count from notes field
      const pcsFromNotes = extractPieceCountFromNotes(item.notes);
      if (pcsFromNotes !== null) {
        console.log(`[Quantity Fix] Item ${item.line_number}: Found quantity=${pcsFromNotes} in notes (was ${qty} m)`);
        fixedCount++;
        return {
          ...item,
          quantity: pcsFromNotes,
          total_length_m: qty,
          unit: 'EA',
          _quantity_fixed: {
            original_quantity: qty,
            original_unit: unit,
            reason: warning.reason,
            method: 'extracted_from_notes'
          }
        };
      }

      // Strategy 3: Estimate from weight data (less reliable)
      const estimatedPcs = estimatePieceCountFromWeight(item, qty);
      if (estimatedPcs !== null && estimatedPcs > 0 && estimatedPcs < qty) {
        console.log(`[Quantity Fix] Item ${item.line_number}: Estimated quantity=${estimatedPcs} from weight (was ${qty} m)`);
        fixedCount++;
        return {
          ...item,
          quantity: estimatedPcs,
          total_length_m: qty,
          unit: 'EA',
          _quantity_fixed: {
            original_quantity: qty,
            original_unit: unit,
            reason: warning.reason,
            method: 'estimated_from_weight',
            confidence: 'low'
          }
        };
      }

      // Can't auto-fix, just log warning
      console.warn(`[Quantity Warning] Item ${item.line_number}: quantity=${qty} looks like length (${warning.reason}), no fix available`);
    }

    return item;
  });

  if (warnings.length > 0) {
    console.log(`[Quantity Validation] Found ${warnings.length} suspicious quantities, auto-fixed ${fixedCount}`);
  }

  return { items: fixedItems, warnings, fixedCount };
}

module.exports = {
  validateAndFixQuantities,
  extractPieceCountFromNotes,
  estimatePieceCountFromWeight
};
