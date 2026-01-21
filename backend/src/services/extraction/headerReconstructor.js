/**
 * Header Reconstruction Service
 *
 * Fixes broken table headers from malformed PDFs where:
 * - Headers are split across multiple cells
 * - OCR reads partial text
 * - Merged cells cause header corruption
 *
 * Example Problem:
 * Expected: ["Item", "Description", "Qty", "Unit"]
 * Got:      ["ngs ad wi", "nd transmittals", "age and SIDOR", ...]
 *
 * This module uses FUZZY MATCHING and PARTIAL KEYWORD DETECTION
 * instead of strict regex matching.
 */

/**
 * Calculate similarity between two strings (0-1 scale)
 * Uses Levenshtein distance-based similarity
 * @param {string} str1
 * @param {string} str2
 * @returns {number} Similarity score (0 = no match, 1 = exact match)
 */
function stringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1
 * @param {string} str2
 * @returns {number} Edit distance
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Check if a broken header contains a keyword (partial match)
 * @param {string} brokenHeader - Malformed header text
 * @param {string[]} keywords - Keywords to search for
 * @param {number} threshold - Minimum similarity (0-1)
 * @returns {{matched: boolean, keyword: string|null, score: number}}
 */
function containsKeyword(brokenHeader, keywords, threshold = 0.6) {
  if (!brokenHeader) return { matched: false, keyword: null, score: 0 };

  const normalized = brokenHeader.toLowerCase().trim();
  let bestMatch = { matched: false, keyword: null, score: 0 };

  for (const keyword of keywords) {
    // STRATEGY 1: Direct substring match (fastest, most reliable)
    if (normalized.includes(keyword.toLowerCase())) {
      return { matched: true, keyword, score: 1.0 };
    }

    // STRATEGY 2: Fuzzy similarity
    const similarity = stringSimilarity(normalized, keyword.toLowerCase());
    if (similarity >= threshold && similarity > bestMatch.score) {
      bestMatch = { matched: true, keyword, score: similarity };
    }

    // STRATEGY 3: Partial word match (for split headers like "Ite m" or "Descr iption")
    const headerWords = normalized.split(/\s+/);
    const keywordWords = keyword.toLowerCase().split(/\s+/);

    for (const hw of headerWords) {
      for (const kw of keywordWords) {
        if (hw.startsWith(kw.substring(0, Math.max(3, kw.length - 2)))) {
          // Match if header word starts with most of keyword
          // Example: "descr" matches "description"
          const score = 0.8;
          if (score > bestMatch.score) {
            bestMatch = { matched: true, keyword, score };
          }
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Fuzzy match for item number columns
 * @param {string} header - Column header text
 * @returns {{matched: boolean, confidence: number, reason: string}}
 */
function fuzzyMatchItemNumber(header) {
  const keywords = ['item', 'no', 'number', 'line', 'line no', 'line number', 'item no', '#', 'pos'];
  const result = containsKeyword(header, keywords, 0.6);

  return {
    matched: result.matched,
    confidence: result.score,
    reason: result.matched ? `partial_match: "${header}" ≈ "${result.keyword}"` : 'no_match'
  };
}

/**
 * Fuzzy match for description columns
 * @param {string} header - Column header text
 * @returns {{matched: boolean, confidence: number, reason: string}}
 */
function fuzzyMatchDescription(header) {
  const keywords = [
    'description', 'desc', 'detail', 'material', 'item description',
    'specification', 'spec', 'material description'
  ];
  const result = containsKeyword(header, keywords, 0.6);

  return {
    matched: result.matched,
    confidence: result.score,
    reason: result.matched ? `partial_match: "${header}" ≈ "${result.keyword}"` : 'no_match'
  };
}

/**
 * Fuzzy match for quantity columns
 * @param {string} header - Column header text
 * @returns {{matched: boolean, confidence: number, reason: string}}
 */
function fuzzyMatchQuantity(header) {
  const keywords = [
    'qty', 'quantity', 'quant', 'pcs', 'round quantity', 'total quantity',
    'nett quantity', 'net quantity'
  ];
  const result = containsKeyword(header, keywords, 0.6);

  return {
    matched: result.matched,
    confidence: result.score,
    reason: result.matched ? `partial_match: "${header}" ≈ "${result.keyword}"` : 'no_match'
  };
}

/**
 * Fuzzy match for unit columns
 * @param {string} header - Column header text
 * @returns {{matched: boolean, confidence: number, reason: string}}
 */
function fuzzyMatchUnit(header) {
  const keywords = ['unit', 'uom', 'unit of measure', 'u.o.m'];
  const result = containsKeyword(header, keywords, 0.6);

  return {
    matched: result.matched,
    confidence: result.score,
    reason: result.matched ? `partial_match: "${header}" ≈ "${result.keyword}"` : 'no_match'
  };
}

/**
 * Attempt to reconstruct column mapping from broken headers
 * @param {string[]} brokenHeaders - Array of malformed header strings
 * @returns {{columnMap: object, confidence: number, diagnostics: object}}
 */
function reconstructColumnMapping(brokenHeaders) {
  console.log('[HEADER_RECONSTRUCT] Attempting fuzzy header reconstruction...');
  console.log('[HEADER_RECONSTRUCT] Input headers:', JSON.stringify(brokenHeaders.slice(0, 10)));

  const columnMap = {
    itemIdx: -1,
    descriptionIdx: -1,
    quantityIdx: -1,
    unitIdx: -1,
    specIdx: -1,
    size1Idx: -1,
    size2Idx: -1,
    notesIdx: -1,
  };

  const diagnostics = {
    totalHeaders: brokenHeaders.length,
    matches: [],
    confidenceScores: []
  };

  // Try fuzzy matching for each column
  for (let colIdx = 0; colIdx < brokenHeaders.length; colIdx++) {
    const header = (brokenHeaders[colIdx] || '').trim();
    if (!header) continue;

    // Try matching item number
    const itemMatch = fuzzyMatchItemNumber(header);
    if (itemMatch.matched && itemMatch.confidence >= 0.6 && columnMap.itemIdx < 0) {
      columnMap.itemIdx = colIdx;
      diagnostics.matches.push({ col: colIdx, type: 'item', confidence: itemMatch.confidence, reason: itemMatch.reason });
      console.log(`[HEADER_RECONSTRUCT] ✅ Item column found at index ${colIdx}: "${header}" (confidence: ${itemMatch.confidence.toFixed(2)})`);
    }

    // Try matching description
    const descMatch = fuzzyMatchDescription(header);
    if (descMatch.matched && descMatch.confidence >= 0.6 && columnMap.descriptionIdx < 0) {
      columnMap.descriptionIdx = colIdx;
      diagnostics.matches.push({ col: colIdx, type: 'description', confidence: descMatch.confidence, reason: descMatch.reason });
      console.log(`[HEADER_RECONSTRUCT] ✅ Description column found at index ${colIdx}: "${header}" (confidence: ${descMatch.confidence.toFixed(2)})`);
    }

    // Try matching quantity
    const qtyMatch = fuzzyMatchQuantity(header);
    if (qtyMatch.matched && qtyMatch.confidence >= 0.6 && columnMap.quantityIdx < 0) {
      columnMap.quantityIdx = colIdx;
      diagnostics.matches.push({ col: colIdx, type: 'quantity', confidence: qtyMatch.confidence, reason: qtyMatch.reason });
      console.log(`[HEADER_RECONSTRUCT] ✅ Quantity column found at index ${colIdx}: "${header}" (confidence: ${qtyMatch.confidence.toFixed(2)})`);
    }

    // Try matching unit
    const unitMatch = fuzzyMatchUnit(header);
    if (unitMatch.matched && unitMatch.confidence >= 0.6 && columnMap.unitIdx < 0) {
      columnMap.unitIdx = colIdx;
      diagnostics.matches.push({ col: colIdx, type: 'unit', confidence: unitMatch.confidence, reason: unitMatch.reason });
      console.log(`[HEADER_RECONSTRUCT] ✅ Unit column found at index ${colIdx}: "${header}" (confidence: ${unitMatch.confidence.toFixed(2)})`);
    }
  }

  // Calculate overall confidence
  const hasDescription = columnMap.descriptionIdx >= 0;
  const hasQuantity = columnMap.quantityIdx >= 0;
  const hasItem = columnMap.itemIdx >= 0;
  const hasUnit = columnMap.unitIdx >= 0;

  const coreFieldsFound = [hasDescription, hasQuantity].filter(Boolean).length;
  const boostFieldsFound = [hasItem, hasUnit].filter(Boolean).length;

  const confidence = (coreFieldsFound * 0.4) + (boostFieldsFound * 0.1);

  diagnostics.confidenceScores = diagnostics.matches.map(m => m.confidence);
  diagnostics.hasMinimumFields = coreFieldsFound >= 2;
  diagnostics.coreFieldsFound = coreFieldsFound;
  diagnostics.boostFieldsFound = boostFieldsFound;

  console.log(`[HEADER_RECONSTRUCT] Reconstruction complete: confidence=${confidence.toFixed(2)}, core fields=${coreFieldsFound}/2, boost=${boostFieldsFound}/2`);

  return {
    columnMap,
    confidence,
    diagnostics
  };
}

module.exports = {
  reconstructColumnMapping,
  fuzzyMatchItemNumber,
  fuzzyMatchDescription,
  fuzzyMatchQuantity,
  fuzzyMatchUnit,
  stringSimilarity,
  containsKeyword
};
