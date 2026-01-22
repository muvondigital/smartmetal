const { initializeClient, callGPT4JSON } = require('./gcp/genaiClient');
const { scoreTableCandidate, pickBestTable } = require('./rfqExtraction/tableScoring');

/**
 * Sanitizes JSON text by removing comments and other non-JSON formatting
 * LAYER 2 DEFENSE: Removes JS-style comments, trailing commas, fixes unquoted values
 * MTO-AWARE: Handles various line numbering patterns from Material Take-Off documents
 * @param {string} jsonText - Text containing JSON (may have comments)
 * @returns {string} Sanitized JSON text
 */
function sanitizeJsonText(jsonText) {
  if (!jsonText) return jsonText;

  let sanitized = jsonText;

  // Remove single-line comments (// ...) but preserve URLs (http://, https://)
  // Match // that is NOT preceded by : (to avoid breaking URLs like http://)
  sanitized = sanitized.replace(/([^:])\/\/[^\n\r]*/g, '$1');

  // Remove multi-line comments (/* ... */)
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove trailing commas before closing braces/brackets (common JSON error)
  sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1');

  // ========================================================================
  // MTO-AWARE JSON REPAIR: Handle unquoted alphanumeric values
  // ========================================================================
  // Common in Material Take-Off (MTO) documents where line numbers include:
  // - Revision letters: 5005A, 5005B, 1001-REV-A
  // - Sub-items: 1.1, 1.2.3, P-100A
  // - Special codes: WP-01, DHN-123, NSC-456
  // - Mixed formats: 100A-1, P1-A, etc.

  // Pattern 1: Fix unquoted alphanumeric line_number values
  // Matches: "line_number": 5005A, -> "line_number": "5005A",
  // Also handles: 100A, P-100, WP-01A, 1.2.3, etc.
  sanitized = sanitized.replace(
    /("line_number"\s*:\s*)([0-9]+\.[0-9]+(?:\.[0-9]+)*|[0-9A-Za-z][\w\-\.]*[A-Za-z]+[\w\-\.]*|[A-Za-z]+[\w\-\.]*[0-9]+[\w\-\.]*)/g,
    '$1"$2"'
  );

  // Pattern 2: Fix unquoted item_number values (alternative field name)
  sanitized = sanitized.replace(
    /("item_number"\s*:\s*)([0-9]+\.[0-9]+(?:\.[0-9]+)*|[0-9A-Za-z][\w\-\.]*[A-Za-z]+[\w\-\.]*|[A-Za-z]+[\w\-\.]*[0-9]+[\w\-\.]*)/g,
    '$1"$2"'
  );

  // Pattern 3: Fix unquoted item_no values (another alternative field name)
  sanitized = sanitized.replace(
    /("item_no"\s*:\s*)([0-9]+\.[0-9]+(?:\.[0-9]+)*|[0-9A-Za-z][\w\-\.]*[A-Za-z]+[\w\-\.]*|[A-Za-z]+[\w\-\.]*[0-9]+[\w\-\.]*)/g,
    '$1"$2"'
  );

  // Pattern 4: Fix unquoted revision values
  // Handles: "revision": A, B, REV-1, etc.
  sanitized = sanitized.replace(
    /("revision"\s*:\s*)([A-Za-z][\w\-]*)/g,
    '$1"$2"'
  );

  // Pattern 5: Fix unquoted spec values that look like alphanumeric codes
  // Handles: "spec": ASTM-A106, API-5L, etc.
  sanitized = sanitized.replace(
    /("spec"\s*:\s*)([A-Z]+[\w\-]+[0-9]+[\w\-]*)/g,
    '$1"$2"'
  );

  // Pattern 6: Generic catch-all for common unquoted alphanumeric patterns
  // This catches any field that has an alphanumeric value that should be quoted
  // Examples: "tag": P-100A, "drawing": DWG-123, etc.
  // Regex explanation:
  // - Looks for: "field": value,
  // - Where value starts with letter or number and contains both letters and numbers
  // - And is followed by comma or closing brace/bracket (with optional whitespace)
  sanitized = sanitized.replace(
    /("[a-z_]+"\s*:\s*)([0-9]+[A-Za-z][\w\-\.]*|[A-Za-z]+[0-9][\w\-\.]*)(\s*[,\}\]])/g,
    '$1"$2"$3'
  );

  return sanitized.trim();
}

/**
 * Extracts JSON from a string that may contain markdown code blocks or other text
 * LAYER 2 DEFENSE: Sanitizes comments and formatting issues before parsing
 * @param {string} text - Text that may contain JSON
 * @returns {Object|null} Parsed JSON object or null
 */
function extractJsonFromText(text) {
  if (!text) return null;

  const trimmed = text.trim();

  // Step 1: Try to parse as-is first
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    // Step 2: Sanitize (remove comments, trailing commas) and try again
    console.log('[JSON Extract] Initial parse failed, attempting sanitization...');
    try {
      const sanitized = sanitizeJsonText(trimmed);
      const parsed = JSON.parse(sanitized);
      console.log('[JSON Extract] ✓ Sanitization succeeded (removed comments/formatting)');
      return parsed;
    } catch (e2) {
      console.log('[JSON Extract] Sanitization failed, trying code block extraction...');
    }

    // Step 3: If that fails, try to extract JSON from markdown code blocks
    // Handle both ```json and ``` code blocks
    const codeBlockStart = trimmed.indexOf('```');
    if (codeBlockStart !== -1) {
      // Find the end of the code block (look for closing ```)
      let codeBlockEnd = trimmed.indexOf('```', codeBlockStart + 3);
      
      // If no closing ``` found, the JSON might extend to the end
      if (codeBlockEnd === -1) {
        codeBlockEnd = trimmed.length;
      }
      
      // Extract content between code block markers
      let jsonContent = trimmed.substring(codeBlockStart + 3, codeBlockEnd).trim();
      
      // Remove "json" tag if present (case-insensitive, with optional whitespace)
      jsonContent = jsonContent.replace(/^json\s*/i, '').trim();
      
      // Find the first { and matching }
      const firstBrace = jsonContent.indexOf('{');
      if (firstBrace !== -1) {
        let braceCount = 0;
        let lastBrace = -1;
        let inString = false;
        let escapeNext = false;
        
        // Track string state to avoid counting braces inside strings
        for (let i = firstBrace; i < jsonContent.length; i++) {
          const char = jsonContent[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                lastBrace = i;
                break;
              }
            }
          }
        }
        
        if (lastBrace !== -1) {
          const extractedJson = jsonContent.substring(firstBrace, lastBrace + 1).trim();
          try {
            const parsed = JSON.parse(extractedJson);
            console.log('[JSON Extract] Successfully extracted JSON from code block');
            return parsed;
          } catch (e2) {
            console.log('[JSON Extract] Code block extraction failed, trying sanitization on extracted block...');
            try {
              const sanitized = sanitizeJsonText(extractedJson);
              const parsed = JSON.parse(sanitized);
              console.log('[JSON Extract] ✓ Code block + sanitization succeeded');
              return parsed;
            } catch (e3) {
              console.error('[JSON Extract] Failed to parse extracted JSON from code block even after sanitization:', e3.message);
              console.error('[JSON Extract] Extracted JSON length:', extractedJson.length);
              console.error('[JSON Extract] First 200 chars:', extractedJson.substring(0, 200));
              console.error('[JSON Extract] Last 200 chars:', extractedJson.substring(Math.max(0, extractedJson.length - 200)));
            }
          }
        } else {
          console.warn('[JSON Extract] Could not find matching closing brace in code block');
        }
      }
    }

    // Fallback: Try to find JSON object boundaries in the entire text (more robust - find matching braces)
    const firstBrace = trimmed.indexOf('{');
    if (firstBrace !== -1) {
      let braceCount = 0;
      let lastBrace = -1;
      let inString = false;
      let escapeNext = false;
      
      // Track string state to avoid counting braces inside strings
      for (let i = firstBrace; i < trimmed.length; i++) {
        const char = trimmed[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              lastBrace = i;
              break;
            }
          }
        }
      }
      
      if (lastBrace !== -1 && lastBrace > firstBrace) {
        const extractedJson = trimmed.substring(firstBrace, lastBrace + 1);
        try {
          const parsed = JSON.parse(extractedJson);
          console.log('[JSON Extract] Successfully extracted JSON using brace matching');
          return parsed;
        } catch (e3) {
          console.error('[JSON Extract] Failed to parse JSON using brace matching:', e3.message);
        }
      }
    }

    // Last resort: Try to repair common JSON issues
    console.log('[JSON Extract] Attempting JSON repair...');
    try {
      // Try to fix common issues:
      // 1. Remove trailing commas before closing braces/brackets
      // 2. Close unclosed strings
      // 3. Remove control characters
      let repaired = trimmed;
      
      // Remove trailing commas before } or ]
      repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
      
      // Try to find and extract the main JSON object
      const firstBrace = repaired.indexOf('{');
      if (firstBrace !== -1) {
        // Try to find the last complete closing brace
        let braceCount = 0;
        let lastBrace = -1;
        let inString = false;
        let escapeNext = false;
        
        for (let i = firstBrace; i < repaired.length; i++) {
          const char = repaired[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                lastBrace = i;
                break;
              }
            }
          }
        }
        
        if (lastBrace !== -1) {
          let extractedJson = repaired.substring(firstBrace, lastBrace + 1);
          
          // Additional repairs
          // Remove any non-printable characters except newlines and tabs
          extractedJson = extractedJson.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
          
          // Try parsing the repaired JSON
          try {
            const parsed = JSON.parse(extractedJson);
            console.log('[JSON Extract] ✓ JSON repair succeeded!');
            return parsed;
          } catch (repairError) {
            console.error('[JSON Extract] JSON repair failed:', repairError.message);
            console.error('[JSON Extract] Repaired JSON length:', extractedJson.length);
            console.error('[JSON Extract] First 300 chars of repaired:', extractedJson.substring(0, 300));
            console.error('[JSON Extract] Last 300 chars of repaired:', extractedJson.substring(Math.max(0, extractedJson.length - 300)));
          }
        }
      }
    } catch (repairError) {
      console.error('[JSON Extract] Error during JSON repair attempt:', repairError.message);
    }

    // Last resort: log what we have for debugging
    console.error('[JSON Extract] All extraction methods failed');
    console.error('[JSON Extract] Text length:', trimmed.length);
    console.error('[JSON Extract] First 500 chars:', trimmed.substring(0, 500));
    console.error('[JSON Extract] Last 500 chars:', trimmed.substring(Math.max(0, trimmed.length - 500)));

    return null;
  }
}

/**
 * Normalizes a column header for matching: lowercase, trim, collapse whitespace, remove trailing punctuation, optionally remove parentheses content
 * @param {string} header - Column header text
 * @param {boolean} removeParentheses - Whether to remove content in parentheses for matching
 * @returns {string} Normalized header
 */
function normalizeHeader(header, removeParentheses = true) {
  if (!header) return '';
  let normalized = header.trim().toLowerCase();
  // Replace consecutive whitespace with single space
  normalized = normalized.replace(/\s+/g, ' ');
  // Remove trailing punctuation (but keep internal punctuation like "SCH40")
  normalized = normalized.replace(/[.,;:!?]+$/, '');
  // Optionally remove parentheses content for matching (e.g., "Round Quantity (pcs)" -> "round quantity")
  if (removeParentheses) {
    normalized = normalized.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    // Clean up any double spaces created
    normalized = normalized.replace(/\s+/g, ' ');
  }
  return normalized;
}

/**
 * Detects if a column header matches common item number patterns
 * @param {string} header - Column header text
 * @returns {boolean}
 */
function isItemNumberColumn(header) {
  if (!header) return false;
  const normalized = normalizeHeader(header);
  return /^(item|no|#|number|line|line\s*no|line\s*number|item\s*no|item\s*number|pr\s*line|pr\s*no)$/.test(normalized);
}

/**
 * Detects if a column header matches common group/section patterns (for MTOs)
 * @param {string} header - Column header text
 * @returns {boolean}
 */
function isGroupColumn(header) {
  if (!header) return false;
  const normalized = normalizeHeader(header);
  return /^(group|section|portion|area|zone|tag|facility)$/.test(normalized);
}

/**
 * Detects if a column header matches common description patterns
 * MTO-AWARE: Recognizes combined headers like "Description Materials"
 * @param {string} header - Column header text
 * @returns {boolean}
 */
function isDescriptionColumn(header) {
  if (!header) return false;
  const normalized = normalizeHeader(header);
  // Match: description, descriptions, item description, material description, desc, detail, etc.
  // MTO PATTERN: Also match "Description Materials" (combined column header)
  return /^(detail|description|descriptions|desc|material|item\s*description|item\s*detail|material\s*description|description\s*materials?|description\s*material|specification|spec|specification\s*of\s*goods)$/.test(normalized);
}

/**
 * Detects if a column header matches common quantity patterns
 * MTO-AWARE: Recognizes "Total As Drawing Details" and similar aggregate quantity columns
 * @param {string} header - Column header text
 * @returns {boolean}
 */
function isQuantityColumn(header) {
  if (!header) return false;
  const normalized = normalizeHeader(header);
  // Match: qty, quantity, quantities, round quantity, rounded quantity, round qty, pcs, total quantity, nett quantity, net quantity, purchased quantity, erected quantity
  // MTO PATTERN: Also match "Total As Drawing Details", "Total as Drawing", "Overall Total", etc.
  // These columns aggregate quantities from multiple drawing/project columns
  return /^(qty|quantity|quantities|round\s*quantity|rounded\s*quantity|round\s*qty|pcs|total\s*quantity|nett\s*quantity|net\s*quantity|purchased\s*quantity|erected\s*quantity|nett\s*qty|net\s*qty|total\s*as\s*drawing|total\s*as\s*drawing\s*details|overall\s*total|estimated\s*overall\s*total|total\s*qty|total)$/.test(normalized);
}

/**
 * Detects if a column header matches common unit patterns
 * @param {string} header - Column header text
 * @returns {boolean}
 */
function isUnitColumn(header) {
  if (!header) return false;
  const normalized = normalizeHeader(header);
  return /^(unit|uom|unit\s*of\s*measure|u\.o\.m\.)$/.test(normalized);
}

/**
 * Detects if a column header matches common spec/size patterns
 * @param {string} header - Column header text
 * @returns {boolean}
 */
function isSpecColumn(header) {
  if (!header) return false;
  const normalized = normalizeHeader(header);
  return /^(spec|pipe\s*spec|size|size1|size2|dimension|dimensions)$/.test(normalized);
}

/**
 * Detects if a column header matches common notes patterns
 * @param {string} header - Column header text
 * @returns {boolean}
 */
function isNotesColumn(header) {
  if (!header) return false;
  const normalized = normalizeHeader(header);
  // Match: notes, note, remark, remarks, comment, comments, shipment, shipment remarks
  // Handle comma-separated headers like "Shipment, Remarks"
  const parts = normalized.split(',').map(p => p.trim());
  return parts.some(part => /^(notes|note|remark|remarks|comment|comments|shipment)$/.test(part));
}

/**
 * Detects if a column header matches revision patterns
 * @param {string} header - Column header text
 * @returns {boolean}
 */
function isRevisionColumn(header) {
  if (!header) return false;
  const normalized = header.trim().toLowerCase();
  return /^(rev|revision|rev\.)$/.test(normalized);
}

/**
 * Generic table detection: finds tables that look like RFQ/MTO line-item tables
 * Uses scoring-based ranking to select best candidate tables
 * @param {Array} tables - Array of tables with {rowCount, columnCount, rows: string[][]}
 * @returns {Array} Array of candidate tables with metadata
 */
function detectLineItemTables(tables) {
  if (!tables || tables.length === 0) {
    return [];
  }

  console.log(`[RFQ_TABLE_DETECT] Analyzing ${tables.length} table(s) for line-item detection`);

  // Step 1: Score all tables using the new scoring system
  const scoringCandidates = tables.map((table, tableIdx) => {
    const headers = table.rows && table.rows.length > 0 ? table.rows[0] : [];
    const sampleRows = table.rows ? table.rows.slice(1, 6) : [];

    return {
      tableIndex: tableIdx,
      headers,
      rows: table.rows || [],
      originalTable: table
    };
  });

  const scoringResult = pickBestTable(scoringCandidates);

  // Log scoring results (top 5 candidates)
  const topCandidates = scoringResult.ranked.slice(0, 5).map(r => ({
    tableIndex: r.tableIndex,
    score: r.score,
    reasons: r.reasons,
    headerPreview: r.headerPreview
  }));

  console.log('[RFQ_TABLE_RANK]', JSON.stringify({
    totalTables: tables.length,
    topCandidates
  }));

  // Step 2: Try top N scored tables with strict column mapping (multi-table acceptance)
  // REMOVED LIMIT: Extract from ALL tables that pass scoring - don't cap at 8
  // User requirement: Extract ALL items like a human would, not just "top 8 tables"
  const MIN_TABLE_SCORE = 10;  // Lowered from 100 to handle tables with revision columns
  const MIN_NUMERIC_ROWS = 10;

  // Filter by score threshold - process ALL tables that pass the threshold
  // No limit: Extract from all valid tables to ensure complete extraction
  const qualifiedIndices = scoringResult.ranked
    .filter(r => r.score >= MIN_TABLE_SCORE)
    .map(r => r.tableIndex);

  console.log(`[RFQ_TABLE_PICK] Attempting strict mapping on ${qualifiedIndices.length} scored table(s) above threshold ${MIN_TABLE_SCORE}: [${qualifiedIndices.join(', ')}]`);

  const candidates = [];

  for (const tableIdx of qualifiedIndices) {
    const table = tables[tableIdx];
    if (!table.rows || table.rows.length === 0) {
      continue;
    }

    // Try to identify header row (check up to row 3 for headers)
    let headerRowIdx = -1;
    let headerRow = null;
    let hasHeaderKeywords = false;

    // Check rows 0-3 for header keywords (some documents have title rows before headers)
    for (let checkRowIdx = 0; checkRowIdx < Math.min(4, table.rows.length); checkRowIdx++) {
      const checkRow = table.rows[checkRowIdx] || [];
      for (const cell of checkRow) {
        if (isItemNumberColumn(cell) || isDescriptionColumn(cell) || isQuantityColumn(cell)) {
          headerRowIdx = checkRowIdx;
          headerRow = checkRow;
          hasHeaderKeywords = true;
          break;
        }
      }
      if (hasHeaderKeywords) break;
    }

    // Fallback to first row if no headers found
    if (!hasHeaderKeywords || !headerRow) {
      headerRowIdx = 0;
      headerRow = table.rows[0] || [];
    }

    // Analyze header row to find column indices
    const columnMap = {
      itemIdx: -1,
      descriptionIdx: -1,
      quantityIdx: -1,
      unitIdx: -1,
      specIdx: -1,
      size1Idx: -1,
      size2Idx: -1,
      notesIdx: -1,
      revisionIdx: -1,
      groupIdx: -1, // For MTO documents with GROUP/SECTION columns
    };

    // DEBUG: Log full header row for column detection
    console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - Full header row (${headerRow.length} columns):`, JSON.stringify(headerRow));
    
    // Log normalized headers for debugging
    const normalizedHeaders = headerRow.map(cell => normalizeHeader(cell));
    console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - Normalized headers:`, JSON.stringify(normalizedHeaders));
    
    for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
      const cell = (headerRow[colIdx] || '').trim();
      const normalized = normalizeHeader(cell);
      
      if (isItemNumberColumn(cell)) {
        columnMap.itemIdx = colIdx;
        console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - Column ${colIdx} "${cell}" (normalized: "${normalized}") -> itemIdx`);
      } else if (isDescriptionColumn(cell)) {
        columnMap.descriptionIdx = colIdx;
        console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - Column ${colIdx} "${cell}" (normalized: "${normalized}") -> descriptionIdx`);
      } else if (isQuantityColumn(cell)) {
        columnMap.quantityIdx = colIdx;
        console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - Column ${colIdx} "${cell}" (normalized: "${normalized}") -> quantityIdx`);
      } else if (isUnitColumn(cell)) {
        columnMap.unitIdx = colIdx;
        console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - Column ${colIdx} "${cell}" (normalized: "${normalized}") -> unitIdx`);
      } else if (normalized.includes('size1') || normalized.includes('size 1') || 
                 (normalized === 'size1') || (normalized.startsWith('size') && normalized.includes('1'))) {
        // Check for Size1 BEFORE checking for generic spec/size columns
        console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - FOUND Size1 at column ${colIdx} (cell: "${cell}", normalized: "${normalized}")`);
        columnMap.size1Idx = colIdx;
      } else if (normalized.includes('size2') || normalized.includes('size 2') ||
                 (normalized === 'size2') || (normalized.startsWith('size') && normalized.includes('2'))) {
        // Check for Size2 BEFORE checking for generic spec/size columns
        console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - FOUND Size2 at column ${colIdx} (cell: "${cell}", normalized: "${normalized}")`);
        columnMap.size2Idx = colIdx;
      } else if (isSpecColumn(cell)) {
        // Check for generic spec/size columns AFTER checking for specific size1/size2
        if (columnMap.specIdx === -1) {
          columnMap.specIdx = colIdx;
        }
      } else if ((normalized === 'size' || normalized.startsWith('size')) && columnMap.size1Idx === -1) {
        // Fallback: if we see a "Size" column and haven't found size1 yet, use it as size1
        console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - Using "Size" column ${colIdx} as Size1 fallback (cell: "${cell}", normalized: "${normalized}")`);
        columnMap.size1Idx = colIdx;
      } else if (isNotesColumn(cell)) {
        columnMap.notesIdx = colIdx;
        console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - Column ${colIdx} "${cell}" (normalized: "${normalized}") -> notesIdx`);
      } else if (isRevisionColumn(cell)) {
        columnMap.revisionIdx = colIdx;
        console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - Column ${colIdx} "${cell}" (normalized: "${normalized}") -> revisionIdx`);
      } else if (isGroupColumn(cell)) {
        columnMap.groupIdx = colIdx;
        console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - Column ${colIdx} "${cell}" (normalized: "${normalized}") -> groupIdx`);
      }
    }
    
    // DEBUG: Log final column map
    console.log(`[RFQ_COLUMN_MAP] Table ${tableIdx + 1} - Final columnMap:`, JSON.stringify(columnMap));

    // FUZZY FALLBACK: If strict matching failed, try fuzzy header reconstruction
    let hasDescription = columnMap.descriptionIdx >= 0;
    let hasQuantity = columnMap.quantityIdx >= 0;
    let hasUnit = columnMap.unitIdx >= 0;
    let hasItem = columnMap.itemIdx >= 0;
    let hasSpec = columnMap.specIdx >= 0;

    // Minimum requirement: description + quantity (essential for line items)
    let hasMinimumSignal = hasDescription && hasQuantity;

    // If strict matching failed, try fuzzy reconstruction
    if (!hasMinimumSignal) {
      console.log(`[FUZZY_FALLBACK] Table ${tableIdx + 1} - Strict matching failed, trying fuzzy reconstruction...`);
      const { reconstructColumnMapping } = require('./extraction/headerReconstructor');
      const fuzzyResult = reconstructColumnMapping(headerRow);

      if (fuzzyResult.confidence >= 0.6 && fuzzyResult.diagnostics.hasMinimumFields) {
        console.log(`[FUZZY_FALLBACK] ✅ Fuzzy reconstruction succeeded with confidence ${fuzzyResult.confidence.toFixed(2)}`);

        // Merge fuzzy results into columnMap (only if not already set)
        if (columnMap.itemIdx < 0 && fuzzyResult.columnMap.itemIdx >= 0) {
          columnMap.itemIdx = fuzzyResult.columnMap.itemIdx;
        }
        if (columnMap.descriptionIdx < 0 && fuzzyResult.columnMap.descriptionIdx >= 0) {
          columnMap.descriptionIdx = fuzzyResult.columnMap.descriptionIdx;
        }
        if (columnMap.quantityIdx < 0 && fuzzyResult.columnMap.quantityIdx >= 0) {
          columnMap.quantityIdx = fuzzyResult.columnMap.quantityIdx;
        }
        if (columnMap.unitIdx < 0 && fuzzyResult.columnMap.unitIdx >= 0) {
          columnMap.unitIdx = fuzzyResult.columnMap.unitIdx;
        }

        // Re-evaluate signals
        hasDescription = columnMap.descriptionIdx >= 0;
        hasQuantity = columnMap.quantityIdx >= 0;
        hasUnit = columnMap.unitIdx >= 0;
        hasItem = columnMap.itemIdx >= 0;
        hasMinimumSignal = hasDescription && hasQuantity;

        console.log(`[FUZZY_FALLBACK] Updated columnMap:`, JSON.stringify(columnMap));
      } else {
        console.log(`[FUZZY_FALLBACK] ❌ Fuzzy reconstruction failed (confidence: ${fuzzyResult.confidence.toFixed(2)})`);
      }
    }
    
    // Boost signal: unit OR spec (weight/total) OR item (helps confidence)
    const hasBoostSignal = hasUnit || hasSpec || hasItem;

    // Debug logging for table analysis
    console.log(`[Table ${tableIdx + 1}] Analysis:`, {
      totalRows: table.rows.length,
      headerRowIdx,
      hasMinimumSignal,
      hasBoostSignal,
      columnMap: {
        item: columnMap.itemIdx >= 0 ? `col ${columnMap.itemIdx}` : 'NOT FOUND',
        description: columnMap.descriptionIdx >= 0 ? `col ${columnMap.descriptionIdx}` : 'NOT FOUND',
        quantity: columnMap.quantityIdx >= 0 ? `col ${columnMap.quantityIdx}` : 'NOT FOUND',
        unit: columnMap.unitIdx >= 0 ? `col ${columnMap.unitIdx}` : 'NOT FOUND',
        spec: columnMap.specIdx >= 0 ? `col ${columnMap.specIdx}` : 'NOT FOUND',
        size1: columnMap.size1Idx >= 0 ? `col ${columnMap.size1Idx}` : 'NOT FOUND',
      },
      headerRow: headerRow ? headerRow.slice(0, 5).map(c => c?.substring(0, 20)) : 'NO HEADER',
    });

    if (hasMinimumSignal) {
      // Count numeric rows (use quantity column if item column missing)
      let numericItemRowCount = 0;
      const dataStartRow = headerRowIdx + 1;
      const itemNumbers = [];
      const itemColumnIdx = hasItem ? columnMap.itemIdx : columnMap.quantityIdx; // Fallback to quantity if no item column

      for (let rowIdx = dataStartRow; rowIdx < table.rows.length; rowIdx++) {
        const row = table.rows[rowIdx] || [];
        const itemCell = (row[itemColumnIdx] || '').trim();
        const itemNum = parseInt(itemCell, 10);
        if (!isNaN(itemNum) && itemNum > 0) {
          numericItemRowCount++;
          itemNumbers.push(itemNum);
        }
      }

      // Accept if: minimum signal + (boost signal OR enough numeric rows)
      if (numericItemRowCount >= MIN_NUMERIC_ROWS || hasBoostSignal) {
        const minItem = itemNumbers.length > 0 ? Math.min(...itemNumbers) : 0;
        const maxItem = itemNumbers.length > 0 ? Math.max(...itemNumbers) : 0;
        console.log(`[RFQ_TABLE_ACCEPT] Table ${tableIdx + 1} passed strict mapping: ${numericItemRowCount} numeric rows (items ${minItem}-${maxItem})`);

        // Calculate table detection confidence
        // Base confidence on: column detection quality, row count, header detection
        let tableConfidence = 0.5; // Base confidence

        // Boost confidence if we found key columns
        if (columnMap.itemIdx >= 0) tableConfidence += 0.2;
        if (columnMap.descriptionIdx >= 0) tableConfidence += 0.15;
        if (columnMap.quantityIdx >= 0) tableConfidence += 0.1;
        if (columnMap.unitIdx >= 0) tableConfidence += 0.05;

        // Boost confidence if header was detected (not fallback)
        if (hasHeaderKeywords) tableConfidence += 0.1;

        // Boost confidence for larger tables (more data = more reliable)
        if (numericItemRowCount > 10) tableConfidence += 0.05;
        if (numericItemRowCount > 50) tableConfidence += 0.05;

        tableConfidence = Math.min(1.0, tableConfidence);

        candidates.push({
          tableIndex: tableIdx,
          headerRowIndex: headerRowIdx,
          dataStartRowIndex: dataStartRow,
          columnMap,
          numericItemRowCount,
          totalRows: table.rows.length,
          score: numericItemRowCount, // Use row count as score (larger = better)
          confidence: tableConfidence, // Add confidence score
        });

        // Log acceptance (no break - continue processing)
        console.log(`[RFQ_TABLE_ACCEPT] Accepted table ${tableIdx + 1} for extraction (${candidates.length} total)`);
        
        // NO LIMIT: Process ALL tables that pass scoring
        // User requirement: Extract ALL items from document, not just first N tables
        // Continue processing all qualified tables
      } else {
        console.log(`[RFQ_TABLE_FALLBACK] Table ${tableIdx + 1} failed strict mapping: insufficient numeric rows (${numericItemRowCount} < ${MIN_NUMERIC_ROWS}) and no boost signal, trying next candidate`);
      }
    } else {
      const missingFields = [];
      if (!hasDescription) missingFields.push('description');
      if (!hasQuantity) missingFields.push('quantity');
      console.log(`[RFQ_TABLE_FALLBACK] Table ${tableIdx + 1} failed strict mapping: missing required fields (${missingFields.join(', ')}), trying next candidate`);
    }
  }

  // Log final result
  if (candidates.length === 0) {
    console.log('[RFQ_TABLE_PICK] No valid line-item tables found after scoring and strict mapping');
  }

  // Sort by score (descending) - prefer larger tables with more item rows
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}

/**
 * Computes a normalized header signature for a table candidate
 * This is used to identify tables with similar column structures
 * @param {Object} candidate - Candidate metadata from detectLineItemTables
 * @param {Object} table - Table object with rows
 * @returns {Object} Signature with normalized header names and column map
 */
function computeTableSignature(candidate, table) {
  const { headerRowIndex, columnMap } = candidate;
  const headerRow = table.rows[headerRowIndex] || [];
  
  // Normalize header names to a set of canonical column types
  const normalizedHeaders = new Set();
  const headerNames = [];
  
  for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
    const cell = (headerRow[colIdx] || '').trim().toLowerCase();
    headerNames.push(cell);
    
    // Map to canonical types
    if (colIdx === columnMap.itemIdx) {
      normalizedHeaders.add('item');
    } else if (colIdx === columnMap.descriptionIdx) {
      normalizedHeaders.add('description');
    } else if (colIdx === columnMap.quantityIdx) {
      normalizedHeaders.add('quantity');
    } else if (colIdx === columnMap.unitIdx) {
      normalizedHeaders.add('unit');
    } else if (colIdx === columnMap.specIdx) {
      normalizedHeaders.add('spec');
    } else if (colIdx === columnMap.size1Idx) {
      normalizedHeaders.add('size1');
    } else if (colIdx === columnMap.size2Idx) {
      normalizedHeaders.add('size2');
    } else if (colIdx === columnMap.notesIdx) {
      normalizedHeaders.add('notes');
    } else if (colIdx === columnMap.revisionIdx) {
      normalizedHeaders.add('revision');
    }
  }
  
  return {
    normalizedHeaders,
    headerNames,
    columnMap,
    headerRow,
  };
}

/**
 * Checks if two table signatures are similar enough to be merged
 * @param {Object} sig1 - First table signature
 * @param {Object} sig2 - Second table signature
 * @param {Object} table1 - First table object (optional, for page adjacency check)
 * @param {Object} table2 - Second table object (optional, for page adjacency check)
 * @returns {boolean} True if tables should be grouped together
 */
function areTablesRelated(sig1, sig2, table1 = null, table2 = null) {
  // Heuristic A: Header similarity
  // Check if they share the same core columns (Item, Description, Quantity)
  const coreColumns = ['item', 'description', 'quantity'];
  const sig1HasCore = coreColumns.every(col => sig1.normalizedHeaders.has(col));
  const sig2HasCore = coreColumns.every(col => sig2.normalizedHeaders.has(col));
  
  if (!sig1HasCore || !sig2HasCore) {
    return false; // Both must have core columns
  }
  
  // Calculate Jaccard similarity of normalized headers
  const intersection = new Set([...sig1.normalizedHeaders].filter(x => sig2.normalizedHeaders.has(x)));
  const union = new Set([...sig1.normalizedHeaders, ...sig2.normalizedHeaders]);
  const similarity = intersection.size / union.size;
  
  if (similarity < 0.6) {
    return false; // Minimum header similarity threshold
  }
  
  // NEW: Dynamic page adjacency (soft constraint - doesn't block if pages missing)
  if (table1 && table2 && table1.pageNumbers && table2.pageNumbers) {
    const page1 = Math.min(...table1.pageNumbers);
    const page2 = Math.min(...table2.pageNumbers);
    const pageDistance = Math.abs(page1 - page2);
    
    // Dynamic threshold based on header similarity
    const maxPageDistance = similarity >= 0.75 ? 10 : 3;
    
    if (pageDistance > maxPageDistance) {
      return false; // Pages too far apart for given similarity level
    }
  }
  
  // Tables are related if they share at least 60% of their column types
  // This allows for some variation (e.g., one table has Size1, another has Size2)
  return true;
}

/**
 * Groups related line-item tables together
 * @param {Array} candidates - Array of candidate tables from detectLineItemTables
 * @param {Array} tables - Original table array
 * @returns {Array} Array of groups, where each group is an array of candidate indices
 */
function groupRelatedLineItemTables(candidates, tables) {
  if (candidates.length === 0) {
    return [];
  }
  
  // Compute signatures for all candidates
  const signatures = candidates.map((candidate, idx) => ({
    candidate,
    candidateIdx: idx,
    signature: computeTableSignature(candidate, tables[candidate.tableIndex]),
  }));
  
  // Group related tables using union-find approach
  const groups = [];
  const assigned = new Set();
  
  for (let i = 0; i < signatures.length; i++) {
    if (assigned.has(i)) continue;
    
    const group = [i];
    assigned.add(i);
    
      // Find all tables related to this one
      for (let j = i + 1; j < signatures.length; j++) {
        if (assigned.has(j)) continue;
        
        const table1 = tables[signatures[i].candidate.tableIndex];
        const table2 = tables[signatures[j].candidate.tableIndex];
        
        if (areTablesRelated(signatures[i].signature, signatures[j].signature, table1, table2)) {
          group.push(j);
          assigned.add(j);
        }
      }
    
    groups.push(group);
  }
  
  return groups;
}

/**
 * Merges multiple related tables into a single logical table
 * @param {Array} candidateIndices - Indices into candidates array for tables to merge
 * @param {Array} candidates - Array of candidate tables
 * @param {Array} tables - Original table array
 * @returns {Object} Merged table structure with unified headers and concatenated rows
 */
function mergeLineItemTables(candidateIndices, candidates, tables) {
  if (candidateIndices.length === 0) {
    return null;
  }
  
  // Get the candidates to merge, sorted by table index (document order)
  const candidatesToMerge = candidateIndices
    .map(idx => candidates[idx])
    .sort((a, b) => a.tableIndex - b.tableIndex);
  
  // Use the first table's structure as the base (usually the largest/primary table)
  const primaryCandidate = candidatesToMerge[0];
  const primaryTable = tables[primaryCandidate.tableIndex];
  const primarySig = computeTableSignature(primaryCandidate, primaryTable);
  
  // Build unified header row and column map
  const unifiedHeaderRow = [...primarySig.headerRow];
  const unifiedColumnMap = { ...primaryCandidate.columnMap };

  console.log(`[MERGE DEBUG] Unified header (${unifiedHeaderRow.length} cols):`, JSON.stringify(unifiedHeaderRow));
  console.log(`[MERGE DEBUG] Unified columnMap:`, JSON.stringify(unifiedColumnMap));
  
  // Collect all data rows from all tables
  // Use composite key for deduplication: item number + description (or item number + page if available)
  const allDataRows = [];
  const itemKeySet = new Set(); // Track composite keys to detect duplicates
  
  for (const candidate of candidatesToMerge) {
    const table = tables[candidate.tableIndex];
    const { headerRowIndex, dataStartRowIndex, columnMap } = candidate;
    
    // Map this table's columns to the unified column map
    const columnMapping = {};
    const sourceHeaderRow = table.rows[headerRowIndex] || [];
    
    // For each column in the source table, find its position in unified header
    for (let srcColIdx = 0; srcColIdx < sourceHeaderRow.length; srcColIdx++) {
      const srcHeader = (sourceHeaderRow[srcColIdx] || '').trim().toLowerCase();
      let mapped = false;
      
      // Try to match to unified columns by checking column map
      if (srcColIdx === columnMap.itemIdx && unifiedColumnMap.itemIdx >= 0) {
        columnMapping[srcColIdx] = unifiedColumnMap.itemIdx;
        mapped = true;
      } else if (srcColIdx === columnMap.descriptionIdx && unifiedColumnMap.descriptionIdx >= 0) {
        columnMapping[srcColIdx] = unifiedColumnMap.descriptionIdx;
        mapped = true;
      } else if (srcColIdx === columnMap.quantityIdx && unifiedColumnMap.quantityIdx >= 0) {
        columnMapping[srcColIdx] = unifiedColumnMap.quantityIdx;
        mapped = true;
      } else if (srcColIdx === columnMap.unitIdx && unifiedColumnMap.unitIdx >= 0) {
        columnMapping[srcColIdx] = unifiedColumnMap.unitIdx;
        mapped = true;
      } else if (srcColIdx === columnMap.specIdx && unifiedColumnMap.specIdx >= 0) {
        columnMapping[srcColIdx] = unifiedColumnMap.specIdx;
        mapped = true;
      } else if (srcColIdx === columnMap.size1Idx && unifiedColumnMap.size1Idx >= 0) {
        columnMapping[srcColIdx] = unifiedColumnMap.size1Idx;
        mapped = true;
      } else if (srcColIdx === columnMap.size2Idx && unifiedColumnMap.size2Idx >= 0) {
        columnMapping[srcColIdx] = unifiedColumnMap.size2Idx;
        mapped = true;
      } else if (srcColIdx === columnMap.notesIdx && unifiedColumnMap.notesIdx >= 0) {
        columnMapping[srcColIdx] = unifiedColumnMap.notesIdx;
        mapped = true;
      } else if (srcColIdx === columnMap.revisionIdx && unifiedColumnMap.revisionIdx >= 0) {
        columnMapping[srcColIdx] = unifiedColumnMap.revisionIdx;
        mapped = true;
      }
      
      // FALLBACK: If not mapped by columnMap, try to match by header name in unified header
      if (!mapped && srcHeader) {
        for (let unifiedColIdx = 0; unifiedColIdx < unifiedHeaderRow.length; unifiedColIdx++) {
          const unifiedHeader = (unifiedHeaderRow[unifiedColIdx] || '').trim().toLowerCase();
          if (unifiedHeader === srcHeader) {
            columnMapping[srcColIdx] = unifiedColIdx;
            mapped = true;
            console.log(`[MERGE DEBUG] Mapped column ${srcColIdx} "${sourceHeaderRow[srcColIdx]}" to unified column ${unifiedColIdx} by header name match`);
            break;
          }
        }
      }
      
      if (!mapped) {
        // Column doesn't map to unified structure - skip
        columnMapping[srcColIdx] = -1;
      }
    }
    
    // Extract data rows
    for (let rowIdx = dataStartRowIndex; rowIdx < table.rows.length; rowIdx++) {
      const sourceRow = table.rows[rowIdx] || [];

      // Get item number (may not exist for some MTO tables)
      const itemCell = columnMap.itemIdx >= 0 ? (sourceRow[columnMap.itemIdx] || '').trim() : '';
      const itemNum = parseInt(itemCell, 10);
      const hasValidItemNum = !isNaN(itemNum) && itemNum > 0;

      // For tables without ITEM NO., check if row has valid description + quantity
      if (!hasValidItemNum) {
        const descCell = columnMap.descriptionIdx >= 0 ? (sourceRow[columnMap.descriptionIdx] || '').trim() : '';
        const qtyCell = columnMap.quantityIdx >= 0 ? (sourceRow[columnMap.quantityIdx] || '').trim() : '';
        const hasDescription = descCell && descCell.length > 3;
        const hasQuantity = qtyCell && !isNaN(parseFloat(qtyCell));

        if (!hasDescription || !hasQuantity) {
          continue; // Skip rows without item number AND without valid description+quantity
        }
        // Use row index as synthetic item number for merging
      }
      
      // Get description for composite key
      const descriptionCell = columnMap.descriptionIdx >= 0
        ? (sourceRow[columnMap.descriptionIdx] || '').trim().toLowerCase().substring(0, 50) // First 50 chars
        : '';

      // Get page number if available from table metadata
      const pageNumber = table.pageNumbers && table.pageNumbers.length > 0
        ? table.pageNumbers[0]
        : null;

      // Create composite key: item number + description hash (or row index if no item number)
      const descriptionHash = descriptionCell ? descriptionCell.replace(/\s+/g, ' ').substring(0, 30) : '';
      const effectiveItemNum = hasValidItemNum ? itemNum : rowIdx;
      const compositeKey = pageNumber
        ? `${effectiveItemNum}_p${pageNumber}_${descriptionHash}`
        : `${effectiveItemNum}_${descriptionHash}`;
      
      // Check for duplicate composite keys
      if (itemKeySet.has(compositeKey)) {
        // Duplicate detected - prefer the row with more non-empty cells
        const existingRow = allDataRows.find(r => {
          const existingItemCell = (r[unifiedColumnMap.itemIdx] || '').trim();
          const existingItemNum = parseInt(existingItemCell, 10);
          if (existingItemNum !== itemNum) return false;
          
          // Check description match
          const existingDescCell = unifiedColumnMap.descriptionIdx >= 0
            ? (r[unifiedColumnMap.descriptionIdx] || '').trim().toLowerCase().substring(0, 50)
            : '';
          const existingDescHash = existingDescCell ? existingDescCell.replace(/\s+/g, ' ').substring(0, 30) : '';
          
          return existingDescHash === descriptionHash;
        });
        
        if (existingRow) {
          // Count non-empty cells in both rows
          const existingNonEmpty = existingRow.filter(cell => (cell || '').trim()).length;
          const newNonEmpty = sourceRow.filter(cell => (cell || '').trim()).length;
          
          // If new row has more data, replace existing (but merge complementary data)
          if (newNonEmpty > existingNonEmpty) {
            // Map new row to unified structure
            const unifiedRow = new Array(unifiedHeaderRow.length).fill('');
            for (let srcColIdx = 0; srcColIdx < sourceRow.length; srcColIdx++) {
              const targetColIdx = columnMapping[srcColIdx];
              if (targetColIdx >= 0 && targetColIdx < unifiedRow.length) {
                const existingValue = unifiedRow[targetColIdx] || '';
                const newValue = (sourceRow[srcColIdx] || '').trim();
                // Merge: prefer new value if existing is empty, otherwise keep existing
                unifiedRow[targetColIdx] = existingValue || newValue;
              }
            }
            
            // Replace existing row
            const existingIdx = allDataRows.indexOf(existingRow);
            allDataRows[existingIdx] = unifiedRow;
          }
          // Otherwise keep existing row
        }
        continue;
      }
      
      // Map source row to unified structure
      const unifiedRow = new Array(unifiedHeaderRow.length).fill('');
      for (let srcColIdx = 0; srcColIdx < sourceRow.length; srcColIdx++) {
        const targetColIdx = columnMapping[srcColIdx];
        if (targetColIdx >= 0 && targetColIdx < unifiedRow.length) {
          unifiedRow[targetColIdx] = (sourceRow[srcColIdx] || '').trim();
        }
      }
      
      allDataRows.push(unifiedRow);
      itemKeySet.add(compositeKey);
    }
  }
  
  // Sort rows by item number
  allDataRows.sort((a, b) => {
    const itemA = parseInt((a[unifiedColumnMap.itemIdx] || '').trim(), 10) || 0;
    const itemB = parseInt((b[unifiedColumnMap.itemIdx] || '').trim(), 10) || 0;
    return itemA - itemB;
  });
  
  // Build merged table structure
  const mergedRows = [unifiedHeaderRow, ...allDataRows];
  
  return {
    rows: mergedRows,
    rowCount: mergedRows.length,
    columnCount: unifiedHeaderRow.length,
    headerRowIndex: 0,
    dataStartRowIndex: 1,
    columnMap: unifiedColumnMap,
    sourceTableIndices: candidatesToMerge.map(c => c.tableIndex),
    numericItemRowCount: allDataRows.length,
  };
}

/**
 * Extracts line items from a candidate table
 * @param {Object} table - Table object with {rowCount, columnCount, rows: string[][]}
 * @param {Object} candidate - Candidate metadata from detectLineItemTables
 * @returns {Array} Array of line item objects
 */
/**
 * Calculate confidence score for a field based on extraction quality
 * @param {any} value - The extracted value
 * @param {boolean} columnFound - Whether the column was found in the table
 * @param {boolean} valuePresent - Whether a value was extracted
 * @param {string} fieldType - Type of field for context-specific scoring
 * @returns {number} Confidence score between 0.0 and 1.0
 */
function calculateFieldConfidence(value, columnFound, valuePresent, fieldType = 'generic') {
  // If column not found, confidence is very low
  if (!columnFound) {
    return 0.1;
  }
  
  // If column found but no value, confidence is low
  if (!valuePresent || value === null || value === '') {
    return 0.3;
  }
  
  // Base confidence for having a value
  let confidence = 0.7;
  
  // Field-specific confidence adjustments
  if (fieldType === 'line_number') {
    // Line numbers are usually reliable if they're integers
    confidence = 0.95;
  } else if (fieldType === 'quantity') {
    // Quantities are reliable if they're numeric
    if (typeof value === 'number' && value > 0) {
      confidence = 0.9;
    } else {
      confidence = 0.5; // Non-numeric or zero quantity
    }
  } else if (fieldType === 'description') {
    // Descriptions are reliable if they have meaningful length
    if (typeof value === 'string' && value.length > 10) {
      confidence = 0.85;
    } else if (typeof value === 'string' && value.length > 0) {
      confidence = 0.6; // Short description might be incomplete
    }
  } else if (fieldType === 'unit') {
    // Units are reliable if they match common patterns
    const commonUnits = ['ea', 'pcs', 'pc', 'm', 'mtr', 'meter', 'kg', 'ton', 'length', 'each'];
    if (typeof value === 'string' && commonUnits.includes(value.toLowerCase())) {
      confidence = 0.9;
    } else {
      confidence = 0.7; // Unknown unit but present
    }
  } else {
    // Generic field - moderate confidence
    confidence = 0.7;
  }
  
  return Math.min(1.0, Math.max(0.0, confidence));
}

/**
 * Generate validation warnings for a line item
 * @param {Object} item - The line item
 * @param {Object} fieldConfidence - Field confidence scores
 * @returns {Array<string>} Array of warning messages
 */
function generateValidationWarnings(item, fieldConfidence) {
  const warnings = [];
  
  if (fieldConfidence.description < 0.5) {
    warnings.push(`Item ${item.line_number}: Description missing or incomplete`);
  }
  
  if (fieldConfidence.quantity < 0.5) {
    warnings.push(`Item ${item.line_number}: Quantity missing or invalid`);
  }
  
  if (fieldConfidence.unit < 0.5 && item.quantity) {
    warnings.push(`Item ${item.line_number}: Unit missing or ambiguous`);
  }
  
  if (item.quantity === 0 || item.quantity === null) {
    warnings.push(`Item ${item.line_number}: Zero or missing quantity`);
  }
  
  if (fieldConfidence.description < 0.7 && item.description && item.description.length < 5) {
    warnings.push(`Item ${item.line_number}: Description appears incomplete (very short)`);
  }
  
  return warnings;
}

function extractLineItemsFromTable(table, candidate) {
  const lineItems = [];
  const { headerRowIndex, dataStartRowIndex, columnMap } = candidate;
  const headerRow = table.rows[headerRowIndex] || [];

  // Build a map of all column indices to their header names for extra fields
  const extraFieldsMap = {};
  const mappedIndices = new Set([
    columnMap.itemIdx,
    columnMap.descriptionIdx,
    columnMap.quantityIdx,
    columnMap.unitIdx,
    columnMap.specIdx,
    columnMap.size1Idx,
    columnMap.size2Idx,
    columnMap.notesIdx,
    columnMap.revisionIdx,
  ].filter(idx => idx >= 0));

  // Map unmapped columns to their header names
  for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
    if (!mappedIndices.has(colIdx)) {
      const headerName = (headerRow[colIdx] || '').trim();
      if (headerName) {
        // Normalize header name for key (lowercase, replace spaces with underscores)
        const normalizedKey = normalizeHeader(headerName, false)
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, '');
        extraFieldsMap[colIdx] = {
          key: normalizedKey,
          originalHeader: headerName,
        };
      }
    }
  }

  // FALLBACK: If size columns weren't detected in columnMap, find them from header row
  let actualSize1Idx = columnMap.size1Idx;
  let actualSize2Idx = columnMap.size2Idx;
  
  if (actualSize1Idx < 0 || actualSize2Idx < 0) {
    for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
      const headerCell = (headerRow[colIdx] || '').trim().toLowerCase();
      if (actualSize1Idx < 0 && (headerCell === 'size1' || headerCell.includes('size1') || headerCell.includes('size 1'))) {
        actualSize1Idx = colIdx;
        console.log(`[EXTRACT DEBUG] Found Size1 column at index ${colIdx} from header row (fallback)`);
      }
      if (actualSize2Idx < 0 && (headerCell === 'size2' || headerCell.includes('size2') || headerCell.includes('size 2'))) {
        actualSize2Idx = colIdx;
        console.log(`[EXTRACT DEBUG] Found Size2 column at index ${colIdx} from header row (fallback)`);
      }
    }
  }

  let filteredRowCount = 0;
  const filteredRowReasons = [];

  console.log(`[EXTRACTION DEBUG] Starting row loop: dataStartRowIndex=${dataStartRowIndex}, totalRows=${table.rows.length}, itemColumnIndex=${columnMap.itemIdx}`);

  // Track current section/group for MTO documents
  let currentSection = '';
  let currentGroup = '';

  for (let rowIdx = dataStartRowIndex; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx] || [];

    // Get item number
    const itemCell = (row[columnMap.itemIdx] || '').trim();
    const itemNum = parseInt(itemCell, 10);

    // DEBUG: Log every row to see what's being filtered
    console.log(`[EXTRACTION DEBUG] Row ${rowIdx}: itemCell="${itemCell}", itemNum=${itemNum}, isValid=${!isNaN(itemNum) && itemNum > 0}`);

    // Check if this is a section separator (XX) or section header
    const descriptionCell = columnMap.descriptionIdx >= 0
      ? (row[columnMap.descriptionIdx] || '').trim().toUpperCase()
      : '';

    // Check for group name in the GROUP column if it exists
    const groupCell = columnMap.groupIdx >= 0
      ? (row[columnMap.groupIdx] || '').trim()
      : '';

    // Handle section separators (XX) - update context but don't extract
    if (itemCell === 'XX' || itemCell === 'xx') {
      console.log(`[RFQ_HYBRID] Section separator at row ${rowIdx}, group: ${groupCell}`);
      if (groupCell) {
        currentGroup = groupCell;
      }
      filteredRowCount++;
      filteredRowReasons.push({ rowIdx, itemCell, reason: 'section_separator' });
      continue;
    }

    // Handle section headers (blank item number with descriptive text)
    const isSectionHeader = !itemCell && descriptionCell && (
      descriptionCell.includes('FLANGES') ||
      descriptionCell.includes('SP ITEMS') ||
      descriptionCell.includes('OTHERS') ||
      descriptionCell.includes('OPTIONAL')
    );

    if (isSectionHeader) {
      console.log(`[RFQ_HYBRID] Section header at row ${rowIdx}: ${descriptionCell}`);
      currentSection = descriptionCell;
      filteredRowCount++;
      filteredRowReasons.push({ rowIdx, itemCell, reason: 'section_header' });
      continue;
    }

    // Only process rows where item number is a positive integer
    if (isNaN(itemNum) || itemNum <= 0) {
      // For MTO documents with blank item numbers but valid description and quantity, generate synthetic ID
      // const hasDescription = descriptionCell && descriptionCell.length > 3;
      // const quantityCell = columnMap.quantityIdx >= 0
      //   ? (row[columnMap.quantityIdx] || '').trim()
      //   : '';
      // const hasQuantity = quantityCell && !isNaN(parseFloat(quantityCell));

      // if (hasDescription && hasQuantity) {
      //   // This appears to be a valid line item with missing item number - use row index
      //   console.log(`[RFQ_HYBRID] Valid item at row ${rowIdx} with missing item number, using row index`);
      //   // Continue to process this row below with synthetic item number
      // } else {
      filteredRowCount++;
      const reason = isNaN(itemNum)
        ? `invalid_number (cell="${itemCell}")`
        : `non_positive (itemNum=${itemNum})`;
      filteredRowReasons.push({ rowIdx, itemCell, reason });
      console.log(`[RFQ_HYBRID] Filtered row ${rowIdx}: ${reason}`);
      continue;
      // }
    }

    // Extract fields
    const description = columnMap.descriptionIdx >= 0 
      ? (row[columnMap.descriptionIdx] || '').trim() 
      : null;
    
    const quantityStr = columnMap.quantityIdx >= 0 
      ? (row[columnMap.quantityIdx] || '').trim() 
      : null;
    
    // Try to parse quantity (may include unit like "10 EA" or "5 m")
    let quantity = null;
    let unit = null;
    if (quantityStr) {
      const qtyMatch = quantityStr.match(/^([\d.,]+)\s*(.*)$/);
      if (qtyMatch) {
        quantity = parseFloat(qtyMatch[1].replace(/,/g, ''));
        unit = qtyMatch[2].trim() || null;
      } else {
        quantity = parseFloat(quantityStr.replace(/,/g, ''));
      }
      if (isNaN(quantity)) quantity = null;
    }

    // Get unit from dedicated column if available
    if (columnMap.unitIdx >= 0 && !unit) {
      unit = (row[columnMap.unitIdx] || '').trim() || null;
    }

    const spec = columnMap.specIdx >= 0 
      ? (row[columnMap.specIdx] || '').trim() 
      : null;
    
    const size1 = actualSize1Idx >= 0 
      ? (row[actualSize1Idx] || '').trim() 
      : null;
    
    const size2 = actualSize2Idx >= 0 
      ? (row[actualSize2Idx] || '').trim() 
      : null;
    
    const notes = columnMap.notesIdx >= 0 
      ? (row[columnMap.notesIdx] || '').trim() 
      : null;
    
    const revision = columnMap.revisionIdx >= 0
      ? (row[columnMap.revisionIdx] || '').trim()
      : null;

    const group = columnMap.groupIdx >= 0
      ? (row[columnMap.groupIdx] || '').trim()
      : null;

    // Update current group context if this row has a group value
    if (group && group !== currentGroup) {
      currentGroup = group;
      console.log(`[RFQ_HYBRID] Updated current group to: ${currentGroup}`);
    }

    // Build combined size display
    const sizeDisplay = size2
      ? `${size1} × ${size2}`
      : size1 || null;

    // Use synthetic line number if original is missing/invalid
    const effectiveItemNum = (isNaN(itemNum) || itemNum <= 0) ? rowIdx : itemNum;
    const usingSyntheticLineNumber = (isNaN(itemNum) || itemNum <= 0);

    if (usingSyntheticLineNumber) {
      console.log(`[RFQ_HYBRID] Using synthetic line number ${effectiveItemNum} for row ${rowIdx} (original: "${itemCell}")`);
    }

    // Calculate field-level confidence scores
    const fieldConfidence = {
      line_number: calculateFieldConfidence(effectiveItemNum, columnMap.itemIdx >= 0, effectiveItemNum > 0, usingSyntheticLineNumber ? 'medium' : 'line_number'),
      description: calculateFieldConfidence(description, columnMap.descriptionIdx >= 0, !!description, 'description'),
      quantity: calculateFieldConfidence(quantity, columnMap.quantityIdx >= 0, quantity !== null, 'quantity'),
      unit: calculateFieldConfidence(unit, columnMap.unitIdx >= 0 || !!unit, !!unit, 'unit'),
      spec: calculateFieldConfidence(spec, columnMap.specIdx >= 0, !!spec, 'generic'),
      size1: calculateFieldConfidence(size1, actualSize1Idx >= 0, !!size1, 'generic'),
      size2: calculateFieldConfidence(size2, actualSize2Idx >= 0, !!size2, 'generic'),
      notes: calculateFieldConfidence(notes, columnMap.notesIdx >= 0, !!notes, 'generic'),
      revision: calculateFieldConfidence(revision, columnMap.revisionIdx >= 0, !!revision, 'generic'),
    };

    // Calculate overall item confidence (weighted average)
    const weights = {
      line_number: 0.2,
      description: 0.25,
      quantity: 0.25,
      unit: 0.15,
      spec: 0.05,
      size1: 0.05,
      size2: 0.02,
      notes: 0.02,
      revision: 0.01,
    };
    
    const overallConfidence = Object.keys(weights).reduce((sum, key) => {
      return sum + (fieldConfidence[key] * weights[key]);
    }, 0);

    // Generate validation warnings
    const warnings = generateValidationWarnings(
      { line_number: effectiveItemNum, description, quantity, unit },
      fieldConfidence
    );

    // Add warning if using synthetic line number
    if (usingSyntheticLineNumber) {
      warnings.push({
        field: 'line_number',
        message: `Synthetic line number ${effectiveItemNum} generated (original: "${itemCell}")`,
        severity: 'info'
      });
    }

    // Extract extra fields from unmapped columns
    const extraFields = {};
    for (const [colIdx, fieldInfo] of Object.entries(extraFieldsMap)) {
      const value = (row[parseInt(colIdx)] || '').trim();
      if (value) {
        extraFields[fieldInfo.key] = value;
      }
    }

    // Create line item object
    const lineItem = {
      line_number: effectiveItemNum,
      description: description || null,
      quantity: quantity,
      unit: unit || null,
      spec: spec || null,
      size: sizeDisplay, // Combined size for display
      size1: size1 || null,
      size2: size2 || null,
      notes: notes || null,
      revision: revision || null,
      group: group || currentGroup || null, // Use row's group or current context group
      raw_row: row, // Preserve original row
      extra_fields: Object.keys(extraFields).length > 0 ? extraFields : null, // Store extra fields
      // Add confidence scoring
      _confidence: {
        overall: overallConfidence,
        fields: fieldConfidence,
        warnings: warnings,
      },
    };

    lineItems.push(lineItem);
  }

  // Log extraction statistics
  console.log(`[RFQ_HYBRID] Extracted ${lineItems.length} raw items from table ${candidate.tableIndex || 'merged'}`);
  if (filteredRowCount > 0) {
    console.log(`[RFQ_HYBRID] Filtered ${filteredRowCount} row(s) (invalid item numbers)`);
    if (filteredRowReasons.length > 5) {
      console.log(`[RFQ_HYBRID] Sample filtered rows: ${filteredRowReasons.slice(0, 5).map(r => `row ${r.rowIdx} (${r.reason})`).join(', ')} ... and ${filteredRowReasons.length - 5} more`);
    } else {
      console.log(`[RFQ_HYBRID] Filtered rows: ${filteredRowReasons.map(r => `row ${r.rowIdx} (${r.reason})`).join(', ')}`);
    }
  }
  if (lineItems.length > 0) {
    console.log(`[RFQ_HYBRID_SAMPLE] First raw item:`, JSON.stringify({
      line_number: lineItems[0].line_number,
      description: lineItems[0].description?.substring(0, 50),
      quantity: lineItems[0].quantity,
      unit: lineItems[0].unit,
      extra_fields: lineItems[0].extra_fields,
    }));
    if (lineItems.length > 1) {
      console.log(`[RFQ_HYBRID_SAMPLE] Second raw item:`, JSON.stringify({
        line_number: lineItems[1].line_number,
        description: lineItems[1].description?.substring(0, 50),
        quantity: lineItems[1].quantity,
        unit: lineItems[1].unit,
        extra_fields: lineItems[1].extra_fields,
      }));
    }
  }

  return lineItems;
}

/**
 * Filters out VDRL and administrative tables
 * @param {Array} tables - Array of table objects
 * @returns {Array} Filtered tables
 */
function filterVdrlAndAdminTables(tables) {
  if (!tables || tables.length === 0) return [];
  
  const { normalizeHeaderToken } = require('./rfqExtraction/tableScoring');
  
  return tables.filter((table) => {
    if (!table.rows || table.rows.length === 0) return false;
    
    const headers = table.rows[0] || [];
    const normalizedHeaders = headers.map(h => normalizeHeaderToken(h || ''));
    
    // VDRL keywords - filter out administrative document tables
    const vdrlKeywords = [
      'vendor', 'vdrl', 'data requirement', 'document list',
      'document no', 'document number', 'document title', 'document code'
    ];
    
    // Check if this looks like a VDRL/document list table
    const hasVdrlKeyword = normalizedHeaders.some(h => 
      vdrlKeywords.some(kw => h.includes(kw))
    );
    
    // Also filter out revision tables (they have "rev" but also "approved by", "date")
    const revisionKeywords = ['rev', 'revision', 'approved by', 'approved', 'prepared by'];
    const hasRevisionKeyword = normalizedHeaders.some(h => 
      revisionKeywords.some(kw => h.includes(kw))
    );
    const hasApprovalField = normalizedHeaders.some(h => 
      h.includes('approved') || h.includes('prepared') || h.includes('checked')
    );
    const isRevisionTable = hasRevisionKeyword && hasApprovalField;
    
    // Filter out VDRL and revision tables
    if (hasVdrlKeyword || isRevisionTable) {
      return false;
    }
    
    return true;
  });
}

/**
 * Builds a prompt for Vertex AI (Gemini) to parse RFQ data from OCR output
 * @param {Object} structured - Structured OCR output
 * @param {Object} tableAnalysis - Analysis of detected tables (for logging)
 * @param {Array} mergedTables - Array of merged table structures (optional)
 * @param {Array} rawItems - Array of raw extracted line items that AI must normalize (REQUIRED for hybrid mode)
 * @returns {string} Prompt text
 */
function buildRfqParsingPrompt(structured, tableAnalysis = null, mergedTables = null, rawItems = null) {
  const text = structured.text || '';
  const tables = structured.tables || [];

  // Format tables for the prompt - prefer merged tables if available
  let tablesText = '';
  if (mergedTables && mergedTables.length > 0) {
    // Use merged tables - these are the logical line-item tables
    tablesText = '\n\n## MERGED LINE-ITEM TABLES:\n\n';
    tablesText += 'The following tables have been merged from multiple source tables that were detected as part of the same line-item list.\n';
    tablesText += 'IMPORTANT: These tables are provided for context. You will receive pre-extracted raw items to normalize.\n\n';

    mergedTables.forEach((mergedTable, idx) => {
      tablesText += `Merged Table ${idx + 1} (${mergedTable.numericItemRowCount} item rows, merged from source tables ${mergedTable.sourceTableIndices.map(t => t + 1).join(', ')}):\n`;
      mergedTable.rows.forEach((row, rowIdx) => {
        tablesText += `Row ${rowIdx + 1}: ${JSON.stringify(row)}\n`;
      });
      tablesText += '\n';
    });
  } else if (tables.length > 0) {
    // Fallback to original tables if no merged tables provided
    // FILTER OUT VDRL and administrative tables before sending to Gemini
    // This prevents token waste and conflicting signals
    const filteredTables = filterVdrlAndAdminTables(tables);
    
    console.log(`[AI Parse] Filtered ${tables.length} tables → ${filteredTables.length} tables (removed ${tables.length - filteredTables.length} VDRL/admin tables)`);
    
    tablesText = '\n\n## TABLES DETECTED:\n\n';
    if (filteredTables.length < tables.length) {
      tablesText += `NOTE: ${tables.length - filteredTables.length} administrative/VDRL tables were filtered out automatically.\n`;
      tablesText += 'Only tables potentially containing line items are shown below.\n\n';
    }
    tablesText += 'WARNING: Table detection did not identify line-item tables automatically.\n';
    tablesText += 'You must manually identify which table(s) contain line items and extract ALL rows.\n';
    tablesText += 'Look for tables with Item/No columns and Description/Detail columns.\n\n';
    tablesText += 'IGNORE these table types (already filtered, but double-check):\n';
    tablesText += '- VDRL tables (headers: "Document No.", "Document Title", "VDRL Code")\n';
    tablesText += '- Revision tables (headers: "Rev.", "Approved by", "Date")\n';
    tablesText += '- Approval matrices (headers: "Approved by", "Prepared by", "Checked by")\n\n';
    
    filteredTables.forEach((table, idx) => {
      tablesText += `Table ${idx + 1} (${table.rowCount} rows × ${table.columnCount} columns):\n`;
      // Show first few rows to help identify structure
      const previewRows = Math.min(10, table.rows.length);
      table.rows.slice(0, previewRows).forEach((row, rowIdx) => {
        tablesText += `Row ${rowIdx + 1}: ${JSON.stringify(row)}\n`;
      });
      if (table.rows.length > previewRows) {
        tablesText += `... (${table.rows.length - previewRows} more rows)\n`;
      }
      tablesText += '\n';
    });
    
    tablesText += '\nCRITICAL: Extract ALL rows from line-item tables. Do NOT skip any rows.\n';
    tablesText += 'If you find a table with Item numbers (1, 2, 3...), extract every single row.\n';
  }

  // Add RAW ITEMS section for hybrid extraction mode
  let rawItemsText = '';
  if (rawItems && rawItems.length > 0) {
    rawItemsText = '\n\n## RAW ITEMS (PRE-EXTRACTED):\n\n';
    rawItemsText += 'CRITICAL: The following items have been pre-extracted from the merged tables.\n';
    rawItemsText += `You MUST return exactly ${rawItems.length} line_items entries - one for each raw item below.\n`;
    rawItemsText += 'Your job is NORMALIZATION ONLY - clean and standardize the fields, but DO NOT add, remove, merge, or skip any rows.\n';
    rawItemsText += 'The number of entries you return MUST match the number of raw items exactly.\n\n';

    rawItems.forEach((item, idx) => {
      rawItemsText += `Raw Item ${idx + 1}:\n`;
      rawItemsText += `  line_number: ${item.line_number}\n`;
      rawItemsText += `  description: ${JSON.stringify(item.description)}\n`;
      rawItemsText += `  quantity: ${item.quantity}\n`;
      rawItemsText += `  unit: ${JSON.stringify(item.unit)}\n`;
      rawItemsText += `  spec: ${JSON.stringify(item.spec)}\n`;
      rawItemsText += `  size1: ${JSON.stringify(item.size1)}\n`;
      rawItemsText += `  size2: ${JSON.stringify(item.size2)}\n`;
      rawItemsText += `  notes: ${JSON.stringify(item.notes)}\n`;
      rawItemsText += `  revision: ${JSON.stringify(item.revision)}\n`;
      rawItemsText += '\n';
    });
  }

  // Add table analysis info if available
  let analysisText = '';
  if (tableAnalysis && tableAnalysis.candidates.length > 0) {
    analysisText = '\n\n## TABLE ANALYSIS:\n\n';
    if (mergedTables && mergedTables.length > 0) {
      analysisText += `Found ${tableAnalysis.candidates.length} candidate line-item table(s) grouped into ${mergedTables.length} merged table(s):\n`;
      mergedTables.forEach((mergedTable, idx) => {
        analysisText += `- Merged Table ${idx + 1}: ${mergedTable.numericItemRowCount} item rows (from source tables ${mergedTable.sourceTableIndices.map(t => t + 1).join(', ')})\n`;
      });
    } else {
      analysisText += `Found ${tableAnalysis.candidates.length} candidate line-item table(s):\n`;
      tableAnalysis.candidates.forEach((candidate, idx) => {
        analysisText += `- Table ${candidate.tableIndex + 1}: ${candidate.numericItemRowCount} numeric item rows detected\n`;
      });
    }

    if (rawItems && rawItems.length > 0) {
      analysisText += `\nExtracted ${rawItems.length} raw items for normalization.\n`;
      analysisText += 'CRITICAL: You MUST return exactly this many line_items entries.\n';
    } else {
      analysisText += '\nIMPORTANT: Extract ALL rows from these tables where the Item column contains a positive integer.\n';
      analysisText += 'Do NOT skip any rows - if information is incomplete, return null for missing fields instead of omitting the row.\n';
    }
  }

  const hybridMode = rawItems && rawItems.length > 0;

  return `You are an expert at parsing Request for Quotation (RFQ) and Material Take-Off (MTO) documents for NSC, a steel trading company.

NSC BUSINESS CONTEXT:
NSC is a steel trading company that trades:
- Item Types: Pipes, Flanges, Fittings (elbows, tees, reducers), Valves, Beams (HEA, HEB, W-beams), Plates, Fasteners (bolts, gaskets, studs)
- Materials: Carbon Steel (A105, A106, A234, A53, API 5L), Stainless Steel (316L, 304L, A182, A312, A403), Alloys (Monel 400, Incoloy 825, Duplex/S32205, Hastelloy), European standards (EN10210, EN10225, S355)
- Units: M (meters), EA (each), PCS (pieces), KG, SET

WHAT TO EXTRACT:
Extract ALL legitimate items from the document tables - extract everything that appears to be a material/item line in the document, regardless of type.
Extract items like a human would: if it's in a table with item numbers, descriptions, quantities, and units - extract it.
Extract cables, electrical items, instruments, pipes, flanges, valves, structural steel, fasteners - extract EVERYTHING that's a real item in the document.

WHAT TO IGNORE (DO NOT EXTRACT):
- VDRL tables: Headers like "Document No.", "Document Title", "Document Number", "VDRL Code", "Data Requirement"
- Revision tables: Headers like "Rev.", "Revision No.", "Date of revision", "Approved by", "Prepared by"
- Approval matrices: Headers like "Approved by", "Checked by", "Verified by", "Signature"
- Document lists: Headers like "No." + "Document No." + "Document Title" together
- Administrative tables: Headers with "Date", "Approved", "Signature", "Transmittal"
- Header rows, footer rows, summary rows, empty rows, formatting-only rows

Your task is to ${hybridMode ? 'normalize pre-extracted line items and extract metadata' : 'extract structured RFQ information'} from the OCR text and tables provided below.

## CRITICAL INSTRUCTIONS:

${hybridMode ? `
**HYBRID EXTRACTION MODE ACTIVE**

You are operating in HYBRID mode. This means:
- Line items have been PRE-EXTRACTED from merged tables (see RAW ITEMS section below)
- Your job is NORMALIZATION ONLY - clean and standardize the extracted data
- You MUST return exactly ${rawItems.length} line_items entries
- DO NOT add, remove, merge, or skip any rows
- DO NOT re-extract from tables - use the RAW ITEMS provided
- Each raw item corresponds to exactly one line_items entry in your output
- If a field is missing or unclear, set it to null rather than guessing

Your responsibilities:
1. Extract RFQ metadata from the document header (client_name, rfq_reference, etc.)
2. For each RAW ITEM provided, create one normalized line_items entry with:
   - Clean and standardize units (EA, PCS, LENGTH, etc.)
   - Parse and normalize quantities (remove formatting, convert to numbers)
   - Extract material and OD/TK when present; keep description intact
   - Clean up descriptions (trim whitespace, fix formatting)
   - Preserve all original data - do not invent or guess missing information

CRITICAL: Your line_items array MUST contain exactly ${rawItems.length} entries, one per raw item.
` : `
1. **TABLE IDENTIFICATION**: Identify RFQ/MTO tables where each row is a line item to be quoted.
   - Look for tables with columns like "Item", "No", "#", "Description", "Detail", "Material", "Qty", "Quantity", etc.
   - SKIP these administrative tables (they are already filtered, but verify):
     * VDRL tables: Headers containing "Document No.", "Document Title", "Document Number", "VDRL Code"
     * Revision tables: Headers like "Rev.", "Revision No.", "Date of revision", "Approved by"
     * Document lists: Tables with "No." + "Document No." + "Document Title" columns together
     * Approval matrices: Headers with "Approved by", "Prepared by", "Checked by", "Signature"
   - The largest such table(s) with NSC-relevant items are likely the main line-item tables.

2. **ROW EXTRACTION - YOU MUST EXTRACT ALL ROWS**:
   - For each row where the Item column is a positive integer (1, 2, 3, ...), YOU MUST create a corresponding \`line_items\` entry.
   - Do NOT skip rows. If information is incomplete, return null for missing fields instead of omitting the row.
   - Do NOT filter out rows because some fields are missing - missing fields should be set to null.
   - If a single logical row is split across multiple visual rows, merge those cells into a single \`line_items\` object.
   - **COMPLETENESS CHECK**: After extraction, verify you have extracted ALL items. If the table shows items 1-45, you must return 45 entries. Missing items indicate incomplete extraction.
`}

3. **METADATA EXTRACTION**: Extract RFQ metadata from the document header:
   - client_name: Name of the client/customer
   - rfq_reference: RFQ number, reference, or quote number
   - rfq_date: Date of the RFQ (format as YYYY-MM-DD if possible, or keep original format)
   - payment_terms: Payment terms if mentioned
   - delivery_terms: Delivery terms if mentioned
   - remarks: Any additional notes or remarks

4. **LINE ITEM FIELDS**: For each line item, ${hybridMode ? 'normalize' : 'extract'}:
   - line_number: Line number or item number (as positive integer, preserve from Item column)
   - description: Full description of the item (from Detail/Description/Material column)
   - quantity: Numeric quantity (from Qty/Quantity column, null if not found)
   - unit: Unit of measurement (from Unit column, or infer from Qty cell if combined like "10 EA")
   - spec: Specification (from Spec/Pipe Spec column, null if not found)
   - size1, size2: Size specifications (from Size/Size1/Size2 columns, null if not found)
   - notes: Notes or remarks (from Notes/Remark column, merge multi-line notes into one string, null if not found)
   - revision: Revision (from Rev column, null if not found)
   - raw_row: The original table row as an array (if from a table), or null

   **CRITICAL RULES FOR QUANTITY FIELD**:
   - Quantity MUST be a valid number (1, 2, 10, 100, 1.5, 2.75, etc.) or null
   - DO NOT duplicate digits when reading merged cells (e.g., if you see "4" in a merged cell, output "4" NOT "44")
   - DO NOT duplicate digits when reading quantity values (e.g., "2" should stay "2" NOT "22")
   - If you see merged table cells with a quantity value, extract the quantity ONCE per row, not multiple times
   - If quantity appears ambiguous or unclear, return null and flag for manual review
   - Validate: quantity should logically match the item description (e.g., 100 pipes is reasonable, 10000 pipes might be an OCR error)
   - Common OCR errors to avoid: "1" → "11", "2" → "22", "4" → "44", "5" → "55"

   **CRITICAL RULES FOR SIZE FIELD**:
   - Size = dimensions or nominal size (e.g., "12\\"", "16\\"", "60 x 20 x 3mm", "DN25", "NPS 6")
   - If size is embedded in description (e.g., "Pipa DN25", "W36X194", "12\\" Elbow"), extract it to size field
   - For pipes: extract as OD x TK format if both dimensions present (e.g., "33.40mm x 6.02mm")
   - DO NOT put size information in the notes field - size belongs in size/size1/size2 fields
   - DO NOT confuse size with notes or remarks - they are separate fields
   - If no size information exists, return null (do not guess)
   - If size format is unclear, preserve original format exactly as written

5. **PRESERVE EXACT VALUES**:
   - Preserve the item number exactly as it appears in the Item column.
   - Preserve exact units/measurements (EA, m, mm, inch, LENGTH, PCS, KG, TON, etc.).
   - Do NOT normalize or convert units unless absolutely necessary.

6. **PIPE SPECIFICATIONS**: For PIPE items specifically, extract these attributes carefully:
   - Nominal Pipe Size (NPS) in inches: Look for patterns like "6\"", "2\"", "1.5\"", "DN150"
     * Store in the "size" field as inches with quote mark (e.g., "6\"", "2\"")
   - Schedule: Extract "SCH40", "SCH80", "SCH10", "SCH20", "XS", "XXS", etc.
     * Normalize to format like "SCH40" or "XS"
   - Material family: Identify "CS" (Carbon Steel), "LTCS" (Low Temp CS), "SS" (Stainless Steel), "ALLOY"
     * This may be implicit from standard/grade (e.g., A106 = CS, A333 = LTCS, A312 = SS)
   - Standard: Extract full standard name (e.g., "ASTM A106", "ASTM A333", "ASTM A312", "API 5L")
   - Grade: Extract grade designation (e.g., "GR.B", "GR.6", "TP304", "TP316L", "X42", "X52")
     * For API 5L, grades are like "X42", "X52", "X60", "PSL1", "PSL2"
   - Form: Identify "seamless" or "welded" (or "ERW", "SAW" which are welded types)
     * If not specified, default to "seamless" for ASTM A106/A333/A312, "welded" for API 5L

7. **MISSING INFORMATION**: If information is missing, use null (not empty strings).

8. **TABLE PRIORITY**: If \`structured.tables\` already provides a table layout, rely on that structure; use the raw text mainly for metadata and notes.

## DOCUMENT TEXT:

${text}${tablesText}${rawItemsText}${analysisText}

## OUTPUT FORMAT - STRICT JSON ONLY:

**LAYER 1 DEFENSE: FORMAT REQUIREMENTS**
Your response MUST be valid, parseable JSON ONLY. Violations will cause extraction failure.

REQUIRED:
- Output pure JSON with no surrounding text
- NO markdown code fences (no \`\`\` or \`\`\`json)
- NO JavaScript comments (no //, no /* */)
- NO trailing commas before closing braces or brackets
- NO text like "Additional rows omitted for brevity" or similar commentary
- Use null for missing values, never omit required fields
- All line_items entries must be complete - do NOT abbreviate or truncate

FORBIDDEN:
- ❌ Markdown fences: \`\`\`json { ... } \`\`\`
- ❌ Comments: // This is a comment
- ❌ Block comments: /* ... */
- ❌ Trailing commas: {"foo": "bar",}
- ❌ Abbreviations: "... additional rows omitted ..."
- ❌ Partial output: Always include ALL line_items

CORRECT FORMAT (respond with JSON exactly like this):
  
  {
    "rfq_metadata": {
      "client_name": "...",
      "rfq_reference": "...",
      "rfq_date": "...",
      "payment_terms": "...",
      "delivery_terms": "...",
      "remarks": "..."
    },
    "line_items": [
      {
        "item_no": 1,
        "rfq_reference": "...",
        "description": "ASTM A106 GR.B SCH 40 2" SEAMLESS PIPE",
        "material": "ASTM A106 GR.B",
        "od_mm": null,
        "tk_mm": null,
        "quantity": 10,
        "unit": "M",
        "unit_weight_kg": null,
        "total_weight_kg": null,
        "notes": null
      },
      {
        "item_no": 2,
        "rfq_reference": "...",
        "description": "2" SCH10 SS316L seamless pipe",
        "material": "SS316L",
        "od_mm": null,
        "tk_mm": null,
        "quantity": 5,
        "unit": "M",
        "unit_weight_kg": null,
        "total_weight_kg": null,
        "notes": null
      }
    ]
  }
  
## REMINDER - CRITICAL RULES:

${hybridMode ? `
- You MUST return exactly ${rawItems.length} line_items entries (one per raw item).
- DO NOT add, remove, merge, or skip any rows.
- Your job is normalization only - clean and standardize the data.
- Use null for missing fields - do not invent or guess data.
- Preserve exact item numbers from raw items.
- Return valid JSON only (no extra commentary).
` : `
- Extract EVERY row where Item column is a positive integer.
- Do NOT skip rows - use null for missing fields.
- Preserve exact item numbers and units.
- Return valid JSON only (no extra commentary).
`}`;
}

/**
 * Calculates maximum completion tokens for RFQ parsing based on line item count
 * @param {number} lineItemsCount - Number of line items in the RFQ
 * @returns {number} Maximum completion tokens to request from OpenAI
 */
function calculateMaxTokensForRfq(lineItemsCount) {
  // Base completion budget reserved for instructions, examples, etc.
  const BASE_COMPLETION_TOKENS = 4000;

  // Per-item allowance. Keep it generous but realistic for large RFQs.
  const TOKENS_PER_ITEM = 200;

  // Hard cap for completion tokens. Gemini 3 Pro Preview supports up to 65536 output tokens.
  // We use 60000 to leave safety margin for JSON formatting and prevent truncation.
  const MAX_COMPLETION_TOKENS = 60000;

  const dynamic = BASE_COMPLETION_TOKENS + lineItemsCount * TOKENS_PER_ITEM;

  // Clamp to safe maximum.
  return Math.min(dynamic, MAX_COMPLETION_TOKENS);
}

/**
 * Validates and normalizes line items from AI response
 * @param {Array} lineItems - Line items array from AI
 * @param {Object} tableAnalysis - Table analysis for comparison
 * @returns {Array} Validated and normalized line items
 */
function validateAndNormalizeLineItems(lineItems, tableAnalysis = null) {
  if (!Array.isArray(lineItems)) {
    console.error('[AI Parse] line_items is not an array:', typeof lineItems);
    throw new Error('line_items must be an array');
  }

  const validated = [];
  let skippedCount = 0;
  const allWarnings = [];
  const confidenceScores = [];

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    
    // Ensure line_number is a positive integer
    let lineNumber = null;
    const lineNumberRaw = item.line_number ?? item.item_no ?? item.item_number;
    if (typeof lineNumberRaw === 'number') {
      lineNumber = lineNumberRaw;
    } else if (typeof lineNumberRaw === 'string') {
      lineNumber = parseInt(lineNumberRaw.trim(), 10);
    }

    // Only include items with valid line numbers
    if (lineNumber && lineNumber > 0 && !isNaN(lineNumber)) {
      // Preserve confidence data if it exists, otherwise calculate it
      let confidenceData = item._confidence;
      if (!confidenceData) {
        // Calculate confidence for AI-extracted items (no table extraction)
        const fieldConfidence = {
          line_number: 0.95,
          description: item.description ? (item.description.length > 10 ? 0.85 : 0.6) : 0.3,
          quantity: item.quantity ? (item.quantity > 0 ? 0.9 : 0.5) : 0.3,
          unit: item.unit ? 0.8 : 0.3,
          spec: item.spec ? 0.7 : 0.1,
          size1: item.size1 ? 0.7 : 0.1,
          size2: item.size2 ? 0.7 : 0.1,
          notes: item.notes ? 0.7 : 0.1,
          revision: item.revision ? 0.7 : 0.1,
        };
        
        const weights = {
          line_number: 0.2,
          description: 0.25,
          quantity: 0.25,
          unit: 0.15,
          spec: 0.05,
          size1: 0.05,
          size2: 0.02,
          notes: 0.02,
          revision: 0.01,
        };
        
        const overallConfidence = Object.keys(weights).reduce((sum, key) => {
          return sum + (fieldConfidence[key] * weights[key]);
        }, 0);
        
        const warnings = generateValidationWarnings(
          { line_number: lineNumber, description: item.description, quantity: item.quantity, unit: item.unit },
          fieldConfidence
        );
        
        confidenceData = {
          overall: overallConfidence,
          fields: fieldConfidence,
          warnings: warnings,
        };
      }
      
      // Collect warnings and confidence scores
      if (confidenceData.warnings && confidenceData.warnings.length > 0) {
        allWarnings.push(...confidenceData.warnings);
      }
      confidenceScores.push(confidenceData.overall);
      
      // Parse and validate quantity
      let parsedQuantity = typeof item.quantity === 'number' ? item.quantity : (item.quantity ? parseFloat(item.quantity) : null);

      // CRITICAL FIX: Detect and correct digit duplication in quantity
      // Common OCR errors: 44 → 4, 22 → 2, 11 → 1, 55 → 5 (when original was single digit)
      if (parsedQuantity && parsedQuantity > 10) {
        const qtyStr = String(parsedQuantity);
        // Check if it's a two-digit number where both digits are the same (11, 22, 33, 44, 55, 66, 77, 88, 99)
        if (qtyStr.length === 2 && qtyStr[0] === qtyStr[1]) {
          const singleDigit = parseInt(qtyStr[0], 10);
          // Log potential digit duplication for review
          console.warn(`[Quantity Validation] Line ${lineNumber}: Possible digit duplication detected - ${parsedQuantity} might be ${singleDigit}. Flagging for review.`);
          // Flag this in confidence but keep original value (manual review needed)
          if (confidenceData.warnings) {
            confidenceData.warnings.push(`Quantity ${parsedQuantity} may be duplicated digit (check if should be ${singleDigit})`);
          }
          confidenceData.fields.quantity = Math.min(confidenceData.fields.quantity || 0.9, 0.6); // Lower confidence
        }
      }

      validated.push({
        line_number: lineNumber,
        item_no: lineNumber,
        description: item.description || null,
        material: item.material || item.material_spec || null,
        od_mm: item.od_mm || null,
        tk_mm: item.tk_mm || null,
        quantity: parsedQuantity,
        unit: item.unit || null,
        unit_weight_kg: item.unit_weight_kg || null,
        total_weight_kg: item.total_weight_kg || null,
        spec: item.spec || null,
        size1: item.size1 || null,
        size2: item.size2 || null,
        notes: item.notes || null,
        revision: item.revision || null,
        raw_row: item.raw_row || null,
        // Preserve confidence data
        _confidence: confidenceData,
        // Preserve any additional fields
        ...Object.fromEntries(
          Object.entries(item).filter(([key]) =>
            !['line_number', 'item_no', 'description', 'material', 'material_spec', 'od_mm', 'tk_mm', 'quantity', 'unit', 'unit_weight_kg', 'total_weight_kg', 'spec', 'size1', 'size2', 'notes', 'revision', 'raw_row', '_confidence'].includes(key)
          )
        ),
      });
    } else {
      skippedCount++;
      console.warn(`[AI Parse] Skipping item at index ${i} - invalid line_number:`, item.line_number);
    }
  }

  // Log comparison with table analysis
  if (tableAnalysis && tableAnalysis.candidates.length > 0) {
    const totalCandidateRows = tableAnalysis.candidates.reduce((sum, c) => sum + c.numericItemRowCount, 0);
    console.log(`[AI Parse] Table analysis: ${totalCandidateRows} candidate rows detected`);
    console.log(`[AI Parse] AI returned: ${lineItems.length} items, validated: ${validated.length} items`);
    
    if (totalCandidateRows > validated.length) {
      const missingCount = totalCandidateRows - validated.length;
      console.warn(`[AI Parse] WARNING: Candidate rows (${totalCandidateRows}) > validated items (${validated.length}). Some rows may have been dropped.`);
      allWarnings.push(`Missing ${missingCount} line item(s) - extraction may be incomplete`);
    }
  }

  if (skippedCount > 0) {
    console.warn(`[AI Parse] Skipped ${skippedCount} items with invalid line_number`);
    allWarnings.push(`Skipped ${skippedCount} item(s) with invalid line numbers`);
  }

  // Calculate overall extraction confidence
  const avgConfidence = confidenceScores.length > 0
    ? confidenceScores.reduce((sum, c) => sum + c, 0) / confidenceScores.length
    : 0.5; // Default if no confidence data

  // Add summary confidence to validated array
  validated._extraction_confidence = avgConfidence;
  validated._validation_warnings = allWarnings;

  return validated;
}

function isGenericItemValue(value) {
  if (!value) return true;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return true;
  return normalized === 'material_take_off' || normalized === 'material take off';
}

function deriveItemTypeFromDescription(description) {
  if (!description) return null;
  const cleaned = String(description).trim();
  if (!cleaned) return null;
  const commaIndex = cleaned.indexOf(',');
  const base = commaIndex >= 0 ? cleaned.substring(0, commaIndex) : cleaned;
  const token = base.trim();
  return token ? token.toUpperCase() : null;
}

function backfillFromRawItems(lineItems, rawItems) {
  if (!Array.isArray(lineItems) || !Array.isArray(rawItems) || rawItems.length === 0) {
    return lineItems;
  }

  const rawByLine = new Map();
  for (const raw of rawItems) {
    if (raw && raw.line_number) {
      rawByLine.set(raw.line_number, raw);
    }
  }

  return lineItems.map(item => {
    const raw = rawByLine.get(item.line_number);
    if (!raw) return item;

    const description = isGenericItemValue(item.description) ? raw.description : item.description;
    const itemType = isGenericItemValue(item.item_type)
      ? (raw.item_type || raw.description ? deriveItemTypeFromDescription(raw.description) : null)
      : item.item_type;
    const size = item.size || raw.size || raw.size1 || null;
    const unit = item.unit || raw.unit || null;
    const schedule = item.schedule || raw.spec || null;

    return {
      ...item,
      description: description || item.description,
      item_type: itemType || item.item_type || null,
      size,
      unit,
      schedule,
      size1: item.size1 || raw.size1 || null,
      size2: item.size2 || raw.size2 || null,
      notes: item.notes || raw.notes || null,
    };
  });
}

/**
 * Parses RFQ data from structured OCR output using Vertex AI (Gemini)
 * @param {Object} structured - Structured OCR output from Azure Document Intelligence
 * @returns {Promise<Object>} Parsed RFQ data with rfq_metadata and line_items
 */
async function parseRfqWithGemini(structured) {
  // Validate input
  if (!structured || !structured.text) {
    throw new Error('Structured OCR output must contain text');
  }

  // Vertex AI client is initialized on-demand by callGPT4JSON
  // No need for explicit client initialization here

  try {
    // Step 1: Analyze tables to detect line-item tables
    const tables = structured.tables || [];
    let tableAnalysis = null;
    let extractedLineItems = [];
    let mergedTables = [];

    if (tables.length > 0) {
      console.log(`[Tables] Total tables detected by Document Intelligence: ${tables.length}`);
      
      // DEBUG: Print raw Azure DI table data before any processing
      try {
        // Show raw table 3 (or first table if less than 3)
        const debugTableIndex = Math.min(2, tables.length - 1);
        const rawTable = tables[debugTableIndex];
        
        if (rawTable && rawTable.rows) {
          console.log(`[TABLE DEBUG] Raw Azure DI Table ${debugTableIndex + 1} (before processing):`);
          console.log(`[TABLE DEBUG]   Row count: ${rawTable.rowCount}, Column count: ${rawTable.columnCount}`);
          
          // Show first 5 rows from raw DI table
          const sampleRows = rawTable.rows.slice(0, 5);
          sampleRows.forEach((row, idx) => {
            console.log(
              `[TABLE DEBUG]   Raw DI Row ${idx + 1}:`,
              JSON.stringify(row)
            );
          });
        }
      } catch (err) {
        console.error("[TABLE DEBUG] ERROR printing raw Azure DI tables:", err);
      }
      
      console.log(`[Tables] Analyzing for line-item detection...`);
      const candidates = detectLineItemTables(tables);

      tableAnalysis = {
        candidates,
        totalTables: tables.length,
        mergedTables: mergedTables.length,
      };

      console.log(`[Tables] Found ${candidates.length} candidate line-item table(s)`);

      if (candidates.length === 0) {
        console.warn(`[Tables] WARNING: No line-item tables detected. Check table structure and headers.`);
      }

      if (candidates.length > 0) {
        // Log candidates before grouping
        candidates.forEach((candidate, idx) => {
          console.log(`[Tables] Candidate ${idx + 1}: Table index ${candidate.tableIndex + 1}, ${candidate.numericItemRowCount} numeric rows`);
        });

        // Step 1a: Group related tables together
        const groups = groupRelatedLineItemTables(candidates, tables);
        console.log(`[Tables] Grouped ${candidates.length} candidate(s) into ${groups.length} related table group(s)`);

        // Step 1b: Merge each group into a single logical table
        for (let groupIdx = 0; groupIdx < groups.length; groupIdx++) {
          const group = groups[groupIdx];
          const groupCandidates = group.map(idx => candidates[idx]);
          const tableIndices = groupCandidates.map(c => c.tableIndex + 1);

          console.log(`[Tables] Processing group ${groupIdx + 1}/${groups.length}: ${group.length} table(s) [${tableIndices.join(', ')}]`);

          const mergedTable = mergeLineItemTables(group, candidates, tables);

          if (mergedTable) {
            mergedTables.push(mergedTable);
            console.log(`[Tables] ✓ Merged group ${groupIdx + 1}: ${group.length} source table(s) -> ${mergedTable.numericItemRowCount} numeric item rows`);
            console.log(`[Tables]   Source table indices: ${mergedTable.sourceTableIndices.map(t => t + 1).join(', ')}`);
            console.log(`[Tables]   Item numbers range: ${Math.min(...mergedTable.rows.slice(1).map(r => parseInt(r[mergedTable.columnMap.itemIdx] || 0, 10)).filter(n => n > 0))} - ${Math.max(...mergedTable.rows.slice(1).map(r => parseInt(r[mergedTable.columnMap.itemIdx] || 0, 10)).filter(n => n > 0))}`);

            // DEBUG: Print raw table data before AI parsing
            try {
              const candidateTable = mergedTable;
              
              if (candidateTable) {
                console.log("[TABLE DEBUG] Candidate table index:", mergedTable.sourceTableIndices?.[0] ?? 'merged');
                console.log("[TABLE DEBUG] Header row index:", candidateTable.headerRowIndex);
                console.log("[TABLE DEBUG] Data start row index:", candidateTable.dataStartRowIndex);
                console.log("[TABLE DEBUG] Total rows in merged table:", candidateTable.rows?.length || 0);
                
                // Show header row
                if (candidateTable.rows && candidateTable.rows.length > 0) {
                  console.log("[TABLE DEBUG] Header row:", JSON.stringify(candidateTable.rows[0]));
                }
                
                // Show first 5 data rows
                const sampleRows = candidateTable.rows?.slice(
                  candidateTable.dataStartRowIndex || 1,
                  (candidateTable.dataStartRowIndex || 1) + 5
                ) || [];
                
                sampleRows.forEach((row, idx) => {
                  console.log(
                    `[TABLE DEBUG] Row ${idx + 1}:`,
                    JSON.stringify(row)
                  );
                });
              } else {
                console.log("[TABLE DEBUG] No candidate table found for debugging.");
              }
            } catch (err) {
              console.error("[TABLE DEBUG] ERROR printing raw table rows:", err);
            }

            // Extract line items from merged table
            const mergedCandidate = {
              headerRowIndex: mergedTable.headerRowIndex,
              dataStartRowIndex: mergedTable.dataStartRowIndex,
              columnMap: mergedTable.columnMap,
            };
            const items = extractLineItemsFromTable(mergedTable, mergedCandidate);
            console.log(`[Tables]   Extracted ${items.length} raw items from merged table`);

            // DEBUG: Log first extracted item to verify size data
            if (items.length > 0) {
              console.log('[RFQ DEBUG] First parsed item:', JSON.stringify(items[0], null, 2));
            }

            extractedLineItems = extractedLineItems.concat(items);
          } else {
            console.warn(`[Tables] WARNING: Failed to merge group ${groupIdx + 1}`);
          }
        }

        if (extractedLineItems.length > 0) {
          console.log(`[RFQ_HYBRID] Selected table indices: ${candidates.map(c => c.tableIndex + 1).join(', ')}`);
          console.log(`[RFQ_HYBRID] Extracted rawItemsCount: ${extractedLineItems.length}`);
          console.log(`[RFQ_HYBRID] Hybrid mode: true`);
          console.log(`[Tables] Total numeric rows detected across all merged tables: ${extractedLineItems.length}`);
          const lineNumbers = extractedLineItems.map(item => item.line_number).sort((a, b) => a - b);
          const minLine = lineNumbers[0];
          const maxLine = lineNumbers[lineNumbers.length - 1];
          console.log(`[Tables] Line number range: ${minLine} - ${maxLine}`);
          
          // SMART validation: Detect if numbering is sequential vs sparse
          // Sequential (RFQ/PO): 1,2,3,4... - gaps indicate missing items
          // Sparse (MTO/BOQ): 1001, 5005, 6112A... - gaps are normal (section-based numbering)
          const isSequentialPattern = (() => {
            if (lineNumbers.length < 3) return false; // Need at least 3 items to detect pattern
            
            // Check if numbers are mostly consecutive (within 5 of each other)
            let consecutiveCount = 0;
            for (let i = 1; i < lineNumbers.length; i++) {
              const gap = lineNumbers[i] - lineNumbers[i - 1];
              if (gap >= 1 && gap <= 5) { // Consecutive or small gaps
                consecutiveCount++;
              }
            }
            
            // If >70% of gaps are small, it's likely sequential
            return (consecutiveCount / (lineNumbers.length - 1)) > 0.7;
          })();

          if (isSequentialPattern) {
            // Only validate gaps for sequential numbering (RFQ/PO)
            const expectedCount = maxLine - minLine + 1;
            const actualCount = lineNumbers.length;
            if (actualCount < expectedCount) {
              const missing = [];
              for (let i = minLine; i <= maxLine; i++) {
                if (!lineNumbers.includes(i)) {
                  missing.push(i);
                }
              }
              console.warn(`[Tables] ⚠️ WARNING: Missing ${expectedCount - actualCount} line item(s): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ` ... (${missing.length} total)` : ''}`);
            } else if (actualCount === expectedCount) {
              console.log(`[Tables] ✓ Validation: All ${actualCount} items extracted (no gaps)`);
            }
          } else {
            // Sparse numbering (MTO/BOQ) - gaps are normal, just log range
            console.log(`[Tables] Extracted ${lineNumbers.length} items with sparse numbering (range: ${minLine} - ${maxLine}). Gaps are normal for section-based numbering.`);
          }
        } else {
          console.warn(`[Tables] WARNING: No numeric rows extracted from tables!`);
          console.log(`[RFQ_HYBRID] Hybrid mode: false (rawItemsCount = 0)`);
        }
      }
    } else {
      console.log(`[Tables] No tables detected in document - will rely on text extraction only`);
    }

    // Step 2: Build prompt with table analysis, merged tables, and raw items
    console.log(`[AI Parse] Building prompt for Vertex AI (Gemini)...`);
    console.log(`[AI Parse] Hybrid mode: ${extractedLineItems.length > 0 ? 'YES' : 'NO'} (${extractedLineItems.length} raw items)`);

    const prompt = buildRfqParsingPrompt(structured, tableAnalysis, mergedTables, extractedLineItems);
    const promptId = 'RFQ_EXTRACT_V1'; // Dynamic prompt built by buildRfqParsingPrompt function

    const { logInfo, logError } = require('../utils/logger');
    logInfo('rfq_extraction_ai_call_start', {
      promptId: promptId,
      hybridMode: extractedLineItems.length > 0,
      rawItemsCount: extractedLineItems.length,
      tableCount: structured.tables?.length || 0
    });

    console.log('[AI Parse] Calling Vertex AI (Gemini)...');
    console.log(`[AI Parse] Prompt length: ${prompt.length} characters`);

    // Calculate max_tokens using the new token planning helper
    const lineItemsCount = extractedLineItems.length;
    const tableCount = structured.tables?.length || 0;

    // Optional warning for very large RFQs
    if (lineItemsCount > 1000) {
      console.warn(
        `[AI Parse] WARNING: Very large RFQ detected (${lineItemsCount} items). Results may be truncated or require future batching.`
      );
    }

    // Smart token allocation:
    // 1. If we have extracted line items, use dynamic calculation
    // 2. If no line items BUT multiple tables detected (2+), assume it's a large MTO/RFQ that needs max tokens
    // 3. Otherwise, use default for simple text-only parsing
    let maxTokens;
    if (lineItemsCount > 0) {
      maxTokens = calculateMaxTokensForRfq(lineItemsCount);
      console.log(`[AI Parse] Token planning: Using calculated tokens based on ${lineItemsCount} line items`);
    } else if (tableCount >= 2) {
      // Use full capacity for multi-table documents (Gemini 3 Pro = 60K, Gemini 2.0 Flash = 7.5K)
      maxTokens = calculateMaxTokensForRfq(200); // Assume ~200 items for large table-based docs
      console.log(`[AI Parse] Token planning: Multiple tables detected (${tableCount}) with no line items - using ${maxTokens} tokens`);
    } else {
      maxTokens = calculateMaxTokensForRfq(50); // Default for text-only parsing
      console.log(`[AI Parse] Token planning: Single/no table detected - using default tokens`);
    }

    console.log(
      `[AI Parse] Token planning: line items = ${lineItemsCount}, tables = ${tableCount}, max completion tokens = ${maxTokens}`
    );
    console.log(`[AI Parse] Max tokens: ${maxTokens} (based on ${lineItemsCount} line items)`);

    // Check if document is too large for single extraction
    // Use chunked extraction for very large documents (>20 tables or prompt >60k chars)
    const shouldUseChunkedExtraction = tableCount > 20 || prompt.length > 60000;

    let parsed;

    if (shouldUseChunkedExtraction) {
      console.warn(`⚠️  Large document detected (${tableCount} tables, ${prompt.length} chars)`);
      console.warn(`⚠️  This document exceeds Gemini output token limits - switching to CHUNKED EXTRACTION`);

      // Use chunked extraction for large documents
      const { createDocumentChunks } = require('../utils/documentChunker');
      const { callGPT4JSONChunked } = require('./gcp/genaiClient');

      // Create chunks based on page count from structured data
      const pageCount = structured?.rawPages || structured?.pageCount || 32;
      const chunks = createDocumentChunks({
        text: structured?.text || '',
        pages: structured?.pages || [],
        pageCount: pageCount
      });

      console.log(`📚 Created ${chunks.length} chunks for processing`);

      // Filter tables BEFORE passing to chunked extraction
      // This ensures we start with the same filtered set that was used in the prompt
      const filteredTablesForChunking = filterVdrlAndAdminTables(structured.tables || []);
      console.log(`[AI Parse] Pre-filtering tables for chunked extraction: ${structured.tables?.length || 0} → ${filteredTablesForChunking.length} tables`);

      // Pass tables for per-chunk filtering
      // Tables will be filtered in callGPT4JSONChunked based on chunk page ranges
      const messages = [
        {
          role: 'user',
          content: prompt,
        },
      ];

      parsed = await callGPT4JSONChunked(messages, {
        temperature: 0.1,
        maxTokens: 32000, // Gemini 2.5 Pro max output tokens (supports up to 64K)
        chunks: chunks,
        tables: filteredTablesForChunking // Pass FILTERED tables instead of original
      });

      console.log(`✅ Chunked extraction complete: ${parsed.items?.length || 0} items extracted`);
    } else {
      // Standard single-shot extraction for smaller documents
      const messages = [
        {
          role: 'user',
          content: prompt,
        },
      ];

      parsed = await callGPT4JSON(messages, {
        temperature: 0.1, // Low temperature for more deterministic output
        maxTokens: maxTokens,
      });
    }

    console.log('[AI Parse] Received response from Vertex AI (Gemini)');
    console.log(`[AI Parse] Response received and parsed successfully`);

    logInfo('rfq_extraction_ai_call_end', {
      promptId: promptId,
      responseLength: JSON.stringify(parsed).length
    });

    // Step 3: Validate parsed JSON response
    console.log('[AI Parse] Validating parsed JSON response...');

    if (!parsed) {
      console.error('[AI Parse] Failed to receive valid JSON from Vertex AI');
      throw new Error('No valid JSON response returned from Vertex AI');
    }

    // Step 4: Validate structure - ensure it has the expected format
    if (!parsed.rfq_metadata && !parsed.header) {
      throw new Error('AI response missing required fields: rfq_metadata or header');
    }

    if (!parsed.line_items && !parsed.items) {
      throw new Error('AI response missing required fields: line_items or items');
    }

    // Step 5: Normalize response structure to always use rfq_metadata and line_items
    const rfq_metadata = parsed.rfq_metadata || parsed.header || {};
    let line_items = parsed.line_items || parsed.items || [];

    // Step 6: Validate and normalize line items
    line_items = validateAndNormalizeLineItems(line_items, tableAnalysis);
    // Hybrid fallback: use raw table extraction to backfill generic/missing fields
    if (extractedLineItems.length > 0) {
      line_items = backfillFromRawItems(line_items, extractedLineItems);
    }

    const rfqReference = rfq_metadata?.rfq_reference || rfq_metadata?.rfq_number || null;
    if (rfqReference) {
      line_items = line_items.map(item => ({
        ...item,
        rfq_reference: item.rfq_reference || rfqReference
      }));
    }

    // Step 7: Hybrid mode validation - ensure AI returned correct number of items
    let expectedRows = 0;
    let detectedNumericRows = 0; // Track detected numeric rows from table analysis
    const extractionWarnings = [];
    let extractionConfidenceLevel = 'high';

    // Get detected numeric rows count from table analysis (raw candidate total)
    let rawCandidateRowsTotal = 0;
    if (tableAnalysis && tableAnalysis.candidates.length > 0) {
      rawCandidateRowsTotal = tableAnalysis.candidates.reduce((sum, c) => sum + c.numericItemRowCount, 0);
      detectedNumericRows = rawCandidateRowsTotal; // Keep for backward compatibility
      console.log(`[RFQ_COMPLETENESS] Raw candidate rows total: ${rawCandidateRowsTotal} (sum across ${tableAnalysis.candidates.length} accepted tables)`);
    }

    if (extractedLineItems.length > 0) {
      expectedRows = extractedLineItems.length;
      const mergedUniqueRows = extractedLineItems.length; // Post merge/dedupe baseline
      
      // Log both raw and merged counts for debugging
      if (rawCandidateRowsTotal > 0 && rawCandidateRowsTotal > mergedUniqueRows) {
        const deduplicatedCount = rawCandidateRowsTotal - mergedUniqueRows;
        console.log(`[RFQ_COMPLETENESS] Merge deduplication: ${rawCandidateRowsTotal} candidate rows -> ${mergedUniqueRows} unique items (${deduplicatedCount} duplicates removed)`);
      } else if (rawCandidateRowsTotal > 0) {
        console.log(`[RFQ_COMPLETENESS] No deduplication needed: ${rawCandidateRowsTotal} candidate rows = ${mergedUniqueRows} unique items`);
      }
      const actualCount = line_items.length;

      console.log(`[AI Parse] Hybrid mode validation: expected ${expectedRows} items, AI returned ${actualCount} items`);

      if (actualCount !== expectedRows) {
        console.warn(`[AI Parse] WARNING: Row count mismatch! Expected ${expectedRows}, got ${actualCount}`);
        console.warn(`[AI Parse] AI may have added, removed, or merged rows despite instructions`);

        // Safety net: Merge with extracted items to ensure we have all rows
        const aiLineNumbers = new Set(line_items.map(item => item.line_number));
        const missingItems = extractedLineItems.filter(item => !aiLineNumbers.has(item.line_number));

        if (missingItems.length > 0) {
          console.log(`[AI Parse] Safety net: Adding ${missingItems.length} missing items from table extraction`);
          line_items = line_items.concat(missingItems);
          // Re-sort by line_number
          line_items.sort((a, b) => a.line_number - b.line_number);
        }

        // Check for extra items (AI hallucinated or merged rows incorrectly)
        if (actualCount > expectedRows) {
          console.warn(`[AI Parse] AI returned more items than expected. Review may be needed.`);
        }
      } else {
        console.log(`[AI Parse] ✓ Row count validation passed: ${actualCount} items as expected`);
      }
    } else {
      // Fallback mode: AI did extraction, just verify we got reasonable results
      console.log(`[AI Parse] Fallback mode: AI performed full extraction (${line_items.length} items)`);
      
      // For fallback mode, use raw candidate rows but log it's an estimate
      if (rawCandidateRowsTotal > 0) {
        expectedRows = rawCandidateRowsTotal;
        console.log(`[RFQ_COMPLETENESS] Fallback mode: Using raw candidate rows (${rawCandidateRowsTotal}) as baseline estimate (may overcount duplicates)`);
      }
    }

    // Enhanced safety net: If detectedNumericRows > extractedItems, try to identify missing line numbers
    // This helps catch cases where extraction filtered rows but detection counted them
    if (detectedNumericRows > 0 && line_items.length < detectedNumericRows) {
      const extractedLineNumbers = new Set(line_items.map(item => item.line_number));
      const extractedLineItemsNumbers = new Set(extractedLineItems.map(item => item.line_number));
      
      // Find line numbers that were detected but not extracted
      const missingFromExtraction = [];
      if (tableAnalysis && tableAnalysis.candidates.length > 0) {
        // Try to reconstruct expected line number range from candidates
        for (const candidate of tableAnalysis.candidates) {
          // We can't reconstruct exact line numbers without the table data,
          // but we can at least log the gap
        }
      }
      
      if (extractedLineItems.length > 0) {
        const missingFromHybrid = extractedLineItems.filter(item => !extractedLineNumbers.has(item.line_number));
        if (missingFromHybrid.length > 0) {
          console.log(`[AI Parse] Enhanced safety net: Found ${missingFromHybrid.length} items from hybrid extraction that AI missed`);
          line_items = line_items.concat(missingFromHybrid);
          line_items.sort((a, b) => a.line_number - b.line_number);
        }
      }
    }

    // Step 8: Extraction completeness gate (BLOCKING)
    // For hybrid mode: use extractedLineItems.length (merged table count after deduplication)
    // For fallback mode: use rawCandidateRowsTotal (candidate count before merging, with warning)
    // This is critical because merge deduplicates by item number, so candidate count may be higher
    const completenessBaseRows = extractedLineItems.length > 0 
      ? extractedLineItems.length  // Hybrid mode: use merged/extracted count (after deduplication)
      : (rawCandidateRowsTotal > 0 ? rawCandidateRowsTotal : expectedRows);  // Fallback: use raw candidate count (estimate)
    const extractedItems = line_items.length;
    
    if (completenessBaseRows > 0) {
      const coverageRatio = Math.min(1.0, extractedItems / completenessBaseRows);
      const missingCount = completenessBaseRows - extractedItems;
      const baselineType = extractedLineItems.length > 0 ? 'merged unique' : 'raw candidate estimate';
      console.log(`[RFQ_COMPLETENESS] Base rows: ${completenessBaseRows} (${baselineType}), Extracted items: ${extractedItems}, Coverage ratio: ${(coverageRatio * 100).toFixed(1)}%`);
      if (rawCandidateRowsTotal > 0 && extractedLineItems.length > 0) {
        console.log(`[RFQ_COMPLETENESS] Debug: rawCandidateRowsTotal=${rawCandidateRowsTotal}, mergedUniqueRows=${extractedLineItems.length}, extractedItems=${extractedItems}`);
      }

      // BLOCKING: Fail if coverage < 80% for documents with >= 10 rows
      if (completenessBaseRows >= 10 && coverageRatio < 0.8) {
        const errorMessage = `Extraction completeness check FAILED: Expected ${completenessBaseRows} line items (from ${extractedLineItems.length > 0 ? 'merged table' : 'table detection'}) but only extracted ${extractedItems} line items (${(coverageRatio * 100).toFixed(1)}% coverage). Missing ${missingCount} item(s). This indicates incomplete extraction - some rows were filtered or skipped during processing.`;
        console.error(`[RFQ_COMPLETENESS] BLOCKING ERROR: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      // BLOCKING: Fail if severe under-extraction (>= 20 rows detected but < 10 extracted)
      if (completenessBaseRows >= 20 && extractedItems < 10) {
        const errorMessage = `Severe under-extraction detected: Expected ${completenessBaseRows} numeric rows but only extracted ${extractedItems} items. Extraction appears to have failed.`;
        console.error(`[RFQ_COMPLETENESS] BLOCKING ERROR: ${errorMessage}`);
        throw new Error(errorMessage);
      }
      
      // WARN (non-blocking): Significant gap between detected and extracted
      if (completenessBaseRows > extractedItems && missingCount >= 5) {
        const gapWarning = `Extraction gap detected: ${completenessBaseRows} numeric rows detected but only ${extractedItems} items extracted. ${missingCount} rows may have been filtered or skipped.`;
        extractionWarnings.push(gapWarning);
        console.warn(`[RFQ_COMPLETENESS] WARNING: ${gapWarning}`);
        extractionConfidenceLevel = 'low';
      }
    }

    console.log(`[AI Parse] Successfully parsed ${line_items.length} line items`);

    // Calculate overall extraction confidence
    let extractionConfidence = line_items._extraction_confidence || 0.7;
    const validationWarnings = line_items._validation_warnings || [];
    
    // Reduce confidence if completeness gate detected issues
    if (extractionConfidenceLevel === 'low') {
      extractionConfidence = Math.min(extractionConfidence, 0.5);
    }
    
    // Merge completeness warnings with validation warnings
    const allWarnings = [...validationWarnings, ...extractionWarnings];
    
    // Calculate table detection confidence if available
    let tableDetectionConfidence = null;
    if (tableAnalysis && tableAnalysis.candidates.length > 0) {
      const avgTableConfidence = tableAnalysis.candidates.reduce((sum, c) => 
        sum + (c.confidence || 0.7), 0) / tableAnalysis.candidates.length;
      tableDetectionConfidence = avgTableConfidence;
    }

    // Log confidence summary
    console.log(`[AI Parse] Extraction confidence: ${(extractionConfidence * 100).toFixed(1)}% (level: ${extractionConfidenceLevel})`);
    if (allWarnings.length > 0) {
      console.log(`[AI Parse] Validation warnings: ${allWarnings.length}`);
      allWarnings.slice(0, 5).forEach(warning => {
        console.log(`[AI Parse]   - ${warning}`);
      });
      if (allWarnings.length > 5) {
        console.log(`[AI Parse]   ... and ${allWarnings.length - 5} more warnings`);
      }
    }

    return {
      rfq_metadata,
      line_items,
      _confidence: {
        extraction: extractionConfidence,
        extraction_level: extractionConfidenceLevel,
        table_detection: tableDetectionConfidence,
        validation_warnings: allWarnings,
        item_count: line_items.length,
        warnings_count: allWarnings.length,
        expected_rows: completenessBaseRows > 0 ? completenessBaseRows : expectedRows,
        detected_numeric_rows: detectedNumericRows,
        coverage_ratio: completenessBaseRows > 0 ? Math.min(1.0, extractedItems / completenessBaseRows) : (expectedRows > 0 ? Math.min(1.0, extractedItems / expectedRows) : null),
      },
      _debug: {
        model: 'gemini-2.0-flash-exp',
        tableAnalysis: tableAnalysis ? {
          candidatesCount: tableAnalysis.candidates.length,
          mergedTablesCount: mergedTables.length,
          extractedFromTables: extractedLineItems.length,
          avgTableConfidence: tableDetectionConfidence,
        } : null,
        hybridMode: extractedLineItems.length > 0,
        rawItemsCount: extractedLineItems.length,
      },
    };
  } catch (error) {
    // Log detailed error information for debugging
    console.error('[AI Parse] Error parsing RFQ with Vertex AI:', error);
    console.error('[AI Parse] Error name:', error.name);
    console.error('[AI Parse] Error message:', error.message);

    // Log stack trace for debugging
    if (error.stack) {
      console.error('[AI Parse] Error stack:', error.stack);
    }

    // Re-throw with a clear error message
    if (error.message && (error.message.includes('Vertex AI') || error.message.includes('Gemini'))) {
      // Already has a clear message
      throw error;
    }
    throw new Error(`AI parsing failed: ${error.message}`);
  }
}

module.exports = {
  parseRfqWithGemini,
  // Export helper functions for testing
  normalizeHeader,
  isItemNumberColumn,
  isDescriptionColumn,
  isQuantityColumn,
  isUnitColumn,
  isSpecColumn,
  isNotesColumn,
  isRevisionColumn,
  extractLineItemsFromTable,
  // Export for testing LAYER 2 defense
  extractJsonFromText,
  sanitizeJsonText,
};
