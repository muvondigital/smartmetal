/**
 * Document Type Doctrine Tests
 *
 * Tests for intelligent document type detection
 */

const {
  DOCUMENT_TYPES,
  inferDocumentType,
  inferTypeFromFilename,
  inferTypeFromContent,
  getDocumentTypeLabel,
  getDocumentTypeAbbreviation,
  isValidDocumentType
} = require('../documentTypeDoctrine');

describe('Document Type Doctrine', () => {
  describe('inferTypeFromFilename', () => {
    describe('MTO detection', () => {
      it('should detect MTO from standard MTO filename', () => {
        expect(inferTypeFromFilename('FGLNG-S-60-PIP-MTO-0001.pdf')).toBe('MTO');
      });

      it('should detect MTO from "Material Take-Off" in filename', () => {
        expect(inferTypeFromFilename('Piping Material Take-Off Rev B.xlsx')).toBe('MTO');
      });

      it('should detect MTO from "Material Takeoff" (no hyphen)', () => {
        expect(inferTypeFromFilename('Material_Takeoff_2025.pdf')).toBe('MTO');
      });

      it('should detect PMTO (Piping Material Take-Off)', () => {
        expect(inferTypeFromFilename('PMTO-Project-A.xlsx')).toBe('MTO');
      });

      it('should be case insensitive', () => {
        expect(inferTypeFromFilename('project-mto-final.pdf')).toBe('MTO');
        expect(inferTypeFromFilename('PIPING-MTO-2025.PDF')).toBe('MTO');
      });
    });

    describe('PO detection', () => {
      it('should detect PO from standard PO filename', () => {
        expect(inferTypeFromFilename('PO-12345.pdf')).toBe('PO');
      });

      it('should detect P.O. with periods', () => {
        expect(inferTypeFromFilename('P.O. 2025-001.pdf')).toBe('PO');
      });

      it('should detect "Purchase Order" in filename', () => {
        expect(inferTypeFromFilename('Purchase_Order_Draft.xlsx')).toBe('PO');
      });
    });

    describe('BOQ detection', () => {
      it('should detect BOQ from filename', () => {
        expect(inferTypeFromFilename('BOQ-Phase1.xlsx')).toBe('BOQ');
      });

      it('should detect "Bill of Quantities" in filename', () => {
        expect(inferTypeFromFilename('Bill_of_Quantities_Final.pdf')).toBe('BOQ');
      });
    });

    describe('Tender detection', () => {
      it('should detect TENDER from filename', () => {
        expect(inferTypeFromFilename('Tender-Package-A.pdf')).toBe('Tender');
      });

      it('should detect BID from filename', () => {
        expect(inferTypeFromFilename('BID-2025-001.pdf')).toBe('Tender');
      });

      it('should detect ITT (Invitation to Tender)', () => {
        expect(inferTypeFromFilename('ITT-Construction-Phase2.pdf')).toBe('Tender');
      });

      it('should detect "tender document" in filename', () => {
        expect(inferTypeFromFilename('tender_document_final.pdf')).toBe('Tender');
      });
    });

    describe('Change Order detection', () => {
      it('should detect "Change Order" in filename', () => {
        expect(inferTypeFromFilename('Change_Order_123.pdf')).toBe('Change Order');
      });

      it('should detect CO with number pattern', () => {
        expect(inferTypeFromFilename('CO-2025-001.pdf')).toBe('Change Order');
      });

      it('should detect "Variation Order"', () => {
        expect(inferTypeFromFilename('Variation_Order_Final.pdf')).toBe('Change Order');
      });
    });

    describe('Re-quote detection', () => {
      it('should detect "Re-quote" in filename', () => {
        expect(inferTypeFromFilename('Re-quote_Request.pdf')).toBe('Re-quote');
      });

      it('should detect "Requote" (no hyphen)', () => {
        expect(inferTypeFromFilename('Requote-2025.pdf')).toBe('Re-quote');
      });

      it('should detect "Revised Quote"', () => {
        expect(inferTypeFromFilename('Revised_Quote_v2.pdf')).toBe('Re-quote');
      });
    });

    describe('Budget detection', () => {
      it('should detect BUDGET from filename', () => {
        expect(inferTypeFromFilename('BUDGET-2025-Q1.xlsx')).toBe('Budget');
      });

      it('should detect "Budget Estimate"', () => {
        expect(inferTypeFromFilename('Budget_Estimate_Draft.pdf')).toBe('Budget');
      });

      it('should detect "Cost Estimate"', () => {
        expect(inferTypeFromFilename('Cost_Estimate_Preliminary.xlsx')).toBe('Budget');
      });
    });

    describe('RFQ detection (lowest priority)', () => {
      it('should detect RFQ from filename', () => {
        expect(inferTypeFromFilename('RFQ-2025-001.pdf')).toBe('RFQ');
      });

      it('should detect "Request for Quote"', () => {
        expect(inferTypeFromFilename('Request_for_Quote.pdf')).toBe('RFQ');
      });

      it('should detect "Request for Quotation"', () => {
        expect(inferTypeFromFilename('Request_for_Quotation.xlsx')).toBe('RFQ');
      });
    });

    describe('Priority ordering', () => {
      it('should prioritize MTO over RFQ when both are present', () => {
        // MTO is more specific than RFQ
        expect(inferTypeFromFilename('RFQ-MTO-2025-001.pdf')).toBe('MTO');
      });

      it('should prioritize PO over RFQ when both are present', () => {
        expect(inferTypeFromFilename('RFQ-PO-12345.pdf')).toBe('PO');
      });
    });

    describe('Edge cases', () => {
      it('should return null for generic filename with no type indicators', () => {
        expect(inferTypeFromFilename('document.pdf')).toBeNull();
      });

      it('should return null for empty filename', () => {
        expect(inferTypeFromFilename('')).toBeNull();
      });

      it('should return null for null filename', () => {
        expect(inferTypeFromFilename(null)).toBeNull();
      });

      it('should return null for undefined filename', () => {
        expect(inferTypeFromFilename(undefined)).toBeNull();
      });
    });
  });

  describe('inferTypeFromContent', () => {
    it('should detect MTO from document header', () => {
      const content = `
        MATERIAL TAKE-OFF
        Project: FGEN LNG Corporation
        Document Number: FGLNG-S-60-PIP-MTO-0001
        Revision: B
      `;
      expect(inferTypeFromContent(content)).toBe('MTO');
    });

    it('should detect RFQ from document header', () => {
      const content = `
        REQUEST FOR QUOTATION
        Date: 2025-12-18
        RFQ Number: RFQ-2025-001
      `;
      expect(inferTypeFromContent(content)).toBe('RFQ');
    });

    it('should detect Tender from document header', () => {
      const content = `
        TENDER DOCUMENT
        Invitation to Tender
        Project: Highway Construction Phase 2
      `;
      expect(inferTypeFromContent(content)).toBe('Tender');
    });

    it('should only analyze first 500 characters', () => {
      const longContent = 'A'.repeat(600) + '\nMATERIAL TAKE-OFF';
      // MTO is beyond 500 chars, should not be detected
      expect(inferTypeFromContent(longContent)).toBeNull();
    });

    it('should return null for content with no type indicators', () => {
      const content = 'Some generic document content without type indicators';
      expect(inferTypeFromContent(content)).toBeNull();
    });

    it('should return null for null content', () => {
      expect(inferTypeFromContent(null)).toBeNull();
    });
  });

  describe('inferDocumentType (main function)', () => {
    it('should prioritize filename detection over content', () => {
      const result = inferDocumentType({
        filename: 'FGLNG-MTO-001.pdf',
        extractedText: 'REQUEST FOR QUOTATION\n...'
      });
      expect(result).toBe('MTO'); // Filename wins
    });

    it('should fall back to content detection if filename has no match', () => {
      const result = inferDocumentType({
        filename: 'document.pdf',
        extractedText: 'MATERIAL TAKE-OFF\nProject ABC'
      });
      expect(result).toBe('MTO'); // Content detection works
    });

    it('should use metadata hint if filename and content have no match', () => {
      const result = inferDocumentType({
        filename: 'document.pdf',
        extractedText: 'Generic content',
        metadataHint: 'PO'
      });
      expect(result).toBe('PO');
    });

    it('should default to RFQ if no detection signals', () => {
      const result = inferDocumentType({
        filename: 'document.pdf',
        extractedText: 'Generic content'
      });
      expect(result).toBe('RFQ'); // Backward compatibility default
    });

    it('should ignore invalid metadata hints', () => {
      const result = inferDocumentType({
        filename: 'document.pdf',
        extractedText: 'Generic content',
        metadataHint: 'INVALID_TYPE'
      });
      expect(result).toBe('RFQ'); // Falls back to default
    });

    it('should work with only filename', () => {
      const result = inferDocumentType({
        filename: 'BOQ-Phase1.xlsx'
      });
      expect(result).toBe('BOQ');
    });

    it('should work with only content', () => {
      const result = inferDocumentType({
        extractedText: 'PURCHASE ORDER\nPO Number: 12345'
      });
      expect(result).toBe('PO');
    });

    it('should handle empty object', () => {
      const result = inferDocumentType({});
      expect(result).toBe('RFQ');
    });

    it('should handle no parameters', () => {
      const result = inferDocumentType();
      expect(result).toBe('RFQ');
    });
  });

  describe('getDocumentTypeLabel', () => {
    it('should return full label for RFQ', () => {
      expect(getDocumentTypeLabel('RFQ')).toBe('Request for Quotation');
    });

    it('should return full label for MTO', () => {
      expect(getDocumentTypeLabel('MTO')).toBe('Material Take-Off');
    });

    it('should return full label for PO', () => {
      expect(getDocumentTypeLabel('PO')).toBe('Purchase Order');
    });

    it('should return full label for BOQ', () => {
      expect(getDocumentTypeLabel('BOQ')).toBe('Bill of Quantities');
    });

    it('should return full label for Budget', () => {
      expect(getDocumentTypeLabel('Budget')).toBe('Budget Estimate');
    });

    it('should return full label for Tender', () => {
      expect(getDocumentTypeLabel('Tender')).toBe('Tender');
    });

    it('should return full label for Change Order', () => {
      expect(getDocumentTypeLabel('Change Order')).toBe('Change Order');
    });

    it('should return full label for Re-quote', () => {
      expect(getDocumentTypeLabel('Re-quote')).toBe('Re-quote');
    });

    it('should return "Commercial Request" for unknown type', () => {
      expect(getDocumentTypeLabel('UNKNOWN')).toBe('Commercial Request');
    });

    it('should return "Commercial Request" for null', () => {
      expect(getDocumentTypeLabel(null)).toBe('Commercial Request');
    });
  });

  describe('getDocumentTypeAbbreviation', () => {
    it('should return abbreviation for RFQ', () => {
      expect(getDocumentTypeAbbreviation('RFQ')).toBe('RFQ');
    });

    it('should return abbreviation for MTO', () => {
      expect(getDocumentTypeAbbreviation('MTO')).toBe('MTO');
    });

    it('should return abbreviation for Change Order', () => {
      expect(getDocumentTypeAbbreviation('Change Order')).toBe('CO');
    });

    it('should return abbreviation for Re-quote', () => {
      expect(getDocumentTypeAbbreviation('Re-quote')).toBe('REQUOTE');
    });

    it('should return default RFQ for unknown type', () => {
      expect(getDocumentTypeAbbreviation('UNKNOWN')).toBe('RFQ');
    });
  });

  describe('isValidDocumentType', () => {
    it('should validate all supported document types', () => {
      expect(isValidDocumentType('RFQ')).toBe(true);
      expect(isValidDocumentType('PO')).toBe(true);
      expect(isValidDocumentType('MTO')).toBe(true);
      expect(isValidDocumentType('BOQ')).toBe(true);
      expect(isValidDocumentType('Budget')).toBe(true);
      expect(isValidDocumentType('Tender')).toBe(true);
      expect(isValidDocumentType('Change Order')).toBe(true);
      expect(isValidDocumentType('Re-quote')).toBe(true);
    });

    it('should reject invalid document types', () => {
      expect(isValidDocumentType('INVALID')).toBe(false);
      expect(isValidDocumentType('rfq')).toBe(false); // Case sensitive
      expect(isValidDocumentType(null)).toBe(false);
      expect(isValidDocumentType(undefined)).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    it('should correctly classify FGEN LNG MTO document', () => {
      const result = inferDocumentType({
        filename: 'FGLNG-S-60-PIP-MTO-0001.pdf',
        extractedText: `
          MATERIAL TAKE-OFF
          PIPING MATERIAL TAKE OFF - TIE-IN VALVE REPLACEMENT
          Project: FGEN LNG MULTI-PURPOSE JETTY AND GAS RECEIVING FACILITY
          Document Number: FGLNG-S-60-PIP-MTO-0001
          Revision: B
        `
      });
      expect(result).toBe('MTO');
    });

    it('should correctly classify standard RFQ', () => {
      const result = inferDocumentType({
        filename: 'RFQ-2025-001.xlsx',
        extractedText: 'REQUEST FOR QUOTATION\nProject: Pipeline Installation'
      });
      expect(result).toBe('RFQ');
    });

    it('should correctly classify PO from generic filename but PO content', () => {
      const result = inferDocumentType({
        filename: 'vendor-document.pdf',
        extractedText: 'PURCHASE ORDER\nPO #: 45678\nVendor: ABC Corp'
      });
      expect(result).toBe('PO');
    });
  });
});
