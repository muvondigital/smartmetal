/**
 * Table Scoring Utility for RFQ Line-Item Detection
 *
 * This module provides pure scoring functions to rank candidate tables
 * based on their likelihood of containing line items (BOQ/MTO tables).
 *
 * Non-Goals:
 * - No fuzzy matching or ML inference
 * - No external dependencies beyond Node.js built-ins
 * - No state or side effects
 */

// Scoring constants (tuneable)
const SCORING_CONFIG = {
  // Positive header tokens (add points if present)
  ITEM_GROUP_SCORE: 40,           // item, no, #, number, line
  DESCRIPTION_GROUP_SCORE: 30,    // desc, description, item description
  QUANTITY_GROUP_SCORE: 30,       // qty, quantity, round quantity
  UNIT_GROUP_SCORE: 15,           // unit, uom
  WEIGHT_GROUP_SCORE: 10,         // weight, total weight
  DIMENSION_GROUP_SCORE: 8,       // length, width, thickness, size, dia, od, id
  MATERIAL_GROUP_SCORE: 8,        // material, grade, spec
  TOTAL_GROUP_SCORE: 5,           // total, amount
  SHIPMENT_GROUP_SCORE: 5,        // shipment, batch, delivery

  // Negative header tokens (subtract points if present)
  REVISION_PENALTY: -35,          // rev, revision, date, approved, prepared, checked
  INSPECTION_PENALTY: -25,        // witness, hold, inspect, inspection, test, report, qc, qa
  VDRL_PENALTY: -25,              // vendor, vdrl, data requirement, document list
  REMARKS_PENALTY: -10,           // remarks, comment

  // Structure heuristics
  MIN_HEADERS_PENALTY: -20,       // If headers.length < 3
  MULTI_GROUP_BONUS: 15,          // If at least 2 positive groups present
  SPARSE_ROWS_PENALTY: -20,       // If most rows are empty or 1 cell wide
  NUMERIC_ITEM_BONUS: 10,         // If numeric column exists with item-like header

  // Line-item override bonus (applied when table has strong line-item signals despite Rev column)
  // This allows tables like ["Item","Detail","Pipe Spec","Qty","Size1","Size2","Notes","Rev"]
  // to score above threshold even with Rev present
  LINE_ITEM_OVERRIDE_BONUS: 50,   // Strong line-item table override for revision penalty

  // Thresholds
  MIN_HEADERS: 3,
  MIN_SCORE_THRESHOLD: 45,        // Minimum score to be considered valid
};

/**
 * Normalize a header token for matching
 * @param {string} s - Header string
 * @returns {string} Normalized token (lowercase, trimmed, no punctuation, collapsed spaces)
 */
function normalizeHeaderToken(s) {
  if (!s || typeof s !== 'string') return '';

  return s
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?'"()\[\]{}]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')                // Collapse multiple spaces
    .trim();
}

/**
 * Check if a normalized header matches any token in a list
 * @param {string} normalized - Normalized header
 * @param {string[]} tokens - List of tokens to match
 * @returns {boolean}
 */
function matchesAnyToken(normalized, tokens) {
  for (const token of tokens) {
    if (normalized === token || normalized.includes(token)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if headers contain at least one token from a group
 * @param {string[]} normalizedHeaders - Array of normalized headers
 * @param {string[]} groupTokens - Tokens for this group
 * @returns {boolean}
 */
function hasGroupMatch(normalizedHeaders, groupTokens) {
  return normalizedHeaders.some(h => matchesAnyToken(h, groupTokens));
}

/**
 * Check if a header row looks like a data row (not a header)
 * @param {string[]} headers - Array of header strings
 * @returns {boolean} True if this looks like a data row, not a header
 */
function looksLikeDataRow(headers) {
  if (!headers || headers.length === 0) return true;

  const nonEmptyCells = headers.filter(h => h && h.trim()).length;
  if (nonEmptyCells === 0) return true;

  // Date-like patterns (dd mmm yy, yyyy-mm-dd, dd/mm/yyyy)
  const datePattern = /^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{2,4}$|^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/i;

  let dateCount = 0;
  let numericOnlyCount = 0;
  let personNameLikeCount = 0;

  for (const cell of headers) {
    const trimmed = (cell || '').trim();
    if (!trimmed) continue;

    const normalized = trimmed.toLowerCase();

    // Check for date patterns
    if (datePattern.test(normalized)) {
      dateCount++;
      continue;
    }

    // Check for numeric-only cells (except single digits which could be item numbers in headers)
    if (/^\d+$/.test(trimmed) && trimmed.length > 1) {
      numericOnlyCount++;
      continue;
    }

    // Check for person name patterns (multiple words with capitals, unicode letters)
    if (/^[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+(\s+[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+)+$/.test(trimmed)) {
      personNameLikeCount++;
    }
  }

  // If more than 30% of non-empty cells are dates, likely a data row
  if (dateCount > nonEmptyCells * 0.3) {
    return true;
  }

  // If more than 50% of non-empty cells are multi-digit numbers, likely a data row
  if (numericOnlyCount > nonEmptyCells * 0.5) {
    return true;
  }

  // If we have person names and dates/numbers together, likely revision table data
  if (personNameLikeCount > 0 && (dateCount > 0 || numericOnlyCount > 0)) {
    return true;
  }

  return false;
}

/**
 * Score a single table candidate
 * @param {string[]} headers - Array of header strings
 * @param {string[][]} sampleRows - Array of sample data rows (optional, for structure heuristics)
 * @returns {{ score: number, reasons: string[], signals: object }}
 */
function scoreTableCandidate(headers, sampleRows = []) {
  const reasons = [];
  const signals = {};
  let score = 0;

  // Check if headers look like a data row (not actual headers)
  if (looksLikeDataRow(headers)) {
    reasons.push('data_row_detected (rejecting, not a header row)');
    signals.is_data_row = true;
    return {
      score: -100, // Strong rejection
      reasons,
      signals
    };
  }

  signals.is_data_row = false;

  // Normalize all headers
  const normalizedHeaders = headers.map(h => normalizeHeaderToken(h));

  // Check minimum headers
  if (headers.length < SCORING_CONFIG.MIN_HEADERS) {
    score += SCORING_CONFIG.MIN_HEADERS_PENALTY;
    reasons.push(`min_headers_penalty (${headers.length} < ${SCORING_CONFIG.MIN_HEADERS})`);
    signals.min_headers = false;
  } else {
    signals.min_headers = true;
  }

  // Positive groups
  const itemTokens = ['item', 'no', '#', 'number', 'line', 'line no', 'line number'];
  const descTokens = ['desc', 'description', 'descriptions', 'item description', 'detail', 'specification of goods'];
  const qtyTokens = ['qty', 'quantity', 'qty unit', 'round quantity', 'quant'];
  const unitTokens = ['unit', 'uom', 'unit of measure'];
  const weightTokens = ['weight', 'total weight'];
  const dimensionTokens = ['length', 'width', 'thickness', 'size', 'dia', 'od', 'id'];
  const materialTokens = ['material', 'grade', 'spec'];
  const totalTokens = ['total', 'amount'];
  const shipmentTokens = ['shipment', 'batch', 'delivery'];

  signals.has_item_group = hasGroupMatch(normalizedHeaders, itemTokens);
  signals.has_description_group = hasGroupMatch(normalizedHeaders, descTokens);
  signals.has_quantity_group = hasGroupMatch(normalizedHeaders, qtyTokens);
  signals.has_unit_group = hasGroupMatch(normalizedHeaders, unitTokens);
  signals.has_weight_group = hasGroupMatch(normalizedHeaders, weightTokens);
  signals.has_dimension_group = hasGroupMatch(normalizedHeaders, dimensionTokens);
  signals.has_material_group = hasGroupMatch(normalizedHeaders, materialTokens);
  signals.has_total_group = hasGroupMatch(normalizedHeaders, totalTokens);
  signals.has_shipment_group = hasGroupMatch(normalizedHeaders, shipmentTokens);

  // Additional validation for item_group: ensure the matching cell is not numeric-only or date-like
  if (signals.has_item_group) {
    const itemHeaderIndex = normalizedHeaders.findIndex(h => matchesAnyToken(h, itemTokens));
    if (itemHeaderIndex >= 0) {
      const itemHeaderCell = headers[itemHeaderIndex] || '';
      const trimmed = itemHeaderCell.trim();
      const isNumericOnly = /^\d+$/.test(trimmed);
      const isDateLike = /^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{2,4}$|^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/i.test(trimmed.toLowerCase());

      if (isNumericOnly || isDateLike) {
        // False positive: cell matches item keyword but is actually data
        signals.has_item_group = false;
        reasons.push('item_group_rejected (cell is numeric or date-like)');
      } else {
        score += SCORING_CONFIG.ITEM_GROUP_SCORE;
        reasons.push(`item_group (+${SCORING_CONFIG.ITEM_GROUP_SCORE})`);
      }
    } else {
      score += SCORING_CONFIG.ITEM_GROUP_SCORE;
      reasons.push(`item_group (+${SCORING_CONFIG.ITEM_GROUP_SCORE})`);
    }
  }
  if (signals.has_description_group) {
    score += SCORING_CONFIG.DESCRIPTION_GROUP_SCORE;
    reasons.push(`description_group (+${SCORING_CONFIG.DESCRIPTION_GROUP_SCORE})`);
  }
  if (signals.has_quantity_group) {
    score += SCORING_CONFIG.QUANTITY_GROUP_SCORE;
    reasons.push(`quantity_group (+${SCORING_CONFIG.QUANTITY_GROUP_SCORE})`);
  }
  if (signals.has_unit_group) {
    score += SCORING_CONFIG.UNIT_GROUP_SCORE;
    reasons.push(`unit_group (+${SCORING_CONFIG.UNIT_GROUP_SCORE})`);
  }
  if (signals.has_weight_group) {
    score += SCORING_CONFIG.WEIGHT_GROUP_SCORE;
    reasons.push(`weight_group (+${SCORING_CONFIG.WEIGHT_GROUP_SCORE})`);
  }
  if (signals.has_dimension_group) {
    score += SCORING_CONFIG.DIMENSION_GROUP_SCORE;
    reasons.push(`dimension_group (+${SCORING_CONFIG.DIMENSION_GROUP_SCORE})`);
  }
  if (signals.has_material_group) {
    score += SCORING_CONFIG.MATERIAL_GROUP_SCORE;
    reasons.push(`material_group (+${SCORING_CONFIG.MATERIAL_GROUP_SCORE})`);
  }
  if (signals.has_total_group) {
    score += SCORING_CONFIG.TOTAL_GROUP_SCORE;
    reasons.push(`total_group (+${SCORING_CONFIG.TOTAL_GROUP_SCORE})`);
  }
  if (signals.has_shipment_group) {
    score += SCORING_CONFIG.SHIPMENT_GROUP_SCORE;
    reasons.push(`shipment_group (+${SCORING_CONFIG.SHIPMENT_GROUP_SCORE})`);
  }

  // Negative groups
  const revisionTokens = ['rev', 'revision', 'date', 'approved', 'prepared', 'checked', 'verified', 'sign', 'signature', 'approved by'];
  const inspectionTokens = ['witness', 'hold', 'inspect', 'inspection', 'test', 'report', 'qc', 'qa'];
  const vdrlTokens = [
    'vendor', 
    'vdrl', 
    'data requirement', 
    'document list',
    'document no',        // Common VDRL header: "Document No."
    'document number',    // Alternative: "Document Number"
    'document title',     // Common VDRL header: "Document Title"
    'document code',      // Sometimes: "Document Code"
  ];
  const remarksTokens = ['remarks', 'comment'];

  signals.has_revision_group = hasGroupMatch(normalizedHeaders, revisionTokens);
  signals.has_inspection_group = hasGroupMatch(normalizedHeaders, inspectionTokens);
  signals.has_vdrl_group = hasGroupMatch(normalizedHeaders, vdrlTokens);
  signals.has_remarks_group = hasGroupMatch(normalizedHeaders, remarksTokens);

  // HARD REJECTION: VDRL tables should NEVER be processed as line-item tables
  // NSC does not quote VDRL tables - they are administrative documents
  if (signals.has_vdrl_group) {
    reasons.push(`vdrl_hard_reject (VDRL tables are administrative documents, not line items)`);
    signals.is_vdrl_table = true;
    return {
      score: -100, // Hard rejection - below any threshold
      reasons,
      signals
    };
  }

  if (signals.has_revision_group) {
    score += SCORING_CONFIG.REVISION_PENALTY;
    reasons.push(`revision_penalty (${SCORING_CONFIG.REVISION_PENALTY})`);
  }
  if (signals.has_inspection_group) {
    score += SCORING_CONFIG.INSPECTION_PENALTY;
    reasons.push(`inspection_penalty (${SCORING_CONFIG.INSPECTION_PENALTY})`);
  }
  if (signals.has_remarks_group) {
    score += SCORING_CONFIG.REMARKS_PENALTY;
    reasons.push(`remarks_penalty (${SCORING_CONFIG.REMARKS_PENALTY})`);
  }

  // Multi-group bonus: at least 2 positive groups among {item, desc, qty, unit}
  const coreGroups = [
    signals.has_item_group,
    signals.has_description_group,
    signals.has_quantity_group,
    signals.has_unit_group
  ];
  const coreGroupCount = coreGroups.filter(Boolean).length;
  signals.core_group_count = coreGroupCount;

  if (coreGroupCount >= 2) {
    score += SCORING_CONFIG.MULTI_GROUP_BONUS;
    reasons.push(`multi_group_bonus (+${SCORING_CONFIG.MULTI_GROUP_BONUS}, ${coreGroupCount} core groups)`);
  }

  // Structure heuristics (if sample rows provided)
  if (sampleRows && sampleRows.length > 0) {
    // Check for sparse rows (most cells empty or only 1 cell wide)
    const sparseCount = sampleRows.filter(row => {
      const nonEmptyCells = row.filter(cell => cell && cell.trim()).length;
      return nonEmptyCells <= 1;
    }).length;

    signals.sparse_row_ratio = sparseCount / sampleRows.length;

    if (sparseCount > sampleRows.length * 0.5) {
      score += SCORING_CONFIG.SPARSE_ROWS_PENALTY;
      reasons.push(`sparse_rows_penalty (${SCORING_CONFIG.SPARSE_ROWS_PENALTY})`);
    }

    // Check for numeric item column (if item header exists)
    if (signals.has_item_group) {
      const itemHeaderIndex = normalizedHeaders.findIndex(h => matchesAnyToken(h, itemTokens));
      if (itemHeaderIndex >= 0) {
        const hasNumericItems = sampleRows.some(row => {
          const cell = row[itemHeaderIndex];
          const num = parseInt(cell, 10);
          return !isNaN(num) && num > 0;
        });

        if (hasNumericItems) {
          score += SCORING_CONFIG.NUMERIC_ITEM_BONUS;
          reasons.push(`numeric_item_bonus (+${SCORING_CONFIG.NUMERIC_ITEM_BONUS})`);
          signals.has_numeric_items = true;
        } else {
          signals.has_numeric_items = false;
        }
      }
    }
  }

  // LINE-ITEM OVERRIDE: Apply bonus if this table has strong line-item signals
  // despite having revision-related headers
  // This prevents false negatives for tables like ["Item","Detail","Pipe Spec","Qty","Size1","Size2","Notes","Rev"]
  // Key criteria:
  // 1. Has Item + Quantity (core line-item signals)
  // 2. Has at least one of: Description, Spec, or Dimension
  // 3. Has revision penalty applied (meaning we detected rev-like headers)
  const hasStrongLineItemSignals = (
    signals.has_item_group &&
    signals.has_quantity_group &&
    (signals.has_description_group || signals.has_material_group || signals.has_dimension_group) &&
    signals.has_revision_group
  );

  if (hasStrongLineItemSignals) {
    score += SCORING_CONFIG.LINE_ITEM_OVERRIDE_BONUS;
    reasons.push(`line_item_override_bonus (+${SCORING_CONFIG.LINE_ITEM_OVERRIDE_BONUS}, strong line-item signals override revision penalty)`);
    signals.line_item_override_applied = true;
  } else {
    signals.line_item_override_applied = false;
  }

  return {
    score,
    reasons,
    signals
  };
}

/**
 * Pick the best table from a list of candidates using scoring
 * @param {Array<{ headers: string[], rows: string[][], tableIndex: number, page?: number }>} tables - Array of table candidates
 * @returns {{ best: object | null, ranked: Array<{ tableIndex: number, score: number, reasons: string[], signals: object }> }}
 */
function pickBestTable(tables) {
  if (!tables || tables.length === 0) {
    return { best: null, ranked: [] };
  }

  const ranked = [];

  // Score all tables
  for (const table of tables) {
    const headers = table.headers || [];
    const sampleRows = (table.rows || []).slice(0, 5); // Sample first 5 rows

    const result = scoreTableCandidate(headers, sampleRows);

    ranked.push({
      tableIndex: table.tableIndex,
      page: table.page,
      score: result.score,
      reasons: result.reasons,
      signals: result.signals,
      headerPreview: headers.slice(0, 10), // First 10 headers for debugging
      table: table // Keep reference to original table
    });
  }

  // Sort by score descending, then by item group presence, then by table index (lower = earlier in doc)
  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Tie-break: prefer table with item group
    if (a.signals.has_item_group !== b.signals.has_item_group) {
      return b.signals.has_item_group ? 1 : -1;
    }
    // Tie-break: prefer earlier table
    return a.tableIndex - b.tableIndex;
  });

  // Pick best table if score >= threshold
  const best = ranked.length > 0 && ranked[0].score >= SCORING_CONFIG.MIN_SCORE_THRESHOLD
    ? ranked[0].table
    : null;

  return {
    best,
    ranked
  };
}

module.exports = {
  normalizeHeaderToken,
  looksLikeDataRow,
  scoreTableCandidate,
  pickBestTable,
  SCORING_CONFIG, // Export for testing
  matchesAnyToken // Export for filtering in prompt builder
};
