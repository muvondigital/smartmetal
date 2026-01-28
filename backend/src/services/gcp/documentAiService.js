// SmartMetal CPQ - A product from Muvon Digital, an innovation arm of Muvon Energy
// Developed by Muvon Digital, the innovation arm of Muvon Energy.
// Copyright (c) 2025 Muvon Energy. All rights reserved.
// Proprietary & Confidential — Not for distribution.

const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
const { callGPT4JSON, callGPT4JSONChunked } = require('./genaiClient');
const { detectMtoDocument, extractHierarchicalMto, verifyWeightCalculations, flattenMtoToRfqItems } = require('../ai/mtoExtractionService');
const { createDocumentChunks, shouldChunkDocument } = require('../../utils/documentChunker');
const { findVendorRule, computeLayoutSignature } = require('../extraction/vendorRegistry');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');

/**
 * Google Cloud Document AI Service
 * Replaces Azure Document Intelligence with Document AI
 * Maintains same interface for backward compatibility
 */

let docAiClient = null;
let processorName = null;

/**
 * Initialize Document AI client
 */
function initializeDocIntelligenceClient() {
  if (docAiClient) {
    return docAiClient;
  }

  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.DOCUMENT_AI_LOCATION || 'us';
  const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

  if (!projectId || !processorId) {
    throw new Error(
      'Google Document AI configuration missing. Please check GCP_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID in .env'
    );
  }

  docAiClient = new DocumentProcessorServiceClient();
  processorName = `projects/${projectId}/locations/${location}/processors/${processorId}`;

  console.log('✅ Google Document AI client initialized');
  console.log(`   Processor: ${processorName}`);
  return docAiClient;
}

/**
 * Extract text from text anchor
 */
function getText(textAnchor, fullText) {
  if (!textAnchor || !textAnchor.textSegments) return '';

  return textAnchor.textSegments
    .map(segment => {
      const start = parseInt(segment.startIndex || 0);
      const end = parseInt(segment.endIndex || 0);
      return fullText.substring(start, end);
    })
    .join('');
}

/**
 * Convert bounding polygon to bounding box
 */
function getBoundingBox(boundingPoly) {
  if (!boundingPoly || !boundingPoly.normalizedVertices) return [];

  return boundingPoly.normalizedVertices.map(v => ({
    x: v.x || 0,
    y: v.y || 0,
  }));
}

/**
 * Convert Document AI table to Azure DI format
 */
function convertTable(table, fullText) {
  const rows = [];
  const cells = [];
  let maxColumnIndex = -1;

  // Process header rows
  (table.headerRows || []).forEach((row, rowIdx) => {
    (row.cells || []).forEach((cell, colIdx) => {
      const resolvedRowIndex = Number.isFinite(cell.rowIndex) ? cell.rowIndex : rowIdx;
      const resolvedColumnIndex = Number.isFinite(cell.columnIndex) ? cell.columnIndex : colIdx;
      if (resolvedColumnIndex > maxColumnIndex) {
        maxColumnIndex = resolvedColumnIndex;
      }
      cells.push({
        content: getText(cell.layout.textAnchor, fullText),
        rowIndex: resolvedRowIndex,
        columnIndex: resolvedColumnIndex,
        rowSpan: cell.rowSpan || 1,
        columnSpan: cell.colSpan || 1,
        kind: 'columnHeader'
      });
    });
  });

  // Process body rows
  const headerRowCount = table.headerRows?.length || 0;
  (table.bodyRows || []).forEach((row, rowIdx) => {
    (row.cells || []).forEach((cell, colIdx) => {
      const resolvedRowIndex = Number.isFinite(cell.rowIndex)
        ? cell.rowIndex
        : (headerRowCount + rowIdx);
      const resolvedColumnIndex = Number.isFinite(cell.columnIndex) ? cell.columnIndex : colIdx;
      if (resolvedColumnIndex > maxColumnIndex) {
        maxColumnIndex = resolvedColumnIndex;
      }
      cells.push({
        content: getText(cell.layout.textAnchor, fullText),
        rowIndex: resolvedRowIndex,
        columnIndex: resolvedColumnIndex,
        rowSpan: cell.rowSpan || 1,
        columnSpan: cell.colSpan || 1,
        kind: 'content'
      });
    });
  });

  const inferredColumnCount = Math.max(table.columnCount || 0, maxColumnIndex + 1, 0);

  return {
    rowCount: (table.headerRows?.length || 0) + (table.bodyRows?.length || 0),
    columnCount: inferredColumnCount,
    cells: cells,
  };
}

/**
 * Convert Document AI format to Azure DI format (for compatibility)
 * This maintains the same interface as the old Azure service
 */
function convertToAzureFormat(document) {
  const pages = [];
  const tables = [];
  const keyValuePairs = [];

  // Process pages
  for (const page of document.pages || []) {
    pages.push({
      pageNumber: page.pageNumber,
      width: page.dimension?.width || 0,
      height: page.dimension?.height || 0,
      lines: (page.lines || []).map(line => ({
        content: getText(line.layout.textAnchor, document.text),
        boundingBox: getBoundingBox(line.layout.boundingPoly),
      })),
      words: (page.tokens || []).map(token => ({
        content: getText(token.layout.textAnchor, document.text),
        boundingBox: getBoundingBox(token.layout.boundingPoly),
        confidence: token.layout.confidence || 0,
      })),
    });

    // Extract tables
    for (const table of page.tables || []) {
      tables.push(convertTable(table, document.text));
    }

    // Extract form fields (key-value pairs)
    for (const field of page.formFields || []) {
      keyValuePairs.push({
        key: {
          content: getText(field.fieldName.textAnchor, document.text),
        },
        value: {
          content: getText(field.fieldValue.textAnchor, document.text),
        },
        confidence: field.fieldValue.confidence || 0,
      });
    }
  }

  return {
    pages,
    tables,
    keyValuePairs,
    content: document.text,
    pageCount: document.pages?.length || 0,
  };
}

/**
 * Extract tables and text from PDF using Document AI
 * MAINTAINS SAME INTERFACE as Azure DI version (with added text extraction)
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} - { tables: Array, text: string, pages: number }
 */
async function extractTablesFromPDFSingle(pdfBuffer) {
  const client = initializeDocIntelligenceClient();
  const { timeAsync } = require('../../utils/timing');
  const { PagePreScreener } = require('../extraction/pagePreScreener');
  const { PDFDocument } = require('pdf-lib');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  console.log('🔍 Starting INTELLIGENT table and text extraction from PDF...');
  const startTime = Date.now();

  // STEP 1: INTELLIGENT PAGE DETECTION (like grep - search first!)
  // Save PDF to temp file for PagePreScreener
  const tempFilePath = path.join(os.tmpdir(), `prescreener-${Date.now()}.pdf`);
  fs.writeFileSync(tempFilePath, pdfBuffer);

  const preScreener = new PagePreScreener();
  let targetPages = null;

  try {
    const preScreenResult = await preScreener.identifyLineItemPages(tempFilePath, {
      enableSmartSampling: true, // Enable smart sampling for large docs
      minScore: 75, // INCREASED: Only extract pages with strong NSC product signals
      maxPages: 30  // Max pages to select for cost control
    });

    if (preScreenResult.pages.length > 0 && preScreenResult.pages.length < preScreenResult.totalPages) {
      targetPages = preScreenResult.pages;
      console.log(`✅ INTELLIGENT SCAN: Found ${targetPages.length}/${preScreenResult.totalPages} pages with line items`);
      console.log(`   📊 Cost savings: ${preScreenResult.compressionRatio.toFixed(1)}% reduction in processing`);
      console.log(`   📄 Target pages: ${targetPages.join(', ')}`);
    } else {
      console.log(`ℹ️  Processing all ${preScreenResult.totalPages} pages (no compression possible)`);
    }
  } catch (error) {
    console.warn('⚠️  Page pre-screening failed, falling back to full document:', error.message);
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tempFilePath); } catch (e) { /* ignore */ }
  }

  // STEP 2: Extract only the relevant pages if identified
  let processBuffer = pdfBuffer;
  if (targetPages && targetPages.length > 0) {
    const sourceDoc = await PDFDocument.load(pdfBuffer);
    const newDoc = await PDFDocument.create();

    // Copy only the target pages
    const pageIndices = targetPages.map(p => p - 1); // Convert to 0-indexed
    const pages = await newDoc.copyPages(sourceDoc, pageIndices);
    pages.forEach(page => newDoc.addPage(page));

    const bytes = await newDoc.save();
    processBuffer = Buffer.from(bytes);
    console.log(`📋 Created filtered PDF with ${targetPages.length} pages for Document AI`);
  }

  const result = await timeAsync(
    'Google Document AI - Table & Text Extraction',
    async () => {
      const request = {
        name: processorName,
        rawDocument: {
          content: processBuffer.toString('base64'),
          mimeType: 'application/pdf',
        },
      };

      const [response] = await client.processDocument(request);
      return response.document;
    },
    { documentSize: processBuffer.length }
  );

  const duration = Date.now() - startTime;
  console.log(`✅ Intelligent extraction completed (${duration}ms)`);

  const tables = [];
  for (const page of result.pages || []) {
    for (const table of page.tables || []) {
      tables.push(convertTable(table, result.text));
    }
  }

  const text = result.text || '';
  const pageCount = result.pages?.length || 0;

  console.log(`   Found ${tables.length} table(s), ${text.length} characters, ${pageCount} page(s)`);

  return {
    tables,
    text,
    pageCount
  };
}

async function extractTablesFromPDFInChunks(pdfBuffer, maxPages = 15) {
  const { PDFDocument } = require('pdf-lib');
  const sourceDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = sourceDoc.getPageCount();
  const chunks = [];

  for (let start = 0; start < totalPages; start += maxPages) {
    const end = Math.min(start + maxPages, totalPages);
    const newDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await newDoc.copyPages(sourceDoc, pageIndices);
    pages.forEach(page => newDoc.addPage(page));
    const bytes = await newDoc.save();
    chunks.push(Buffer.from(bytes));
  }

  const aggregated = {
    tables: [],
    text: '',
    pageCount: 0
  };

  for (let idx = 0; idx < chunks.length; idx += 1) {
    const remaining = totalPages - idx * maxPages;
    console.log(`?? Processing PDF chunk ${idx + 1}/${chunks.length} (${Math.min(maxPages, remaining)} pages)...`);
    const chunkResult = await extractTablesFromPDFSingle(chunks[idx]);
    aggregated.tables.push(...chunkResult.tables);
    aggregated.text += `${chunkResult.text || ''}
`;
    aggregated.pageCount += chunkResult.pageCount || 0;
  }

  return aggregated;
}

/**
 * INTELLIGENT PAGE PRE-FILTERING WRAPPER
 * Runs PagePreScreener BEFORE Document AI processing to filter pages
 */
async function extractTablesFromPDFWithPreScreening(pdfBuffer) {
  const { PagePreScreener } = require('../extraction/pagePreScreener');
  const { PDFDocument } = require('pdf-lib');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  console.log('🔍 Running intelligent page detection...');
  const tempFilePath = path.join(os.tmpdir(), `prescreener-${Date.now()}.pdf`);
  fs.writeFileSync(tempFilePath, pdfBuffer);

  const preScreener = new PagePreScreener();
  let filteredBuffer = pdfBuffer;

  try {
    const preScreenResult = await preScreener.identifyLineItemPages(tempFilePath, {
      enableSmartSampling: true,
      minScore: 75,
      maxPages: 30
    });

    if (preScreenResult.pages.length > 0 && preScreenResult.pages.length < preScreenResult.totalPages) {
      const targetPages = preScreenResult.pages;
      console.log();
      console.log();
      console.log();

      const sourceDoc = await PDFDocument.load(pdfBuffer);
      const newDoc = await PDFDocument.create();
      const pageIndices = targetPages.map(p => p - 1);
      const pages = await newDoc.copyPages(sourceDoc, pageIndices);
      pages.forEach(page => newDoc.addPage(page));
      const bytes = await newDoc.save();
      filteredBuffer = Buffer.from(bytes);
      console.log();
    } else {
      console.log();
    }
  } catch (error) {
    console.warn('⚠️  Page pre-screening failed, using full document:', error.message);
  } finally {
    try { fs.unlinkSync(tempFilePath); } catch (e) { /* ignore */ }
  }

  return extractTablesFromPDF(filteredBuffer);
}


/**
 * INTELLIGENT PAGE PRE-FILTERING WRAPPER
 * Runs PagePreScreener BEFORE Document AI processing to filter pages
 */
async function extractTablesFromPDF(pdfBuffer) {
  try {
    return await extractTablesFromPDFSingle(pdfBuffer);
  } catch (error) {
    const message = error.message || '';
    if (/exceed the limit|pages exceed the limit|page limit/i.test(message)) {
      console.warn('?? Document AI page limit hit - retrying with chunked PDF extraction...');
      return extractTablesFromPDFInChunks(pdfBuffer, 15);
    }
    console.error('? Table extraction failed:', error.message);
    throw new Error(`Failed to extract tables from PDF: ${error.message}`);
  }
}

/**
 * Extract text from image using OCR
 * @param {Buffer} imageBuffer - Image file buffer
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromImage(imageBuffer) {
  const client = initializeDocIntelligenceClient();
  const { timeAsync } = require('../../utils/timing');

  try {
    console.log('🖼️  Starting OCR on image...');
    const startTime = Date.now();

    // Process document
    const result = await timeAsync(
      'Google Document AI - OCR',
      async () => {
        const request = {
          name: processorName,
          rawDocument: {
            content: imageBuffer.toString('base64'),
            mimeType: 'image/png', // Document AI supports multiple image types
          },
        };

        const [response] = await client.processDocument(request);
        return response.document;
      },
      { documentSize: imageBuffer.length }
    );

    const duration = Date.now() - startTime;
    console.log(`✅ OCR completed (${duration}ms)`);

    // Extract text content
    const extractedText = result.text || '';
    console.log(`   Extracted ${extractedText.length} characters`);
    return extractedText;

  } catch (error) {
    console.error('❌ OCR failed:', error.message);
    throw new Error(`Failed to extract text from image: ${error.message}`);
  }
}

/**
 * Convert table data to structured format
 * @param {Array} tables - Extracted tables from Document AI
 * @returns {Array} - Structured table data
 */
function parseTableToStructured(tables) {
  const structuredTables = [];

  for (const table of tables) {
    // Find header row (cells with kind='columnHeader')
    const headers = [];
    const headerCells = table.cells.filter(cell => cell.kind === 'columnHeader' || cell.rowIndex === 0);

    for (const cell of headerCells) {
      headers[cell.columnIndex] = cell.content.trim().toLowerCase();
    }

    // If no headers found, create generic ones
    if (headers.length === 0) {
      for (let i = 0; i < table.columnCount; i++) {
        headers[i] = `column_${i}`;
      }
    }

    // Extract data rows
    const rows = [];
    const dataStartRow = headers.length > 0 ? 1 : 0;

    for (let rowIdx = dataStartRow; rowIdx < table.rowCount; rowIdx++) {
      const rowCells = table.cells.filter(cell => cell.rowIndex === rowIdx);
      const rowData = {};

      for (const cell of rowCells) {
        const header = headers[cell.columnIndex] || `column_${cell.columnIndex}`;
        rowData[header] = cell.content.trim();
      }

      // Only add non-empty rows
      if (Object.values(rowData).some(val => val !== '')) {
        rows.push(rowData);
      }
    }

    structuredTables.push({
      headers,
      rows,
      rowCount: rows.length,
      columnCount: table.columnCount
    });
  }

  return structuredTables;
}

function normalizeHeader(header, removeParentheses = true) {
  if (!header) return '';
  let normalized = String(header).trim().toLowerCase();
  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.replace(/[.,;:!?]+$/, '');
  if (removeParentheses) {
    normalized = normalized.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    normalized = normalized.replace(/\s+/g, ' ');
  }
  return normalized;
}

function stringifyExcelValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (Array.isArray(value.richText)) {
      return value.richText.map(part => part.text || '').join('');
    }
    if (Object.prototype.hasOwnProperty.call(value, 'result')) {
      return value.result === null || value.result === undefined ? '' : String(value.result);
    }
    if (value.formula && Object.prototype.hasOwnProperty.call(value, 'result')) {
      return value.result === null || value.result === undefined ? '' : String(value.result);
    }
    return String(value);
  }
  return String(value);
}

function getExcelCellText(cell) {
  if (!cell) return '';
  return stringifyExcelValue(cell.value);
}

function normalizeExcelHeaders(headerRow) {
  const headers = headerRow.map((cellValue, index) => {
    const trimmed = String(cellValue || '').trim();
    return trimmed.length > 0 ? trimmed : `column_${index + 1}`;
  });

  const used = new Map();
  return headers.map((header) => {
    const key = header.toLowerCase();
    const count = used.get(key) || 0;
    used.set(key, count + 1);
    if (count === 0) {
      return header;
    }
    return `${header}_${count + 1}`;
  });
}

function isExcelHeaderKeyword(value) {
  const normalized = normalizeHeader(value);
  return /(item|component|description|detail|qty|quantity|unit|uom|material|spec|size|schedule|weight|remarks?|remark|group|category|dn size|wall thickness)/i.test(normalized);
}

function hasExcelHeaderAnchor(rowValues) {
  return rowValues.some(value => {
    const normalized = normalizeHeader(value);
    return /(item|description|qty|quantity)/i.test(normalized);
  });
}

function extractExcelMetadataFromRow(rowValues, metadata) {
  if (!rowValues || rowValues.length === 0) return;
  const label = String(rowValues[0] || '').trim();
  if (!label) return;

  const normalized = label.toLowerCase();
  const valueCell = rowValues[1];
  const extractInline = () => {
    const parts = label.split(':');
    if (parts.length > 1) {
      return parts.slice(1).join(':').trim();
    }
    return '';
  };
  const normalizeValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return extractInline() || null;
    return raw.replace(/^:\s*/, '') || null;
  };

  if (normalized.includes('rfq') && normalized.includes('no')) {
    metadata.rfq_number = metadata.rfq_number || normalizeValue(valueCell);
  } else if (normalized.startsWith('project')) {
    metadata.project = metadata.project || normalizeValue(valueCell);
  } else if (normalized.startsWith('client')) {
    metadata.customer_name = metadata.customer_name || normalizeValue(valueCell);
  } else if (normalized.startsWith('subject')) {
    metadata.subject = metadata.subject || normalizeValue(valueCell);
  }
}

function normalizeExcelValue(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLikelyNumeric(value) {
  if (!value) return false;
  const normalized = String(value).replace(/,/g, '').trim();
  return normalized.length > 0 && !Number.isNaN(Number(normalized));
}

function isLikelyHeaderLabel(value) {
  const normalized = normalizeHeader(value);
  return /^(item|description|qty|quantity|unit|material|spec|size|weight|remarks?)$/.test(normalized);
}

function pickColumnIndex(headers, predicate) {
  if (!Array.isArray(headers)) return -1;
  return headers.findIndex(header => predicate(normalizeHeader(header)));
}

function pickFirstColumnIndex(indices) {
  for (const index of indices) {
    if (Number.isInteger(index) && index >= 0) {
      return index;
    }
  }
  return -1;
}

function extractItemsFromExcelTables(tables, sheetMetadata) {
  const items = [];
  const metadata = {
    customer_name: null,
    rfq_number: null,
    date: null,
    project: null,
    delivery_address: null,
    contact_name: null,
    contact_email: null,
    contact_phone: null
  };

  const metadataBySheet = new Map();
  (sheetMetadata || []).forEach(entry => {
    if (entry && entry.sheetName) {
      metadataBySheet.set(entry.sheetName, entry.metadata || {});
    }
  });

  for (const table of tables || []) {
    const headers = table.headers || [];

    const itemNoIndex = pickColumnIndex(headers, h => /(^no\.?$|^item$|item no|item number|item #|line no|line number|^s\.?n\.?o\.?$|^#$)/.test(h));
    const descriptionIndex = pickFirstColumnIndex([
      pickColumnIndex(headers, h => /^(description|item description|spec|specification)$/.test(h)),
      pickColumnIndex(headers, h => /(description|detail|specification)/.test(h) && !/material\s+description/.test(h))
    ]);
    const componentIndex = pickColumnIndex(headers, h => /(component|product|part)/.test(h));
    const typeIndex = pickColumnIndex(headers, h => /^(type|category)$/.test(h));
    const materialIndex = pickFirstColumnIndex([
      pickColumnIndex(headers, h => /(material description|material specification|material spec)/.test(h)),
      pickColumnIndex(headers, h => /(^material$)/.test(h)),
      pickColumnIndex(headers, h => /(material type)/.test(h))
    ]);
    const materialTypeIndex = pickColumnIndex(headers, h => /(material type)/.test(h));
    const quantityIndex = pickFirstColumnIndex([
      pickColumnIndex(headers, h => /(purchased quantity|purchase quantity)/.test(h)),
      pickColumnIndex(headers, h => /(erected quantity)/.test(h)),
      pickColumnIndex(headers, h => /(nett quantity|net quantity)/.test(h)),
      pickColumnIndex(headers, h => /(qty|quantity)/.test(h))
    ]);
    const unitIndex = pickColumnIndex(headers, h => /(unit|uom|unit of measure)/.test(h));
    const unitWeightIndex = pickColumnIndex(headers, h => /(unit weight)/.test(h));
    const totalWeightIndex = pickFirstColumnIndex([
      pickColumnIndex(headers, h => /(purchased weight)/.test(h)),
      pickColumnIndex(headers, h => /(total weight)/.test(h)),
      pickColumnIndex(headers, h => /(erected weight)/.test(h))
    ]);
    const odIndex = pickColumnIndex(headers, h => /(od|outside diameter|outer diameter)/.test(h));
    const tkIndex = pickFirstColumnIndex([
      pickColumnIndex(headers, h => /(wall thickness)/.test(h)),
      pickColumnIndex(headers, h => /(tk)/.test(h)),
      pickColumnIndex(headers, h => /(thickness)/.test(h) && !/schedule/.test(h))
    ]);
    const sizeIndex = pickColumnIndex(headers, h => /(^size$|dimension|spec|profile)/.test(h));
    const notesIndex = pickColumnIndex(headers, h => /(remarks?|remark|notes?|shipment|revision|rev\.)/.test(h));

    const hasLineItems = descriptionIndex !== -1 || componentIndex !== -1 || itemNoIndex !== -1 || sizeIndex !== -1;
    if (!hasLineItems) {
      continue;
    }

    const sheetName = table.sheetName || null;
    const sheetMeta = sheetName ? metadataBySheet.get(sheetName) : null;
    if (sheetMeta) {
      metadata.customer_name = metadata.customer_name || sheetMeta.customer_name || null;
      metadata.rfq_number = metadata.rfq_number || sheetMeta.rfq_number || null;
      metadata.project = metadata.project || sheetMeta.project || sheetMeta.subject || null;
    }

    (table.rows || []).forEach((row, rowIdx) => {
      const getValue = (index) => {
        if (index === -1) return null;
        const header = headers[index];
        return normalizeExcelValue(row ? row[header] : null);
      };

      const itemNo = getValue(itemNoIndex) || String(rowIdx + 1);
      const description = getValue(descriptionIndex);
      const component = getValue(componentIndex);
      const type = getValue(typeIndex);
      const size = getValue(sizeIndex);
      const material = getValue(materialIndex) || getValue(materialTypeIndex);
      const quantity = getValue(quantityIndex);
      const unitRaw = getValue(unitIndex);
      const unit = unitRaw ? unitRaw.toUpperCase() : null;
      const unitWeight = getValue(unitWeightIndex);
      const totalWeight = getValue(totalWeightIndex);
      const odMm = getValue(odIndex);
      const tkMm = getValue(tkIndex);
      let notes = getValue(notesIndex);

      let resolvedDescription = description;
      if (!resolvedDescription) {
        const fallbackParts = [component, type, size, material].filter(Boolean);
        resolvedDescription = fallbackParts.length > 0 ? fallbackParts.join(' ') : null;
      }

      const hasDescription = Boolean(resolvedDescription && resolvedDescription.trim().length >= 3);
      const hasNumericQty = isLikelyNumeric(quantity);
      if (!hasDescription || isLikelyHeaderLabel(resolvedDescription) || !hasNumericQty) {
        return;
      }

      if (sheetName) {
        const sheetNote = `Sheet: ${sheetName}`;
        notes = notes ? `${notes} | ${sheetNote}` : sheetNote;
      }

      items.push({
        item_no: itemNo,
        rfq_reference: metadata.rfq_number || null,
        description: resolvedDescription,
        material: material,
        od_mm: odMm,
        tk_mm: tkMm,
        quantity: quantity,
        unit: unit,
        unit_weight_kg: unitWeight,
        total_weight_kg: totalWeight,
        notes: notes
      });
    });
  }

  return {
    metadata,
    items
  };
}

function extractItemsFromPoText(text) {
  if (!text) return [];
  if (!/PR\s*No\.?DetailsSub\s*Job\s*Unit\s*Quantity/i.test(text)) {
    return [];
  }

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const items = [];
  let inItemSection = false;
  let i = 0;

  const isItemNumberLine = (line) => /^[0-9]{1,3}$/.test(line);
  const isUnitPriceLine = (line) => /^[A-Za-z]{1,4}\s*\d/.test(line) && /[0-9],[0-9]/.test(line);

  const parseUnitQuantity = (line) => {
    const unitMatch = line.match(/^([A-Za-z]{1,4})/);
    const unit = unitMatch ? unitMatch[1].toUpperCase() : null;
    const numberMatches = line.match(/[0-9][0-9,]*\.?[0-9]*/g) || [];
    let quantity = null;
    let quantitySource = null;
    let quantityConfidence = 'low';
    let needsReview = false;
    if (numberMatches.length >= 3) {
      quantity = numberMatches[0];
      quantitySource = 'inferred_price_line';
      quantityConfidence = 'medium';
      needsReview = true;
    } else if (numberMatches.length >= 2) {
      quantity = '1';
      quantitySource = 'default_1';
      quantityConfidence = 'low';
      needsReview = true;
    } else if (numberMatches.length === 1) {
      quantity = numberMatches[0];
      quantitySource = 'explicit';
      quantityConfidence = 'high';
    }
    return { unit, quantity, quantitySource, quantityConfidence, needsReview };
  };

  while (i < lines.length) {
    const line = lines[i];
    if (/PR\s*No\.?DetailsSub\s*Job\s*Unit\s*Quantity/i.test(line)) {
      inItemSection = true;
      i += 1;
      continue;
    }

    if (!inItemSection || !isItemNumberLine(line)) {
      i += 1;
      continue;
    }

    const itemNo = line;
    const blockLines = [];
    i += 1;
    while (i < lines.length && !isItemNumberLine(lines[i])) {
      blockLines.push(lines[i]);
      i += 1;
    }

    let description = null;
    let notes = null;
    let unit = null;
    let quantity = null;
    let quantitySource = null;
    let quantityConfidence = null;
    let needsReview = false;

    for (let j = 0; j < blockLines.length; j += 1) {
      const blockLine = blockLines[j];
      if (/^Description:/i.test(blockLine)) {
        const descParts = [];
        for (let k = j + 1; k < blockLines.length; k += 1) {
          const nextLine = blockLines[k];
          if (/^Remarks:/i.test(nextLine) || isUnitPriceLine(nextLine)) {
            break;
          }
          descParts.push(nextLine);
        }
        description = descParts.join(' ').trim() || null;
      }

      if (/^Remarks:/i.test(blockLine)) {
        const remarkText = blockLine.replace(/^Remarks:/i, '').trim();
        const remarkParts = [];
        if (remarkText) {
          remarkParts.push(remarkText);
        }
        for (let k = j + 1; k < blockLines.length; k += 1) {
          const nextLine = blockLines[k];
          if (isUnitPriceLine(nextLine)) {
            break;
          }
          remarkParts.push(nextLine);
        }
        notes = remarkParts.join(' ').trim() || null;
      }

      if (!unit && isUnitPriceLine(blockLine)) {
        const parsed = parseUnitQuantity(blockLine);
        unit = parsed.unit;
        quantity = parsed.quantity;
        quantitySource = parsed.quantitySource;
        quantityConfidence = parsed.quantityConfidence;
        needsReview = parsed.needsReview;
      }
    }

    if (description && quantity) {
      items.push({
        item_no: itemNo,
        rfq_reference: null,
        description,
        material: null,
        od_mm: null,
        tk_mm: null,
        quantity,
        unit,
        unit_weight_kg: null,
        total_weight_kg: null,
        notes,
        needs_review: Boolean(needsReview),
        quantity_source: quantitySource,
        confidence: quantityConfidence
      });
    }
  }

  return items;
}

async function extractTablesFromXlsx(xlsxBuffer) {
  const stream = Readable.from(xlsxBuffer);
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(stream, {
    entries: 'emit',
    sharedStrings: 'cache',
    styles: 'ignore',
    hyperlinks: 'ignore',
    worksheets: 'emit'
  });

  const tables = [];
  const textParts = [];
  const sheetMetadata = [];
  let sheetCount = 0;
  const maxTextRows = 200;

  for await (const worksheetReader of workbookReader) {
    sheetCount += 1;
    const sheetName = worksheetReader.name || `Sheet${sheetCount}`;
    const metadata = {
      customer_name: null,
      rfq_number: null,
      project: null,
      subject: null
    };

    let headers = null;
    let firstRowValues = null;
    const structuredRows = [];
    let rowIndex = 0;
    let textRowsAdded = 0;

    for await (const row of worksheetReader) {
      rowIndex += 1;
      const rowValues = (row.values || []).slice(1).map(stringifyExcelValue);

      if (!headers) {
        extractExcelMetadataFromRow(rowValues, metadata);
        if (!firstRowValues && rowValues.some(value => String(value || '').trim().length > 0)) {
          firstRowValues = rowValues;
        }

        const keywordCount = rowValues.filter(value => isExcelHeaderKeyword(value)).length;
        const hasAnchor = hasExcelHeaderAnchor(rowValues);
        if (keywordCount >= 2 && hasAnchor) {
          headers = normalizeExcelHeaders(rowValues);
          if (textRowsAdded < maxTextRows) {
            textParts.push(`SHEET: ${sheetName}`);
            const headerText = rowValues.map(value => String(value || '').trim()).filter(Boolean).join(' | ');
            if (headerText) {
              textParts.push(`Row ${rowIndex}: ${headerText}`);
              textRowsAdded += 1;
            }
          }
        }
        continue;
      }

      const rowData = {};
      headers.forEach((header, colIndex) => {
        rowData[header] = rowValues[colIndex] !== undefined ? String(rowValues[colIndex]) : '';
      });

      const hasValues = Object.values(rowData).some(value => String(value || '').trim().length > 0);
      if (hasValues) {
        structuredRows.push(rowData);
        if (textRowsAdded < maxTextRows) {
          const rowText = rowValues.map(value => String(value || '').trim()).filter(Boolean).join(' | ');
          if (rowText) {
            textParts.push(`Row ${rowIndex}: ${rowText}`);
            textRowsAdded += 1;
          }
        }
      }
    }

    if (!headers && firstRowValues) {
      headers = normalizeExcelHeaders(firstRowValues);
    }

    if (headers) {
      tables.push({
        headers,
        rows: structuredRows,
        rowCount: structuredRows.length,
        columnCount: headers.length,
        sheetName
      });
      sheetMetadata.push({ sheetName, metadata });
    }
  }

  return {
    tables,
    text: textParts.join('\n'),
    sheetCount: sheetCount || 1,
    sheetMetadata
  };
}

/**
 * Parse RFQ document and extract structured data
 * Auto-detects MTO documents and uses hierarchical extraction if needed
 * MAINTAINS SAME INTERFACE as Azure DI version
 * @param {Buffer} documentBuffer - Document file buffer
 * @param {string} fileType - File type ('pdf', 'image', 'docx')
 * @param {Object} options - Parsing options
 * @returns {Promise<Object>} - Structured RFQ data
 */

function addEndProductFields(items, rfqReference) {
  if (!Array.isArray(items)) return items;
  return items.map(item => ({
    ...item,
    item_no: item.item_no ?? item.line_number ?? item.item_number ?? item.Item ?? null,
    rfq_reference: item.rfq_reference ?? rfqReference ?? null,
    material: item.material ?? item.material_spec ?? item.materialSpec ?? null,
    od_mm: item.od_mm ?? item['OD (MM)'] ?? null,
    tk_mm: item.tk_mm ?? item['TK (MM)'] ?? null,
    unit_weight_kg: item.unit_weight_kg ?? item['UNIT WEIGHT (KG)'] ?? null,
    total_weight_kg: item.total_weight_kg ?? item['TOTAL WEIGHT (KG)'] ?? null,
    notes: item.notes ?? item.remarks ?? item.Remarks ?? null
  }));
}
async function parseRFQDocument(documentBuffer, fileType = 'pdf', options = {}) {
  const { createTimingContext, timeAsync } = require('../../utils/timing');
  const { getCachedExtraction, cacheExtraction } = require('./cloudStorageService');
  
  const timing = createTimingContext('Document AI - RFQ Extraction', {
    fileType,
    documentSize: documentBuffer.length,
  });

  try {
    // Check cache first (skip if options.forceReprocess is true)
    if (!options.forceReprocess) {
      const cachedResult = await getCachedExtraction(documentBuffer);
      if (cachedResult) {
        console.log('🚀 Using cached extraction result (skipping AI processing)');
        return cachedResult;
      }
    }

    const aiDetectionStartTime = Date.now();
    const aiDetectionStartTimestamp = new Date().toISOString();
    console.log(`
============================================
🤖 [AI DETECTION START] ${aiDetectionStartTimestamp}
============================================
📋 Parsing RFQ document (type: ${fileType})...`);
    const startTime = Date.now();

    let extractedData = {
      tables: [],
      text: '',
      confidence: 0
    };

    // Extract based on file type
    timing.phase('callDocumentAI');
    if (fileType === 'pdf' || fileType === 'docx') {
      // ALWAYS use Document AI for table extraction first
      try {
        console.log('?? Using Document AI for table and text extraction...');
        const docAiResult = await extractTablesFromPDF(documentBuffer);
        extractedData.tables = parseTableToStructured(docAiResult.tables);
        extractedData.text = docAiResult.text || '';
        extractedData.pageCount = docAiResult.pageCount || 1;
        console.log(`? Document AI extracted ${extractedData.tables.length} table(s), ${extractedData.text.length} characters from ${extractedData.pageCount} pages`);
      } catch (error) {
        console.warn('??  Document AI extraction failed, falling back to pdf-parse:', error.message);
        // Fallback to pdf-parse if Document AI fails
        try {
          const pdfParse = require('pdf-parse');
          const pdfData = await pdfParse(documentBuffer);
          extractedData.text = pdfData.text || '';
          extractedData.tables = [];
          extractedData.pageCount = pdfData.numpages || 1;
          console.log(`? pdf-parse extracted ${extractedData.text.length} characters from ${pdfData.numpages} pages`);
        } catch (pdfParseError) {
          console.error('? Both Document AI and pdf-parse failed:', pdfParseError.message);
          throw new Error('Failed to extract content from PDF document');
        }
      }

    } else if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'xlsm') {
      const xlsxResult = await extractTablesFromXlsx(documentBuffer);
      extractedData.tables = xlsxResult.tables;
      extractedData.text = xlsxResult.text;
      extractedData.pageCount = xlsxResult.sheetCount || 1;
      extractedData.sheetMetadata = xlsxResult.sheetMetadata || [];
      console.log(`[XLSX] Parsed ${extractedData.tables.length} table(s) across ${extractedData.pageCount} sheet(s)`);
      if (extractedData.tables.length > 0) {
        const previewTable = extractedData.tables[0];
        console.log(`[XLSX] First table headers: ${previewTable.headers?.length || 0}, rows: ${previewTable.rows?.length || 0}`);
        if (Array.isArray(previewTable.headers)) {
          console.log(`[XLSX] Header preview: ${previewTable.headers.slice(0, 8).join(' | ')}`);
        }
      }

      const excelStructured = extractItemsFromExcelTables(extractedData.tables, extractedData.sheetMetadata);
      if (excelStructured.items.length > 0) {
        const rfqReference = excelStructured.metadata?.rfq_number || null;
        const itemsWithReference = excelStructured.items.map(item => ({
          ...item,
          rfq_reference: item.rfq_reference || rfqReference
        }));
        return {
          metadata: excelStructured.metadata,
          items: itemsWithReference,
          confidence: 0.98,
          extraction_notes: 'Parsed directly from Excel tables',
          raw_data: extractedData
        };
      }
    } else if (fileType === 'image' || fileType === 'jpg' || fileType === 'png') {
      extractedData.text = await extractTextFromImage(documentBuffer);
    }

    const duration = Date.now() - startTime;
    const aiDetectionEndTime = Date.now();
    const aiDetectionDuration = aiDetectionEndTime - aiDetectionStartTime;
    console.log(`✅ Document parsing completed (${duration}ms)`);
    console.log(`🤖 [AI DETECTION COMPLETE] Total time: ${aiDetectionDuration}ms (${(aiDetectionDuration / 1000).toFixed(2)}s)`);

    const vendorContext = {
      fileType,
      text: extractedData.text,
      tables: extractedData.tables
    };
    extractedData.vendor_layout_signature = computeLayoutSignature(vendorContext);
    const vendorRule = findVendorRule(vendorContext);
    if (vendorRule && typeof vendorRule.apply === 'function') {
      const updatedData = await vendorRule.apply(extractedData, vendorContext);
      if (updatedData) {
        extractedData = updatedData;
      }
    }

    // Detect if this is a complex MTO document
    timing.phase('mtoDetection');
    const isMtoDocument = options.forceMtoExtraction ||
      (!options.forceSimpleRfq && await detectMtoDocument(extractedData));

    // Try to extract items directly from Document AI tables first (for both MTO and simple RFQ)
    const minTableItemsForReturn = 1; // Trust Document AI tables even with few items
    if (extractedData.tables && extractedData.tables.length > 0) {
      console.log(`\n========================================`);
      console.log(`📊 DOCUMENT AI TABLE EXTRACTION`);
      console.log(`========================================`);
      console.log(`Found ${extractedData.tables.length} tables - attempting direct table extraction...`);

      const tableStructured = extractItemsFromExcelTables(extractedData.tables, extractedData.sheetMetadata);

      if (tableStructured.items.length >= minTableItemsForReturn) {
        console.log(`✅ SUCCESS: Extracted ${tableStructured.items.length} items from Document AI tables`);
        console.log(`✅ SKIPPING GEMINI - Using deterministic table extraction instead`);
        console.log(`========================================\n`);

        const rfqReference = tableStructured.metadata?.rfq_number || null;
        const itemsWithReference = tableStructured.items.map(item => ({
          ...item,
          rfq_reference: item.rfq_reference || rfqReference
        }));

        timing.phase('materialMatching');
        timing.complete();

        const result = {
          document_type: isMtoDocument ? 'MTO' : 'RFQ',
          metadata: tableStructured.metadata,
          items: itemsWithReference,
          confidence: 0.95,
          extraction_notes: `✅ Document AI tables (${extractedData.tables.length} tables, ${itemsWithReference.length} items) - NO AI INFERENCE USED`,
          raw_data: extractedData,
          _extraction_method: 'document_ai_tables_direct'
        };

        console.log(`📦 Returning ${result.items.length} items with confidence ${result.confidence}`);
        
        // Cache the result for future use
        await cacheExtraction(documentBuffer, result);
        
        return result;
      } else {
        console.log(`⚠️  Only ${tableStructured.items.length} items extracted from tables (below threshold of ${minTableItemsForReturn})`);
        console.log(`========================================\n`);
      }
    }

    // Fallback to MTO extraction only if table extraction didn't work
    if (isMtoDocument) {
      console.log('?? Detected complex MTO document - using hierarchical extraction as fallback...');

      timing.phase('mtoExtraction');
      // Extract hierarchical MTO structure
      const mtoStructure = await extractHierarchicalMto(extractedData);

      // Verify weight calculations
      const weightVerification = verifyWeightCalculations(mtoStructure);
      mtoStructure.weight_verification = weightVerification;

      // Flatten to RFQ items for backward compatibility
      const flatItems = flattenMtoToRfqItems(mtoStructure);

      timing.phase('materialMatching');
      timing.complete();

      // Return both hierarchical structure and flat items
      const rfqReference = mtoStructure.metadata?.rfq_reference || mtoStructure.metadata?.rfq_number || null;

        const endProductItems = addEndProductFields(flatItems, rfqReference);

        const mtoResult = {
        document_type: 'MTO',
        metadata: mtoStructure.metadata || {},
        items: endProductItems, // For backward compatibility
        mto_structure: mtoStructure, // Full hierarchical structure
        confidence: mtoStructure.confidence || 0.8,
        extraction_notes: mtoStructure.extraction_notes || null,
        weight_verification: weightVerification,
        raw_data: extractedData
      };
      
      // Cache the result for future use
      await cacheExtraction(documentBuffer, mtoResult);
      
      return mtoResult;
    } else {
      console.log('⚠️  Falling back to Gemini LLM extraction (no tables or insufficient items)...');
      timing.phase('gptEnrichment');

      // Use Gemini to structure the extracted data into RFQ format (last resort fallback)
      const pageCount = extractedData.pageCount || 1;
      let structuredRFQ = await structureRFQWithGPT(extractedData, pageCount);

      timing.phase('materialMatching');
      timing.complete();
      
      // Cache the result for future use
      await cacheExtraction(documentBuffer, structuredRFQ);
      
      return structuredRFQ;
    }

  } catch (error) {
    console.error('❌ RFQ document parsing failed:', error.message);
    throw new Error(`Failed to parse RFQ document: ${error.message}`);
  }
}

/**
 * Use Vertex AI (Gemini) to structure extracted data into standard RFQ format
 * Supports automatic chunking for large documents
 * @param {Object} extractedData - Raw extracted data from Document AI
 * @param {number} pageCount - Number of pages in document (for chunking)
 * @returns {Promise<Object>} - Structured RFQ data
 */
async function structureRFQWithGPT(extractedData, pageCount = 1) {
  const { getPrompt } = require('../../ai/prompts');
  const promptDef = getPrompt('RFQ_STRUCTURE_V1');

  const prompt = [
    {
      role: 'system',
      content: promptDef.template.system
    },
    {
      role: 'user',
      content: typeof promptDef.template.user === 'function'
        ? promptDef.template.user(extractedData)
        : promptDef.template.user
    }
  ];

  try {
    const { logInfo } = require('../../utils/logger');
    logInfo('rfq_structure_ai_call_start', {
      promptId: promptDef.id,
      itemCount: extractedData.items?.length || 0,
      pageCount: pageCount
    });

    // Check if document should be chunked
    const documentData = {
      text: extractedData.text || '',
      pageCount: pageCount
    };

    const useChunking = shouldChunkDocument(documentData);

    let structured;

    if (useChunking) {
      console.log(`?? Large document detected (${pageCount} pages) - using chunked extraction...`);

      // Create chunks
      const chunks = createDocumentChunks(documentData);
      console.log(`   Created ${chunks.length} chunks for processing`);

      // Use chunked extraction
      structured = await callGPT4JSONChunked(prompt, {
        temperature: 0.2, // Lower temperature for more accurate extraction
        maxTokens: 32000, // Gemini 2.5 Pro (supports up to 65K)
        chunks: chunks
      });

      console.log(`? Chunked extraction complete: ${structured.items?.length || 0} items from ${chunks.length} chunks`);
    } else {
      console.log(`?? Standard extraction (${pageCount} pages)...`);

      // Calculate dynamic token allocation based on estimated item count
      // Estimate: count table rows or use conservative default
      const tables = extractedData.tables || [];
      let estimatedItemCount = 0;
      tables.forEach(table => {
        const rows = table.rows || [];
        const itemRows = rows.filter(row => {
          if (!row || typeof row !== 'object') return false;
          const values = Object.values(row).filter(v => v && String(v).trim().length > 0);
          return values.length >= 2; // At least 2 non-empty cells
        });
        estimatedItemCount += itemRows.length;
      });
      
      // If no tables, use conservative estimate based on page count
      if (estimatedItemCount === 0) {
        estimatedItemCount = Math.max(10, pageCount * 5); // ~5 items per page minimum
      }

      // Dynamic token calculation: base + per-item allowance
      const BASE_TOKENS = 4000;
      const TOKENS_PER_ITEM = 200;
      const MAX_TOKENS = 30000; // Gemini 2.5 Pro supports 32K, use 30K for safety
      const calculatedTokens = Math.min(BASE_TOKENS + (estimatedItemCount * TOKENS_PER_ITEM), MAX_TOKENS);

      console.log(`   Estimated ${estimatedItemCount} items, allocating ${calculatedTokens} tokens`);

      // Use standard extraction with dynamic token allocation
      structured = await callGPT4JSON(prompt, {
        temperature: 0.3,
        maxTokens: calculatedTokens
      });

      console.log(`? Standard extraction complete: ${structured.items?.length || 0} items`);
    }


    logInfo('rfq_structure_ai_call_end', {
      promptId: promptDef.id,
      itemCount: structured.items?.length || 0,
      confidence: structured.confidence,
      chunked: useChunking,
      chunkCount: useChunking ? structured._chunking?.totalChunks : 1
    });

    // Validate structure
    if (!structured.metadata || !structured.items || !Array.isArray(structured.items)) {
      throw new Error('Invalid structure returned by Vertex AI');
    }

    console.log(`✅ Vertex AI structured RFQ: ${structured.items.length} items, confidence: ${structured.confidence}`);
    const rfqReference = structured.metadata?.rfq_reference || structured.metadata?.rfq_number || null;
    structured.items = addEndProductFields(structured.items, rfqReference);


    return structured;

  } catch (error) {
    console.error('❌ Vertex AI structuring failed:', error.message);

    // Return fallback structure
    return {
      metadata: {
        customer_name: null,
        rfq_number: null,
        date: null,
        project: null
      },
      items: [],
      confidence: 0.0,
      extraction_notes: `Failed to structure with Vertex AI: ${error.message}`,
      raw_data: extractedData // Include raw data for manual review
    };
  }
}

/**
 * Validate extracted RFQ data
 * @param {Object} rfqData - Extracted RFQ data
 * @returns {Object} - Validation result with issues
 */
function validateExtractedRFQ(rfqData) {
  const isMissingValue = (value) => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'number') return Number.isNaN(value);
    if (typeof value === 'string') return value.trim().length === 0;
    return false;
  };

  const getFieldValue = (item, keys) => {
    for (const key of keys) {
      const value = item ? item[key] : undefined;
      if (!isMissingValue(value)) {
        return value;
      }
    }
    return null;
  };

  const countLikelyItemRows = (tables) => {
    if (!Array.isArray(tables)) return 0;
    let count = 0;
    tables.forEach(table => {
      (table.rows || []).forEach(row => {
        const values = Object.values(row || {})
          .map(value => String(value || '').trim())
          .filter(Boolean);
        if (values.length === 0) return;
        const hasNumericCell = values.some(value => /^\d+(\.\d+)?$/.test(value));
        const hasAlphaCell = values.some(value => /[A-Za-z]/.test(value));
        if (hasNumericCell && hasAlphaCell) {
          count += 1;
        }
      });
    });
    return count;
  };

  const issues = [];
  const warnings = [];
  const criticalMissing = {
    quantity: [],
    unit: [],
    material: [],
    size: []
  };

  // Check metadata
  if (!rfqData.metadata.customer_name) {
    issues.push('Missing customer name');
  }

  // Check items
  if (!rfqData.items || rfqData.items.length === 0) {
    issues.push('No items found in document');
  } else {
    rfqData.items.forEach((item, idx) => {
      if (!item.description || item.description.length < 5) {
        warnings.push(`Item ${idx + 1}: Description is missing or too short`);
      }

      const quantity = getFieldValue(item, ['quantity', 'qty', 'Qty']);
      const unit = getFieldValue(item, ['unit', 'Unit']);
      const material = getFieldValue(item, ['material', 'material_spec', 'materialSpec']);
      const size = getFieldValue(item, ['size', 'size1', 'Size1', 'typ_size']);

      if (isMissingValue(quantity) || Number(quantity) <= 0) {
        criticalMissing.quantity.push(idx + 1);
      }
      if (isMissingValue(unit)) {
        criticalMissing.unit.push(idx + 1);
      }
      if (isMissingValue(material)) {
        criticalMissing.material.push(idx + 1);
      }
      if (isMissingValue(size)) {
        criticalMissing.size.push(idx + 1);
      }
    });
  }

  const tableRowCount = countLikelyItemRows(rfqData.raw_data?.tables);
  const itemCount = rfqData.items?.length || 0;
  if (tableRowCount >= 10 && itemCount === 0) {
    issues.push(`Extraction returned 0 items but tables show ~${tableRowCount} line rows`);
  } else if (tableRowCount >= 10 && itemCount > 0) {
    const coverage = itemCount / tableRowCount;
    if (coverage < 0.8) {
      issues.push(`Extraction coverage too low (${(coverage * 100).toFixed(1)}% from ~${tableRowCount} detected rows)`);
    }
  }

  Object.entries(criticalMissing).forEach(([field, indices]) => {
    if (indices.length > 0) {
      const preview = indices.slice(0, 8).join(', ');
      issues.push(`Missing critical ${field} on ${indices.length} item(s): ${preview}${indices.length > 8 ? ', ...' : ''}`);
    }
  });

  // Check overall confidence
  if (rfqData.confidence < 0.7) {
    warnings.push('Low confidence extraction - manual review recommended');
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    needsReview: issues.length > 0 || warnings.length > 0 || rfqData.confidence < 0.8,
    blockAutoQuote: issues.length > 0,
    diagnostics: {
      tableRowCount,
      itemCount,
      criticalMissing
    }
  };
}

/**
 * Process a single document chunk with GCP Document AI
 * @param {Buffer} fileBuffer - Document buffer
 * @param {string} mimeType - MIME type
 * @returns {Promise<Object>} Document AI response
 */
async function processDocumentSingle(fileBuffer, mimeType = 'application/pdf') {
  const client = initializeDocIntelligenceClient();
  const { timeAsync } = require('../../utils/timing');

  console.log(`[GCP Document AI] Processing ${mimeType} document`);
  console.log(`[GCP Document AI] File size: ${fileBuffer.length} bytes`);

  const result = await timeAsync(
    'Google Document AI - Process Document',
    async () => {
      const request = {
        name: processorName,
        rawDocument: {
          content: fileBuffer.toString('base64'),
          mimeType: mimeType,
        },
      };

      const [response] = await client.processDocument(request);
      return response;
    },
    { documentSize: fileBuffer.length }
  );

  console.log(`[GCP Document AI] Processing complete`);
  return result;
}

/**
 * Process document in chunks if it exceeds page limit
 * @param {Buffer} fileBuffer - Document buffer
 * @param {string} mimeType - MIME type
 * @param {number} maxPages - Maximum pages per chunk (GCP limit is 30)
 * @returns {Promise<Object>} Combined Document AI response
 */
async function processDocumentInChunks(fileBuffer, mimeType, maxPages = 15) {
  const { PDFDocument } = require('pdf-lib');
  const sourceDoc = await PDFDocument.load(fileBuffer);
  const totalPages = sourceDoc.getPageCount();
  const chunks = [];

  console.log(`[GCP Document AI] Chunking ${totalPages}-page document into ${maxPages}-page segments...`);

  // Create PDF chunks
  for (let start = 0; start < totalPages; start += maxPages) {
    const end = Math.min(start + maxPages, totalPages);
    const newDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await newDoc.copyPages(sourceDoc, pageIndices);
    pages.forEach(page => newDoc.addPage(page));
    const bytes = await newDoc.save();
    chunks.push({
      buffer: Buffer.from(bytes),
      startPage: start + 1,
      endPage: end,
      pageCount: end - start
    });
  }

  // Process each chunk
  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[GCP Document AI] Processing chunk ${i + 1}/${chunks.length} (pages ${chunk.startPage}-${chunk.endPage})...`);
    const chunkResult = await processDocumentSingle(chunk.buffer, mimeType);
    results.push({
      ...chunkResult,
      _chunkInfo: {
        index: i,
        startPage: chunk.startPage,
        endPage: chunk.endPage
      }
    });
  }

  // Merge results
  console.log(`[GCP Document AI] Merging ${results.length} chunks...`);

  const mergedDocument = {
    text: '',
    pages: [],
    entities: [],
    textStyles: []
  };

  let pageOffset = 0;
  results.forEach((result, idx) => {
    const doc = result.document;

    // Append text
    if (doc.text) {
      mergedDocument.text += doc.text;
    }

    // Merge pages with adjusted page numbers
    if (doc.pages) {
      doc.pages.forEach(page => {
        mergedDocument.pages.push({
          ...page,
          pageNumber: pageOffset + (page.pageNumber || 1)
        });
      });
      pageOffset += doc.pages.length;
    }

    // Merge entities
    if (doc.entities) {
      mergedDocument.entities.push(...doc.entities);
    }

    // Merge text styles
    if (doc.textStyles) {
      mergedDocument.textStyles.push(...doc.textStyles);
    }
  });

  console.log(`[GCP Document AI] Merged ${mergedDocument.pages.length} pages from ${chunks.length} chunks`);

  return {
    document: mergedDocument,
    _chunked: true,
    _chunkCount: chunks.length
  };
}

/**
 * Process document with GCP Document AI (generic interface)
 * Automatically handles chunking for documents exceeding page limits
 * @param {Buffer} fileBuffer - Document buffer
 * @param {string} mimeType - MIME type
 * @returns {Promise<Object>} Document AI response
 */
async function processDocument(fileBuffer, mimeType = 'application/pdf') {
  try {
    // Try processing the full document first
    return await processDocumentSingle(fileBuffer, mimeType);
  } catch (error) {
    const message = error.message || '';

    // Check if error is due to page limit
    if (/exceed the limit|pages exceed the limit|page limit/i.test(message)) {
      console.warn('[GCP Document AI] Page limit exceeded - retrying with chunked processing...');

      // Only chunk PDFs
      if (mimeType === 'application/pdf') {
        return await processDocumentInChunks(fileBuffer, mimeType, 15);
      }
    }

    // Re-throw if not a page limit error or not a PDF
    throw error;
  }
}

module.exports = {
  initializeDocIntelligenceClient,
  extractTablesFromPDF: extractTablesFromPDFWithPreScreening,
  extractTextFromImage,
  parseRFQDocument,
  structureRFQWithGPT,
  validateExtractedRFQ,
  detectMtoDocument, // Export for use in other services
  processDocument, // Generic document processing interface
  extractItemsFromExcelTables // Export for direct table extraction in aiRoutes
};
