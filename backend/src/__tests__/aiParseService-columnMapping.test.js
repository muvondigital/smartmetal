const {
  normalizeHeader,
  isDescriptionColumn,
  isQuantityColumn,
  isUnitColumn,
  isNotesColumn,
  extractLineItemsFromTable,
} = require('../../src/services/aiParseService');

describe('Column Mapping Functions', () => {
  describe('normalizeHeader', () => {
    it('should normalize "Descriptions" correctly', () => {
      const normalized = normalizeHeader('Descriptions');
      expect(normalized).toBe('descriptions');
    });

    it('should normalize "Round Quantity (pcs)" correctly', () => {
      const normalized = normalizeHeader('Round Quantity (pcs)');
      expect(normalized).toBe('round quantity');
    });

    it('should handle multiple spaces', () => {
      const normalized = normalizeHeader('Round   Quantity   (pcs)');
      expect(normalized).toBe('round quantity');
    });

    it('should handle trailing punctuation', () => {
      const normalized = normalizeHeader('Description.');
      expect(normalized).toBe('description');
    });

    it('should handle mixed case', () => {
      const normalized = normalizeHeader('DeScRiPtIoN');
      expect(normalized).toBe('description');
    });
  });

  describe('isDescriptionColumn', () => {
    it('should match "Descriptions" (plural)', () => {
      expect(isDescriptionColumn('Descriptions')).toBe(true);
    });

    it('should match "description" (singular)', () => {
      expect(isDescriptionColumn('description')).toBe(true);
    });

    it('should match "Item Description"', () => {
      expect(isDescriptionColumn('Item Description')).toBe(true);
    });

    it('should match "Material Description"', () => {
      expect(isDescriptionColumn('Material Description')).toBe(true);
    });

    it('should not match "Quantity"', () => {
      expect(isDescriptionColumn('Quantity')).toBe(false);
    });
  });

  describe('isQuantityColumn', () => {
    it('should match "Round Quantity (pcs)"', () => {
      expect(isQuantityColumn('Round Quantity (pcs)')).toBe(true);
    });

    it('should match "Round Quantity"', () => {
      expect(isQuantityColumn('Round Quantity')).toBe(true);
    });

    it('should match "Round Qty"', () => {
      expect(isQuantityColumn('Round Qty')).toBe(true);
    });

    it('should match "Quantity"', () => {
      expect(isQuantityColumn('Quantity')).toBe(true);
    });

    it('should match "Qty"', () => {
      expect(isQuantityColumn('Qty')).toBe(true);
    });

    it('should match "PCS"', () => {
      expect(isQuantityColumn('PCS')).toBe(true);
    });

    it('should not match "Unit"', () => {
      expect(isQuantityColumn('Unit')).toBe(false);
    });
  });

  describe('isUnitColumn', () => {
    it('should match "Unit"', () => {
      expect(isUnitColumn('Unit')).toBe(true);
    });

    it('should match "UOM"', () => {
      expect(isUnitColumn('UOM')).toBe(true);
    });

    it('should not match "Quantity"', () => {
      expect(isUnitColumn('Quantity')).toBe(false);
    });
  });

  describe('isNotesColumn', () => {
    it('should match "Remarks"', () => {
      expect(isNotesColumn('Remarks')).toBe(true);
    });

    it('should match "Shipment, Remarks"', () => {
      expect(isNotesColumn('Shipment, Remarks')).toBe(true);
    });

    it('should match "Notes"', () => {
      expect(isNotesColumn('Notes')).toBe(true);
    });

    it('should not match "Description"', () => {
      expect(isNotesColumn('Description')).toBe(false);
    });
  });

  describe('PetroVietnam Appendix Table Headers', () => {
    const headers = [
      'Item',
      'Material Type',
      'Descriptions',
      'Type',
      'Unit',
      'Unit Weight...',
      'Req. Length/Area...',
      'Typ. Size...',
      'Round Quantity (pcs)',
      'Total Length/Area...',
      'Total Weight (MT)',
      'Portion Consider',
      'Shipment, Remarks'
    ];

    it('should correctly identify column indices for PetroVietnam headers', () => {
      // This test simulates the column mapping logic
      const columnMap = {
        itemIdx: -1,
        descriptionIdx: -1,
        quantityIdx: -1,
        unitIdx: -1,
        notesIdx: -1,
      };

      headers.forEach((header, idx) => {
        if (isDescriptionColumn(header)) {
          columnMap.descriptionIdx = idx;
        } else if (isQuantityColumn(header)) {
          columnMap.quantityIdx = idx;
        } else if (isUnitColumn(header)) {
          columnMap.unitIdx = idx;
        } else if (isNotesColumn(header)) {
          columnMap.notesIdx = idx;
        }
      });

      // Find Item column (first column)
      columnMap.itemIdx = 0;

      expect(columnMap.itemIdx).toBe(0);
      expect(columnMap.descriptionIdx).toBe(2); // "Descriptions"
      expect(columnMap.quantityIdx).toBe(8); // "Round Quantity (pcs)"
      expect(columnMap.unitIdx).toBe(4); // "Unit"
      expect(columnMap.notesIdx).toBe(12); // "Shipment, Remarks"
    });
  });

  describe('Hybrid Extraction', () => {
    it('should extract raw items from table rows with PetroVietnam headers', () => {
      // Simulate PetroVietnam Appendix table structure
      const table = {
        rows: [
          // Header row
          ['Item', 'Material Type', 'Descriptions', 'Type', 'Unit', 'Unit Weight...', 'Req. Length/Area...', 'Typ. Size...', 'Round Quantity (pcs)', 'Total Length/Area...', 'Total Weight (MT)', 'Portion Consider', 'Shipment, Remarks'],
          // Data row 1
          ['1', 'Pipe', 'Carbon Steel Pipe 6" SCH40', 'Seamless', 'MT', '50.5', '100', '6"', '10', '1000', '50.5', '100%', 'Port A'],
          // Data row 2
          ['2', 'Fitting', 'Elbow 90deg 6"', 'Welded', 'PCS', '2.5', '20', '6"', '5', '100', '12.5', '100%', 'Port B'],
        ],
      };

      const candidate = {
        headerRowIndex: 0,
        dataStartRowIndex: 1,
        columnMap: {
          itemIdx: 0,
          descriptionIdx: 2,
          quantityIdx: 8,
          unitIdx: 4,
          specIdx: -1,
          size1Idx: -1,
          size2Idx: -1,
          notesIdx: 12,
          revisionIdx: -1,
        },
        tableIndex: 0,
      };

      const rawItems = extractLineItemsFromTable(table, candidate);

      expect(rawItems.length).toBe(2);
      expect(rawItems[0].line_number).toBe(1);
      expect(rawItems[0].description).toBe('Carbon Steel Pipe 6" SCH40');
      expect(rawItems[0].quantity).toBe(10);
      expect(rawItems[0].unit).toBe('MT');
      expect(rawItems[0].notes).toBe('Port A');
      expect(rawItems[0].extra_fields).toBeDefined();
      expect(rawItems[0].extra_fields.material_type).toBe('Pipe');
      expect(rawItems[0].extra_fields.type).toBe('Seamless');

      expect(rawItems[1].line_number).toBe(2);
      expect(rawItems[1].description).toBe('Elbow 90deg 6"');
      expect(rawItems[1].quantity).toBe(5);
      expect(rawItems[1].unit).toBe('PCS');
      expect(rawItems[1].notes).toBe('Port B');
    });

    it('should handle missing optional fields gracefully', () => {
      const table = {
        rows: [
          ['Item', 'Description', 'Quantity', 'Unit'],
          ['1', 'Test Item', '5', 'PCS'],
        ],
      };

      const candidate = {
        headerRowIndex: 0,
        dataStartRowIndex: 1,
        columnMap: {
          itemIdx: 0,
          descriptionIdx: 1,
          quantityIdx: 2,
          unitIdx: 3,
          specIdx: -1,
          size1Idx: -1,
          size2Idx: -1,
          notesIdx: -1,
          revisionIdx: -1,
        },
        tableIndex: 0,
      };

      const rawItems = extractLineItemsFromTable(table, candidate);

      expect(rawItems.length).toBe(1);
      expect(rawItems[0].line_number).toBe(1);
      expect(rawItems[0].description).toBe('Test Item');
      expect(rawItems[0].quantity).toBe(5);
      expect(rawItems[0].unit).toBe('PCS');
      expect(rawItems[0].notes).toBeNull();
      expect(rawItems[0].spec).toBeNull();
    });
  });
});
