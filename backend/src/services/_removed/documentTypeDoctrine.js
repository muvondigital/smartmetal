/**
 * Document Type Doctrine
 *
 * Infers document type from filename or content:
 * - RFQ: Request for Quotation
 * - MTO: Material Take-Off
 * - PRICE_LIST: Supplier price list
 * - TECHNICAL_SPEC: Technical specifications
 * - UNKNOWN: Cannot determine
 *
 * Developed by Muvon Digital (Muvon Energy)
 */

const DOCUMENT_TYPES = {
  RFQ: 'RFQ',
  MTO: 'MTO',
  PRICE_LIST: 'PRICE_LIST',
  TECHNICAL_SPEC: 'TECHNICAL_SPEC',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Infer document type from filename
 *
 * @param {string} filename - Document filename
 * @returns {string} Document type
 */
function inferDocumentType(filename) {
  if (!filename || typeof filename !== 'string') {
    return DOCUMENT_TYPES.UNKNOWN;
  }

  const fname = filename.toUpperCase();

  // Check for RFQ indicators
  if (fname.includes('RFQ') || fname.includes('REQUEST') || fname.includes('QUOTATION')) {
    return DOCUMENT_TYPES.RFQ;
  }

  // Check for MTO indicators
  if (fname.includes('MTO') || fname.includes('MATERIAL TAKE') || fname.includes('BOM') || fname.includes('BILL OF MATERIAL')) {
    return DOCUMENT_TYPES.MTO;
  }

  // Check for price list indicators
  if (fname.includes('PRICE') || fname.includes('PRICELIST') || fname.includes('RATE')) {
    return DOCUMENT_TYPES.PRICE_LIST;
  }

  // Check for technical spec indicators
  if (fname.includes('SPEC') || fname.includes('TECHNICAL') || fname.includes('DATASHEET')) {
    return DOCUMENT_TYPES.TECHNICAL_SPEC;
  }

  return DOCUMENT_TYPES.UNKNOWN;
}

module.exports = {
  DOCUMENT_TYPES,
  inferDocumentType,
};
