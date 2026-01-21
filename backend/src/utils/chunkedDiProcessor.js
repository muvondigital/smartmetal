/**
 * Chunked Document Intelligence Processor
 * Processes large PDFs in page-range chunks when single-pass DI returns partial results
 * Implements adaptive chunk splitting to handle Azure DI truncation
 */

/**
 * Create page range chunks for large PDFs
 * @param {number} totalPages - Total number of pages in the PDF
 * @param {number} chunkSize - Pages per chunk (default 10)
 * @returns {Array<{start: number, end: number, range: string}>} Array of page ranges
 */
function createPageChunks(totalPages, chunkSize = 10) {
  const chunks = [];
  for (let start = 1; start <= totalPages; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, totalPages);
    chunks.push({
      start,
      end,
      range: `${start}-${end}`,
      pageCount: end - start + 1
    });
  }
  console.log(`[DI_CHUNKING] Created ${chunks.length} chunk(s) for ${totalPages} pages (chunk size: ${chunkSize})`);
  chunks.forEach((chunk, idx) => {
    console.log(`[DI_CHUNKING]   Chunk ${idx + 1}: pages ${chunk.range} (${chunk.pageCount} pages)`);
  });
  return chunks;
}

/**
 * Extract actual page numbers returned by Azure DI from result
 * @param {Object} result - DI result object
 * @returns {Array<number>} Array of page numbers actually returned
 */
function extractReturnedPages(result) {
  const pages = [];
  if (result?.azureRaw?.pages) {
    for (const page of result.azureRaw.pages) {
      if (page.pageNumber) {
        pages.push(page.pageNumber);
      }
    }
  }
  return pages.sort((a, b) => a - b);
}

/**
 * Process a single chunk with adaptive splitting on truncation
 * @param {Function} diProcessorFn - The DI processor function
 * @param {Buffer} fileBuffer - The PDF file buffer
 * @param {string} mimeType - MIME type
 * @param {string} filename - Original filename
 * @param {Object} chunk - Chunk object with {start, end, range, pageCount}
 * @param {number} minChunkSize - Minimum chunk size (default 2)
 * @returns {Promise<Array>} Array of chunk results (may be split)
 */
async function processChunkWithAdaptiveSplit(diProcessorFn, fileBuffer, mimeType, filename, chunk, minChunkSize = 2) {
  const requestedPages = [];
  for (let i = chunk.start; i <= chunk.end; i++) {
    requestedPages.push(i);
  }
  const requestedCount = requestedPages.length;

  console.log(`[DI_CHUNK] Processing chunk: pages ${chunk.range} (requestedCount: ${requestedCount})`);

  try {
    const diStartTime = Date.now();
    const result = await diProcessorFn(fileBuffer, mimeType, filename, {
      pages: chunk.range
    });
    const diEndTime = Date.now();
    const diWallTime = diEndTime - diStartTime;

    // Extract actual pages returned by DI
    const diReturnedPages = extractReturnedPages(result);
    const returnedCount = diReturnedPages.length;
    const missingPages = requestedPages.filter(p => !diReturnedPages.includes(p));

    // Log detailed comparison
    console.log(`[DI_CHUNK_RESULT] { requestedPages: [${requestedPages.join(',')}], requestedCount: ${requestedCount}, diReturnedPages: [${diReturnedPages.join(',')}], returnedCount: ${returnedCount}, missingPages: [${missingPages.join(',')}] }`);

    const tablesReturned = result.structured?.tables?.length || 0;
    const contentLen = result.structured?.text?.length || 0;

    // Check for truncation: if returned < requested and requested > minChunkSize, split
    if (returnedCount < requestedCount && requestedCount > minChunkSize) {
      console.log(`[DI_CHUNK_TRUNCATION] Detected truncation: requested ${requestedCount} pages, got ${returnedCount}. Splitting chunk ${chunk.range}`);
      
      // Split chunk in half (or reduce to minChunkSize if needed)
      const newChunkSize = Math.max(minChunkSize, Math.floor(requestedCount / 2));
      const splitResults = [];

      // Process first half
      const firstHalf = {
        start: chunk.start,
        end: Math.min(chunk.start + newChunkSize - 1, chunk.end),
        range: `${chunk.start}-${Math.min(chunk.start + newChunkSize - 1, chunk.end)}`,
        pageCount: Math.min(newChunkSize, chunk.end - chunk.start + 1)
      };
      const firstResults = await processChunkWithAdaptiveSplit(diProcessorFn, fileBuffer, mimeType, filename, firstHalf, minChunkSize);
      splitResults.push(...firstResults);

      // Process second half if there are remaining pages
      if (firstHalf.end < chunk.end) {
        const secondHalf = {
          start: firstHalf.end + 1,
          end: chunk.end,
          range: `${firstHalf.end + 1}-${chunk.end}`,
          pageCount: chunk.end - firstHalf.end
        };
        const secondResults = await processChunkWithAdaptiveSplit(diProcessorFn, fileBuffer, mimeType, filename, secondHalf, minChunkSize);
        splitResults.push(...secondResults);
      }

      return splitResults;
    }

    // No truncation or already at minimum size - return single result
    return [{
      chunk,
      result,
      pagesReturned: returnedCount,
      diReturnedPages,
      tablesReturned,
      contentLen,
      requestedCount,
      missingPages,
      diWallTime: diWallTime || 0,
      diCallCount: 1
    }];

  } catch (error) {
    console.error(`[DI_CHUNK] Chunk ${chunk.range} failed: ${error.message}`);
    return [{
      chunk,
      result: null,
      error: error.message,
      pagesReturned: 0,
      diReturnedPages: [],
      tablesReturned: 0,
      contentLen: 0,
      requestedCount,
      missingPages: requestedPages,
      diWallTime: 0,
      diCallCount: 1
    }];
  }
}

/**
 * Process PDF in chunks using Azure Document Intelligence with adaptive splitting
 * @param {Function} diProcessorFn - The DI processor function (analyzeWithAzureLayout)
 * @param {Buffer} fileBuffer - The PDF file buffer
 * @param {string} mimeType - MIME type
 * @param {string} filename - Original filename
 * @param {number} totalPages - Total number of pages from local detection
 * @param {number} chunkSize - Initial pages per chunk
 * @returns {Promise<Object>} Merged DI results from all chunks
 */
async function processInChunks(diProcessorFn, fileBuffer, mimeType, filename, totalPages, chunkSize = 10) {
  const chunkingStartTime = Date.now();
  console.log(`[DI_CHUNKING] Starting adaptive chunked processing for ${totalPages} pages (initial chunk size: ${chunkSize})`);

  const chunks = createPageChunks(totalPages, chunkSize);
  const allChunkResults = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[DI_CHUNK] Processing chunk ${i + 1}/${chunks.length}: pages ${chunk.range}`);

    // Process with adaptive splitting (minimum chunk size 2)
    const chunkResults = await processChunkWithAdaptiveSplit(
      diProcessorFn,
      fileBuffer,
      mimeType,
      filename,
      chunk,
      2 // Minimum chunk size
    );

    allChunkResults.push(...chunkResults);
  }

  // Calculate totals
  let totalPagesReturned = 0;
  let totalTables = 0;
  let totalContentLen = 0;
  let totalDiCalls = 0;
  let totalDiWallTime = 0;
  let totalPagesSent = 0;
  for (const cr of allChunkResults) {
    totalPagesReturned += cr.pagesReturned || 0;
    totalTables += cr.tablesReturned || 0;
    totalContentLen += cr.contentLen || 0;
    totalDiCalls += cr.diCallCount || 1;
    totalDiWallTime += cr.diWallTime || 0;
    totalPagesSent += cr.requestedCount || 0;
  }

  const chunkingEndTime = Date.now();
  const totalWallTime = chunkingEndTime - chunkingStartTime;

  console.log(`[DI_CHUNK_MERGE] Merging results from ${allChunkResults.length} chunk(s) (after adaptive splitting)`);
  console.log(`[DI_CHUNK_MERGE] { totalPagesReturned: ${totalPagesReturned}, totalTables: ${totalTables}, totalContentLen: ${totalContentLen} }`);
  console.log(`[DI_CHUNK_METRICS] { di_calls: ${totalDiCalls}, di_wall_time_ms: ${totalDiWallTime}, pages_sent_to_DI: ${totalPagesSent}, total_wall_time_ms: ${totalWallTime} }`);

  // Merge all chunk results
  const mergedResult = mergeChunkResults(allChunkResults, totalPages);
  
  // Attach metrics to result
  mergedResult.metrics = {
    di_calls: totalDiCalls,
    di_wall_time_ms: totalDiWallTime,
    pages_sent_to_DI: totalPagesSent,
    total_wall_time_ms: totalWallTime
  };

  return mergedResult;
}

/**
 * Merge results from multiple DI chunk calls
 * @param {Array} chunkResults - Array of chunk processing results
 * @param {number} totalPages - Total pages in PDF (from local detection)
 * @returns {Object} Merged result in same format as single-pass DI
 */
function mergeChunkResults(chunkResults, totalPages = 0) {
  const merged = {
    structured: {
      rawPages: totalPages || 0,
      text: '',
      tables: []
    },
    azureRaw: {
      pages: [],
      tables: [],
      content: '',
      paragraphs: [],
      warnings: [],
      errors: []
    },
    chunked: true,
    chunkCount: chunkResults.length,
    chunkDetails: chunkResults.map((cr, idx) => ({
      chunkIndex: idx,
      range: cr.chunk?.range || 'unknown',
      pagesReturned: cr.pagesReturned || 0,
      diReturnedPages: cr.diReturnedPages || [],
      tablesReturned: cr.tablesReturned || 0,
      success: !cr.error,
      requestedCount: cr.requestedCount,
      missingPages: cr.missingPages || []
    }))
  };

  let tableOffset = 0;

  for (const chunkResult of chunkResults) {
    if (!chunkResult.result) continue; // Skip failed chunks

    const { structured, azureRaw } = chunkResult.result;

    // Merge structured data
    if (structured) {
      merged.structured.text += (structured.text || '') + '\n\n';

      // Merge tables with adjusted indices
      if (structured.tables) {
        for (const table of structured.tables) {
          merged.structured.tables.push({
            ...table,
            tableIndex: tableOffset + table.tableIndex,
            chunkRange: chunkResult.chunk?.range
          });
          tableOffset++;
        }
      }
    }

    // Merge raw Azure data
    if (azureRaw) {
      if (azureRaw.pages) {
        merged.azureRaw.pages.push(...azureRaw.pages);
      }
      if (azureRaw.tables) {
        merged.azureRaw.tables.push(...azureRaw.tables);
      }
      if (azureRaw.content) {
        merged.azureRaw.content += azureRaw.content + '\n\n';
      }
      if (azureRaw.paragraphs) {
        merged.azureRaw.paragraphs.push(...azureRaw.paragraphs);
      }
      if (azureRaw.warnings) {
        merged.azureRaw.warnings.push(...azureRaw.warnings);
      }
      if (azureRaw.errors) {
        merged.azureRaw.errors.push(...azureRaw.errors);
      }
    }
  }

  // Clean up merged text
  merged.structured.text = merged.structured.text.trim();
  merged.azureRaw.content = merged.azureRaw.content.trim();

  console.log(`[DI_CHUNK_MERGE] Final merged result: { pages: ${merged.structured.rawPages}, tables: ${merged.structured.tables.length}, textLen: ${merged.structured.text.length} }`);

  return merged;
}

/**
 * Determine if partial result detection should trigger chunked processing
 * @param {number} detectedPageCount - Pages detected from local PDF
 * @param {number} diPageCount - Pages returned by DI
 * @param {number} threshold - Minimum difference to trigger chunking (default 5)
 * @returns {boolean} True if chunking is recommended
 */
function shouldUseChunking(detectedPageCount, diPageCount, threshold = 5) {
  if (detectedPageCount === 0) return false; // No local page count available
  if (diPageCount === 0) return true; // DI returned nothing

  const difference = detectedPageCount - diPageCount;
  const shouldChunk = difference >= threshold;

  if (shouldChunk) {
    console.log(`[DI_PARTIAL_RESULT] Detected partial result: { detectedPageCount: ${detectedPageCount}, diPages: ${diPageCount}, difference: ${difference} }`);
    console.log(`[DI_PARTIAL_RESULT] Chunked processing recommended (threshold: ${threshold} pages)`);
  }

  return shouldChunk;
}

module.exports = {
  createPageChunks,
  processInChunks,
  mergeChunkResults,
  shouldUseChunking
};
