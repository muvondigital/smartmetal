/**
 * Document Chunking Utility for Large PDF Processing
 *
 * Implements intelligent chunking strategy to handle documents that exceed
 * Gemini's token limits (1M input tokens, 65K output tokens for Gemini 3 Pro Preview).
 *
 * Strategy:
 * - Split documents into overlapping chunks (20-25 pages per chunk)
 * - Add 2-page overlap to prevent data loss at boundaries
 * - Process each chunk independently with Gemini 3 Pro Preview
 * - Merge results with deduplication and sequencing
 */

const { validateAndFixQuantities } = require('./quantityValidator');

/**
 * Configuration for chunking strategy
 */
const CHUNKING_CONFIG = {
  PAGES_PER_CHUNK: 4,          // Reduced to 4 pages per chunk for dense MTO documents
  OVERLAP_PAGES: 1,            // 1-page overlap to prevent boundary issues
  MIN_CHUNK_SIZE: 3,           // Minimum pages to warrant chunking
  MAX_CHUNK_SIZE: 5,           // Max chunk size to stay well under 32K token limit
  MAX_TOTAL_PAGES: 200,        // Maximum pages to process (safety limit)
  MAX_CHUNKS: 50,              // Increased to accommodate more smaller chunks
  ENABLE_PARALLEL: false       // Process chunks in parallel (future optimization)
};

/**
 * Split document text/images into processable chunks
 *
 * @param {Object} documentData - Extracted document data
 * @param {string} documentData.text - Full document text
 * @param {Array<Object>} documentData.pages - Array of page data (if available)
 * @param {number} documentData.pageCount - Total number of pages
 * @returns {Array<Object>} Array of chunk objects
 */
function createDocumentChunks(documentData) {
  const { text, pages, pageCount } = documentData;

  // Safety check: Warn about very large documents
  if (pageCount > CHUNKING_CONFIG.MAX_TOTAL_PAGES) {
    console.warn(`⚠️  Document has ${pageCount} pages, exceeding recommended limit of ${CHUNKING_CONFIG.MAX_TOTAL_PAGES}`);
    console.warn(`   Processing may take a long time and incur high API costs`);
    throw new Error(`Document too large: ${pageCount} pages exceeds maximum of ${CHUNKING_CONFIG.MAX_TOTAL_PAGES} pages`);
  }

  // If document is small enough, return single chunk
  if (pageCount <= CHUNKING_CONFIG.MIN_CHUNK_SIZE) {
    return [{
      chunkIndex: 0,
      totalChunks: 1,
      startPage: 1,
      endPage: pageCount,
      pageRange: `1-${pageCount}`,
      text: text,
      pages: pages || [],
      isFirstChunk: true,
      isLastChunk: true
    }];
  }

  const chunks = [];
  const pagesPerChunk = CHUNKING_CONFIG.PAGES_PER_CHUNK;
  const overlap = CHUNKING_CONFIG.OVERLAP_PAGES;

  let currentPage = 1;
  let chunkIndex = 0;

  while (currentPage <= pageCount) {
    // Safety check: Prevent excessive chunks
    if (chunkIndex >= CHUNKING_CONFIG.MAX_CHUNKS) {
      console.warn(`⚠️  Chunk limit reached (${CHUNKING_CONFIG.MAX_CHUNKS} chunks)`);
      console.warn(`   Remaining pages (${currentPage}-${pageCount}) will be skipped`);
      break;
    }

    const startPage = currentPage;
    const endPage = Math.min(currentPage + pagesPerChunk - 1, pageCount);

    // Extract text for this page range
    const chunkText = extractTextForPageRange(text, startPage, endPage, pageCount);
    const chunkPages = pages ? pages.slice(startPage - 1, endPage) : [];

    chunks.push({
      chunkIndex: chunkIndex,
      totalChunks: 0, // Will be updated after loop
      startPage: startPage,
      endPage: endPage,
      pageRange: `${startPage}-${endPage}`,
      text: chunkText,
      pages: chunkPages,
      isFirstChunk: chunkIndex === 0,
      isLastChunk: false // Will be updated
    });

    // Move to next chunk with overlap consideration
    currentPage = endPage + 1 - overlap;

    // Prevent infinite loop if overlap is too large
    if (currentPage <= startPage) {
      currentPage = endPage + 1;
    }

    chunkIndex++;
  }

  // Update total chunks and mark last chunk
  const totalChunks = chunks.length;
  chunks.forEach((chunk, idx) => {
    chunk.totalChunks = totalChunks;
    chunk.isLastChunk = (idx === totalChunks - 1);
  });

  // Log chunking summary for large documents
  if (totalChunks > 5) {
    console.log(`📚 Large document chunking summary:`);
    console.log(`   Total pages: ${pageCount}`);
    console.log(`   Total chunks: ${totalChunks}`);
    console.log(`   Estimated processing time: ${totalChunks * 4}s`);
    console.log(`   Estimated cost: $${(totalChunks * 0.06).toFixed(2)}`);
  }

  return chunks;
}

/**
 * Extract text content for a specific page range
 *
 * @param {string} fullText - Complete document text
 * @param {number} startPage - Starting page number (1-indexed)
 * @param {number} endPage - Ending page number (1-indexed)
 * @param {number} totalPages - Total pages in document
 * @returns {string} Extracted text for page range
 */
function extractTextForPageRange(fullText, startPage, endPage, totalPages) {
  // If we don't have page markers, use proportional splitting
  const pageMarkerRegex = /\n\s*---\s*PAGE\s+(\d+)\s*---\s*\n/gi;
  const hasPageMarkers = pageMarkerRegex.test(fullText);

  if (!hasPageMarkers) {
    // Proportional split (rough approximation)
    const textLength = fullText.length;
    const startPos = Math.floor((startPage - 1) / totalPages * textLength);
    const endPos = Math.floor(endPage / totalPages * textLength);
    return fullText.substring(startPos, endPos);
  }

  // Extract using page markers
  const lines = fullText.split('\n');
  let currentPage = 1;
  let extracting = false;
  const extractedLines = [];

  for (const line of lines) {
    const match = line.match(/---\s*PAGE\s+(\d+)\s*---/i);
    if (match) {
      currentPage = parseInt(match[1], 10);
      extracting = (currentPage >= startPage && currentPage <= endPage);
      continue;
    }

    if (extracting) {
      extractedLines.push(line);
    }
  }

  return extractedLines.join('\n');
}

/**
 * Merge extraction results from multiple chunks
 *
 * Handles:
 * - Deduplication of items appearing in overlapping regions
 * - Proper sequencing of line items
 * - Metadata consolidation (prefer first chunk)
 * - Confidence score aggregation
 *
 * @param {Array<Object>} chunkResults - Array of extraction results from each chunk
 * @param {Array<Object>} chunks - Original chunk metadata
 * @returns {Object} Merged extraction result
 */
function mergeChunkResults(chunkResults, chunks) {
  if (!chunkResults || chunkResults.length === 0) {
    throw new Error('No chunk results to merge');
  }

  // Single chunk - return as is
  if (chunkResults.length === 1) {
    return {
      ...chunkResults[0],
      _chunking: {
        enabled: false,
        totalChunks: 1,
        itemsPerChunk: [chunkResults[0].line_items?.length || 0]
      }
    };
  }

  // Merge metadata (prefer first chunk)
  const mergedMetadata = { ...chunkResults[0].rfq_metadata };

  // Check for failed chunks (CRITICAL: Detect silent data loss)
  const failedChunks = [];
  for (let i = 0; i < chunkResults.length; i++) {
    if (chunkResults[i]._error) {
      failedChunks.push({
        chunkIndex: i,
        pageRange: chunks[i]?.pageRange || 'unknown',
        error: chunkResults[i]._error
      });
    }
  }

  if (failedChunks.length > 0) {
    console.error(`⚠️ CRITICAL: ${failedChunks.length} chunk(s) failed during extraction!`);
    failedChunks.forEach(fc => {
      console.error(`   Chunk ${fc.chunkIndex + 1} (pages ${fc.pageRange}): ${fc.error}`);
    });
  }

  // Merge line items with CHUNK-AWARE deduplication
  // CRITICAL: Only merge items from ADJACENT chunks (overlapping pages)
  // Items from non-adjacent chunks are separate line items, not duplicates
  let duplicateCount = 0;

  // First pass: collect all items with their chunk indices
  const allItemsWithChunks = [];
  for (let i = 0; i < chunkResults.length; i++) {
    const result = chunkResults[i];
    const chunk = chunks[i];
    const items = result.line_items || [];

    for (const item of items) {
      allItemsWithChunks.push({
        item: { ...item, _chunk_source: { chunkIndex: i, pageRange: chunk.pageRange } },
        chunkIndex: i,
        pageRange: chunk.pageRange,
        itemKey: createItemKey(item)
      });
    }
  }

  // Second pass: deduplicate only adjacent chunks
  // Group by itemKey, then within each group, merge only adjacent chunk items
  const itemsByKey = new Map();

  for (const entry of allItemsWithChunks) {
    const { item, chunkIndex, pageRange, itemKey } = entry;

    if (!itemsByKey.has(itemKey)) {
      itemsByKey.set(itemKey, []);
    }

    const existingGroup = itemsByKey.get(itemKey);

    // Check if any existing item in the group is from an adjacent chunk
    let merged = false;
    for (let j = 0; j < existingGroup.length; j++) {
      const existing = existingGroup[j];
      // Adjacent chunks have indices that differ by 1 (they share overlapping pages)
      if (Math.abs(existing.chunkIndex - chunkIndex) <= 1) {
        // Merge with this item (true duplicate from overlapping region)
        existingGroup[j] = {
          item: mergeItems(existing.item, item),
          chunkIndex: Math.max(existing.chunkIndex, chunkIndex),
          pageRange: pageRange
        };
        merged = true;
        duplicateCount++;
        console.log(`[Chunk Merge] Merged adjacent duplicate (chunks ${existing.chunkIndex}-${chunkIndex}): ${itemKey.substring(0, 50)}...`);
        break;
      }
    }

    if (!merged) {
      // No adjacent chunk found - add as new item (separate line item in document)
      existingGroup.push({
        item,
        chunkIndex,
        pageRange
      });
    }
  }

  // Flatten the groups into final list
  let allLineItems = [];
  for (const group of itemsByKey.values()) {
    for (const entry of group) {
      allLineItems.push(entry.item);
    }
  }
  console.log(`[Chunk Merge] Total: ${allLineItems.length} unique items (${duplicateCount} adjacent duplicates merged)`);

  // Sort by line number
  allLineItems.sort((a, b) => {
    const lineA = parseInt(a.line_number) || 0;
    const lineB = parseInt(b.line_number) || 0;
    return lineA - lineB;
  });

  // Apply quantity validation to fix length-like quantities
  // This catches cases where the AI extracted total_length_m as quantity
  const quantityValidation = validateAndFixQuantities(allLineItems);
  allLineItems = quantityValidation.items;

  if (quantityValidation.fixedCount > 0) {
    console.log(`[Chunk Merge] Fixed ${quantityValidation.fixedCount} quantity values (length → pieces)`);
  }
  if (quantityValidation.warnings.length > 0) {
    console.log(`[Chunk Merge] ${quantityValidation.warnings.length} items have suspicious quantities`);
  }

  // Aggregate confidence scores
  const confidenceScores = chunkResults
    .map(r => r._confidence?.extraction || 0)
    .filter(c => c > 0);

  const avgConfidence = confidenceScores.length > 0
    ? confidenceScores.reduce((sum, c) => sum + c, 0) / confidenceScores.length
    : 0;

  // Aggregate warnings
  const allWarnings = chunkResults.flatMap(r => r._confidence?.validation_warnings || []);
  
  // Add chunk failure warnings
  if (failedChunks.length > 0) {
    allWarnings.push(`⚠️ CRITICAL: ${failedChunks.length} chunk(s) failed - data may be incomplete`);
  }

  // Build merged result
  return {
    rfq_metadata: mergedMetadata,
    line_items: allLineItems,
    _confidence: {
      extraction: avgConfidence,
      table_detection: null,
      validation_warnings: allWarnings,
      item_count: allLineItems.length,
      warnings_count: allWarnings.length
    },
    _chunking: {
      enabled: true,
      totalChunks: chunkResults.length,
      itemsPerChunk: chunkResults.map(r => r.line_items?.length || 0),
      deduplicatedItems: duplicateCount,
      uniqueItems: allLineItems.length,
      chunkRanges: chunks.map(c => c.pageRange),
      failedChunks: failedChunks.length,
      failedChunkDetails: failedChunks
    },
    _debug: {
      model: chunkResults[0]._debug?.model || 'gemini-2.0-flash-exp',
      chunkingStrategy: 'overlapping-pages',
      totalTokens: chunkResults.reduce((sum, r) => sum + (r._debug?.totalTokens || 0), 0)
    }
  };
}

/**
 * Extract normalized dimensions from an item for deduplication
 *
 * @param {Object} item - Line item
 * @returns {string} Normalized dimension string (e.g., "2338x40")
 */
function extractNormalizedDimension(item) {
  // Check size1 field first (preferred for tubulars)
  if (item.size1) {
    const dimMatch = String(item.size1).match(/(\d+\.?\d*)\s*[xX×\*]\s*(\d+\.?\d*)/);
    if (dimMatch) {
      const od = parseFloat(dimMatch[1]);
      const thickness = parseFloat(dimMatch[2]);
      return `${od}x${thickness}`;
    }
  }

  // Then check description
  if (item.description) {
    const dimMatch = String(item.description).match(/(\d+\.?\d*)\s*[xX×\*]\s*(\d+\.?\d*)/);
    if (dimMatch) {
      const od = parseFloat(dimMatch[1]);
      const thickness = parseFloat(dimMatch[2]);
      return `${od}x${thickness}`;
    }
  }

  return null;
}

/**
 * Extract TYPE number (I, II, III, IV, V) from item description/notes
 * Must match longer patterns first (IV before I, III before II)
 *
 * @param {Object} item - Line item
 * @returns {string|null} TYPE number or null
 */
function extractTypeNumber(item) {
  const sources = [item.description, item.notes].filter(Boolean).join(' ').toUpperCase();
  const typeMatch = sources.match(/TYPE\s*(IV|III|II|I|V)/);
  return typeMatch ? typeMatch[1] : null;
}

/**
 * Create a unique key for item deduplication
 * Uses line_number + dimensions + item type + TYPE number as primary key
 *
 * CRITICAL: line_number MUST be included to distinguish separate line items
 * that have the same dimensions (e.g., multiple TUBULAR 1371.6X50.8 TYPE II entries)
 *
 * Items from overlapping chunks will have the SAME line_number if they're duplicates.
 * Different line items will have DIFFERENT line_numbers even if dimensions match.
 *
 * @param {Object} item - Line item object
 * @returns {string} Unique key for the item
 */
function createItemKey(item) {
  const dimension = extractNormalizedDimension(item);
  const desc = String(item.description || '').toLowerCase().trim();
  const lineNum = item.line_number || item.item_number || '';

  // Extract item type from description (TUBULAR, BEAM, PLATE, etc.)
  let itemType = 'unknown';
  if (/tubular|pipe|casing|tubing/i.test(desc)) {
    itemType = 'tubular';
  } else if (/beam|w\d+x\d+/i.test(desc)) {
    itemType = 'beam';
  } else if (/plate|sheet|pl\d+/i.test(desc)) {
    itemType = 'plate';
  } else if (/cone|reducer/i.test(desc)) {
    itemType = 'cone';
  } else if (/angle|channel/i.test(desc)) {
    itemType = 'structural';
  }

  // Extract TYPE number (I, II, III, IV) for material classification
  const typeNum = extractTypeNumber(item) || '';

  // Create key: lineNum + type + dimension + typeNum
  // lineNum is CRITICAL to distinguish separate line items with same dimensions
  if (dimension) {
    return `${lineNum}|${itemType}|${dimension}|${typeNum}`;
  }

  // Fallback: use description hash for non-dimensional items
  const descNorm = desc.replace(/\s+/g, ' ').substring(0, 50);
  return `${lineNum}|${itemType}|${descNorm}|${typeNum}`;
}

/**
 * Check if a quantity value looks like a length measurement (meters) vs piece count
 *
 * @param {number} qty - Quantity value
 * @returns {boolean} True if qty looks like length in meters
 */
function quantityLooksLikeLength(qty) {
  if (!qty || qty <= 0) return false;

  // Heuristics:
  // 1. Large decimal value (e.g., 428.91, 1088.82) - typical length measurements
  // 2. Value > 100 with significant decimal places
  // 3. Very large integers (> 500) - unlikely piece counts for structural items

  const hasDecimals = qty !== Math.floor(qty) && (qty % 1) >= 0.01;
  const isLargeWithDecimals = qty > 50 && hasDecimals;
  const isVeryLarge = qty > 500;

  return isLargeWithDecimals || isVeryLarge;
}

/**
 * Merge two duplicate items, preferring more complete data
 *
 * CRITICAL: For quantity, prefer values that look like piece counts (small integers)
 * over values that look like length measurements (large decimals).
 * This fixes the common AI error of extracting total_length_m as quantity.
 *
 * @param {Object} existing - Existing item
 * @param {Object} newItem - New item to merge
 * @returns {Object} Merged item
 */
function mergeItems(existing, newItem) {
  const merged = { ...existing };

  // Prefer non-empty values
  for (const key of Object.keys(newItem)) {
    if (key.startsWith('_')) continue; // Skip internal fields

    const existingVal = existing[key];
    const newVal = newItem[key];

    // Keep existing if new is empty
    if (!newVal || newVal === '' || newVal === '0') continue;

    // If existing is empty, use new
    if (!existingVal || existingVal === '' || existingVal === '0') {
      merged[key] = newVal;
      continue;
    }

    // For notes, combine them (but avoid duplicates)
    if (key === 'notes' && existingVal !== newVal) {
      // Only combine if notes are meaningfully different
      if (!existingVal.includes(newVal.substring(0, 20))) {
        merged[key] = `${existingVal}; ${newVal}`;
      }
    }

    // For quantity: prefer the value that looks like PIECE COUNT, not length
    // Pieces are typically small integers (1-500), lengths are large decimals (100-5000)
    if (key === 'quantity') {
      const existNum = parseFloat(existingVal) || 0;
      const newNum = parseFloat(newVal) || 0;

      const existLooksLikeLength = quantityLooksLikeLength(existNum);
      const newLooksLikeLength = quantityLooksLikeLength(newNum);

      if (existLooksLikeLength && !newLooksLikeLength) {
        // Existing looks like length, new looks like pieces - use new
        merged[key] = newVal;
        merged.total_length_m = merged.total_length_m || existNum; // Save length
        console.log(`[Merge] Qty fix: ${existNum} → ${newNum} (was length-like)`);
      } else if (!existLooksLikeLength && newLooksLikeLength) {
        // Existing looks like pieces, new looks like length - keep existing
        merged.total_length_m = merged.total_length_m || newNum; // Save length
        console.log(`[Merge] Qty preserved: ${existNum} (new ${newNum} was length-like)`);
      } else {
        // Both look similar - prefer smaller (more likely to be pieces)
        if (newNum < existNum && newNum > 0) {
          merged[key] = newVal;
          console.log(`[Merge] Qty: preferring smaller ${newNum} over ${existNum}`);
        }
      }
    }

    // For total_length_m: prefer larger (actual total length)
    if (key === 'total_length_m') {
      const existNum = parseFloat(existingVal) || 0;
      const newNum = parseFloat(newVal) || 0;
      if (newNum > existNum) {
        merged[key] = newVal;
      }
    }
  }

  return merged;
}

/**
 * Estimate if document should be chunked based on content
 *
 * @param {Object} documentData - Document metadata
 * @returns {boolean} True if chunking is recommended
 */
function shouldChunkDocument(documentData) {
  const { pageCount, text } = documentData;

  // Always chunk if page count exceeds threshold
  if (pageCount > CHUNKING_CONFIG.MIN_CHUNK_SIZE) {
    return true;
  }

  // Check text length (rough token estimation: 1 token ≈ 4 chars)
  if (text && text.length > 500000) { // ~125K tokens
    return true;
  }

  return false;
}

/**
 * Create chunk-aware prompt for extraction
 *
 * @param {string} basePrompt - Base extraction prompt
 * @param {Object} chunk - Chunk metadata
 * @returns {string} Enhanced prompt with chunking context
 */
function createChunkPrompt(basePrompt, chunk) {
  if (chunk.totalChunks === 1) {
    return basePrompt;
  }

  const chunkContext = `
--- CHUNKING CONTEXT ---
This is chunk ${chunk.chunkIndex + 1} of ${chunk.totalChunks} from a multi-page document.
Pages included: ${chunk.pageRange}
${chunk.isFirstChunk ? 'This is the FIRST chunk - extract header/metadata.' : ''}
${chunk.isLastChunk ? 'This is the LAST chunk.' : ''}
${!chunk.isFirstChunk ? 'This is a CONTINUATION chunk - focus on line items only.' : ''}

IMPORTANT:
- Extract ALL line items visible in pages ${chunk.pageRange}
- Preserve exact line numbers as they appear
- If an item appears partially, extract what is visible
- Do not renumber items - keep original line numbers
------------------------

${basePrompt}
`;

  return chunkContext;
}

module.exports = {
  CHUNKING_CONFIG,
  createDocumentChunks,
  mergeChunkResults,
  shouldChunkDocument,
  createChunkPrompt,
  extractTextForPageRange
};
