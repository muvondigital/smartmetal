/**
 * Unit tests for table scoring logic
 * Tests the pure scoring functions to ensure correct table selection
 */

const { scoreTableCandidate, pickBestTable, normalizeHeaderToken, SCORING_CONFIG } = require('../src/services/rfqExtraction/tableScoring');

describe('Table Scoring', () => {
  describe('normalizeHeaderToken', () => {
    it('should normalize to lowercase and trim', () => {
      expect(normalizeHeaderToken('  Item  ')).toBe('item');
      expect(normalizeHeaderToken('DESCRIPTION')).toBe('description');
    });

    it('should remove punctuation', () => {
      expect(normalizeHeaderToken('Rev.')).toBe('rev');
      expect(normalizeHeaderToken('Q\'ty')).toBe('qty');
      expect(normalizeHeaderToken('(Item)')).toBe('item');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeHeaderToken('Item   Number')).toBe('item number');
      expect(normalizeHeaderToken('Round  Quantity')).toBe('round quantity');
    });

    it('should handle empty or invalid input', () => {
      expect(normalizeHeaderToken('')).toBe('');
      expect(normalizeHeaderToken(null)).toBe('');
      expect(normalizeHeaderToken(undefined)).toBe('');
    });
  });

  describe('scoreTableCandidate - Revision/Approval Tables', () => {
    it('should score revision/approval table below threshold', () => {
      const headers = ['Rev.', 'Date', 'Description', 'Approved by RNZ', 'Approved by PVEP-POC'];
      const result = scoreTableCandidate(headers);

      // This table should be penalized heavily for revision/approval keywords
      expect(result.score).toBeLessThan(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
      expect(result.signals.has_revision_group).toBe(true);
      expect(result.reasons.some(r => r.includes('revision_penalty'))).toBe(true);
    });

    it('should detect revision group with various formats', () => {
      const testCases = [
        ['Rev', 'Prepared', 'Checked', 'Approved'],
        ['Revision', 'Date', 'Signature'],
        ['Rev.', 'Verified by', 'Signed by']
      ];

      testCases.forEach(headers => {
        const result = scoreTableCandidate(headers);
        expect(result.signals.has_revision_group).toBe(true);
        expect(result.score).toBeLessThan(0); // Should be negative
      });
    });
  });

  describe('scoreTableCandidate - MTO/BOQ Tables', () => {
    it('should score MTO-style table above threshold', () => {
      const headers = [
        'Item',
        'Descriptions',
        'Unit',
        'Round Quantity',
        'Total Weight',
        'Shipment 1',
        'Shipment 2'
      ];
      const result = scoreTableCandidate(headers);

      // This table should score well
      expect(result.score).toBeGreaterThanOrEqual(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
      expect(result.signals.has_item_group).toBe(true);
      expect(result.signals.has_description_group).toBe(true);
      expect(result.signals.has_quantity_group).toBe(true);
      expect(result.signals.has_unit_group).toBe(true);
      expect(result.reasons.some(r => r.includes('item_group'))).toBe(true);
    });

    it('should detect core groups correctly', () => {
      const headers = ['Item', 'Description', 'Qty', 'Unit'];
      const result = scoreTableCandidate(headers);

      expect(result.signals.has_item_group).toBe(true);
      expect(result.signals.has_description_group).toBe(true);
      expect(result.signals.has_quantity_group).toBe(true);
      expect(result.signals.has_unit_group).toBe(true);
      expect(result.signals.core_group_count).toBe(4);
      expect(result.reasons.some(r => r.includes('multi_group_bonus'))).toBe(true);
    });

    it('should award numeric item bonus', () => {
      const headers = ['Item', 'Description', 'Quantity'];
      const sampleRows = [
        ['1', 'Pipe 6 inch', '10'],
        ['2', 'Pipe 4 inch', '20'],
        ['3', 'Elbow 90 deg', '15']
      ];
      const result = scoreTableCandidate(headers, sampleRows);

      expect(result.signals.has_numeric_items).toBe(true);
      expect(result.reasons.some(r => r.includes('numeric_item_bonus'))).toBe(true);
    });
  });

  describe('scoreTableCandidate - Inspection/VDRL Tables', () => {
    it('should penalize inspection matrix table', () => {
      const headers = ['Inspection', 'Witness', 'Hold', 'Remarks', 'Rev'];
      const result = scoreTableCandidate(headers);

      expect(result.score).toBeLessThan(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
      expect(result.signals.has_inspection_group).toBe(true);
      expect(result.reasons.some(r => r.includes('inspection_penalty'))).toBe(true);
    });

    it('should penalize VDRL table', () => {
      const headers = ['Vendor', 'Data Requirement', 'Document List', 'Status'];
      const result = scoreTableCandidate(headers);

      expect(result.signals.has_vdrl_group).toBe(true);
      expect(result.reasons.some(r => r.includes('vdrl_penalty'))).toBe(true);
    });
  });

  describe('scoreTableCandidate - Structure Heuristics', () => {
    it('should penalize tables with too few headers', () => {
      const headers = ['A', 'B'];
      const result = scoreTableCandidate(headers);

      expect(result.signals.min_headers).toBe(false);
      expect(result.reasons.some(r => r.includes('min_headers_penalty'))).toBe(true);
    });

    it('should penalize sparse rows', () => {
      const headers = ['Item', 'Description', 'Qty', 'Unit'];
      const sampleRows = [
        ['', '', '', ''],
        ['1', '', '', ''],
        ['', '', '', ''],
        ['', 'Something', '', ''],
        ['', '', '', '']
      ];
      const result = scoreTableCandidate(headers, sampleRows);

      expect(result.reasons.some(r => r.includes('sparse_rows_penalty'))).toBe(true);
    });

    it('should not penalize dense rows', () => {
      const headers = ['Item', 'Description', 'Qty', 'Unit'];
      const sampleRows = [
        ['1', 'Pipe 6 inch', '10', 'EA'],
        ['2', 'Pipe 4 inch', '20', 'EA'],
        ['3', 'Elbow 90 deg', '15', 'PC']
      ];
      const result = scoreTableCandidate(headers, sampleRows);

      expect(result.reasons.some(r => r.includes('sparse_rows_penalty'))).toBe(false);
    });
  });

  describe('pickBestTable - Selection Logic', () => {
    it('should pick MTO table over revision table', () => {
      const tables = [
        {
          tableIndex: 0,
          headers: ['Rev.', 'Date', 'Description', 'Approved by RNZ', 'Approved by PVEP-POC'],
          rows: [['A', '2024-01-01', 'Initial', 'John', 'Jane']]
        },
        {
          tableIndex: 1,
          headers: ['Item', 'Descriptions', 'Unit', 'Round Quantity', 'Total Weight', 'Shipment 1'],
          rows: [['1', 'Pipe 6 inch', 'EA', '10', '500', 'Batch 1']]
        }
      ];

      const result = pickBestTable(tables);

      expect(result.best).not.toBeNull();
      expect(result.best.tableIndex).toBe(1); // MTO table
      expect(result.ranked).toHaveLength(2);
      expect(result.ranked[0].tableIndex).toBe(1); // MTO table ranked first
      expect(result.ranked[0].score).toBeGreaterThanOrEqual(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
    });

    it('should return null if no table meets threshold', () => {
      const tables = [
        {
          tableIndex: 0,
          headers: ['Rev', 'Date', 'Approved'],
          rows: [['A', '2024-01-01', 'Yes']]
        },
        {
          tableIndex: 1,
          headers: ['Inspection', 'Witness', 'Hold'],
          rows: [['Type A', 'Yes', 'No']]
        }
      ];

      const result = pickBestTable(tables);

      expect(result.best).toBeNull();
      expect(result.ranked).toHaveLength(2);
      expect(result.ranked[0].score).toBeLessThan(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
    });

    it('should handle tie-break by item group presence', () => {
      const tables = [
        {
          tableIndex: 0,
          headers: ['No', 'Description', 'Qty'],
          rows: [['1', 'Item A', '10']]
        },
        {
          tableIndex: 1,
          headers: ['Item', 'Description', 'Qty'],
          rows: [['1', 'Item B', '20']]
        }
      ];

      // Both should score similarly, but table with 'Item' header should win
      const result = pickBestTable(tables);

      expect(result.best).not.toBeNull();
      // Both have item group, so first table (lower index) should win
      expect(result.ranked[0].signals.has_item_group).toBe(true);
    });

    it('should handle tie-break by table index (earlier table wins)', () => {
      const tables = [
        {
          tableIndex: 2,
          headers: ['Item', 'Description', 'Qty', 'Unit'],
          rows: [['1', 'Item A', '10', 'EA']]
        },
        {
          tableIndex: 0,
          headers: ['Item', 'Description', 'Qty', 'Unit'],
          rows: [['1', 'Item B', '20', 'EA']]
        }
      ];

      const result = pickBestTable(tables);

      // Same score, earlier table (index 0) should win
      expect(result.best.tableIndex).toBe(0);
    });

    it('should return empty result for empty input', () => {
      const result = pickBestTable([]);
      expect(result.best).toBeNull();
      expect(result.ranked).toHaveLength(0);
    });
  });

  describe('Real-world PetroVietnam scenario', () => {
    it('should correctly identify MTO table in appendix over revision tables', () => {
      const tables = [
        {
          tableIndex: 0,
          headers: ['Rev.', 'Date', 'Description', 'Approved by RNZ', 'Approved by PVEP-POC'],
          rows: [
            ['A', '2024-01-01', 'Initial issue', 'John Doe', 'Jane Smith'],
            ['B', '2024-01-15', 'Revised quantities', 'John Doe', 'Jane Smith']
          ]
        },
        {
          tableIndex: 1,
          headers: ['Inspection Type', 'Witness', 'Hold', 'Remarks'],
          rows: [
            ['Visual', 'Yes', 'No', 'Check welds'],
            ['Hydro', 'Yes', 'Yes', 'Pressure test']
          ]
        },
        {
          tableIndex: 2,
          headers: [
            'Item',
            'Descriptions',
            'Unit',
            'Round Quantity',
            'Total Weight',
            'Shipment 1',
            'Shipment 2'
          ],
          rows: [
            ['1', 'ASTM A106 GR.B SCH40 6" SEAMLESS PIPE', 'LENGTH', '100', '5000', '50', '50'],
            ['2', 'ASTM A106 GR.B SCH40 4" SEAMLESS PIPE', 'LENGTH', '200', '8000', '100', '100'],
            ['3', '90 DEG ELBOW SCH40 6" ASTM A234 WPB', 'EA', '50', '2500', '25', '25']
          ]
        }
      ];

      const result = pickBestTable(tables);

      expect(result.best).not.toBeNull();
      expect(result.best.tableIndex).toBe(2); // Appendix MTO table
      expect(result.ranked[0].score).toBeGreaterThan(100); // High confidence
      expect(result.ranked[0].signals.has_item_group).toBe(true);
      expect(result.ranked[0].signals.has_description_group).toBe(true);
      expect(result.ranked[0].signals.has_quantity_group).toBe(true);
      expect(result.ranked[0].signals.core_group_count).toBeGreaterThanOrEqual(3);

      // Verify revision table is ranked low
      const revisionTableRank = result.ranked.find(r => r.tableIndex === 0);
      expect(revisionTableRank.score).toBeLessThan(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
      expect(revisionTableRank.signals.has_revision_group).toBe(true);

      // Verify inspection table is ranked low
      const inspectionTableRank = result.ranked.find(r => r.tableIndex === 1);
      expect(inspectionTableRank.score).toBeLessThan(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
      expect(inspectionTableRank.signals.has_inspection_group).toBe(true);
    });
  });
});
