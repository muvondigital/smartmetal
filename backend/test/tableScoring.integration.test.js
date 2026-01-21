/**
 * Integration test for table scoring with aiParseService
 * Simulates the PetroVietnam scenario with multiple tables
 */

const { pickBestTable } = require('../src/services/rfqExtraction/tableScoring');

describe('Table Scoring Integration', () => {
  describe('PetroVietnam-style PDF with multiple tables', () => {
    it('should select MTO table when multiple table types are present', () => {
      // Simulate tables extracted from a real PetroVietnam-style PDF
      const extractedTables = [
        // Table 0: Revision/approval table (should be rejected)
        {
          tableIndex: 0,
          headers: ['Rev.', 'Date', 'Description', 'Approved by RNZ', 'Approved by PVEP-POC'],
          rows: [
            ['Rev.', 'Date', 'Description', 'Approved by RNZ', 'Approved by PVEP-POC'],
            ['A', '2024-01-01', 'Initial issue', 'John Doe', 'Jane Smith'],
            ['B', '2024-01-15', 'Revised quantities', 'John Doe', 'Jane Smith']
          ]
        },
        // Table 1: Inspection matrix (should be rejected)
        {
          tableIndex: 1,
          headers: ['Inspection Type', 'Witness', 'Hold', 'Test Report', 'Remarks'],
          rows: [
            ['Inspection Type', 'Witness', 'Hold', 'Test Report', 'Remarks'],
            ['Visual Inspection', 'Yes', 'No', 'Required', 'Check welds'],
            ['Hydrostatic Test', 'Yes', 'Yes', 'Required', 'Pressure test at 1.5x']
          ]
        },
        // Table 2: Appendix MTO table (should be selected)
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
            ['Item', 'Descriptions', 'Unit', 'Round Quantity', 'Total Weight', 'Shipment 1', 'Shipment 2'],
            ['1', 'ASTM A106 GR.B SCH40 6" SEAMLESS PIPE', 'LENGTH', '100', '5000', '50', '50'],
            ['2', 'ASTM A106 GR.B SCH40 4" SEAMLESS PIPE', 'LENGTH', '200', '8000', '100', '100'],
            ['3', '90 DEG ELBOW SCH40 6" ASTM A234 WPB', 'EA', '50', '2500', '25', '25'],
            ['4', 'TEE SCH40 6" ASTM A234 WPB', 'EA', '30', '1800', '15', '15'],
            ['5', 'REDUCER 6" x 4" SCH40 ASTM A234 WPB', 'EA', '20', '1200', '10', '10']
          ]
        }
      ];

      const result = pickBestTable(extractedTables);

      // Verify the MTO table was selected
      expect(result.best).not.toBeNull();
      expect(result.best.tableIndex).toBe(2);

      // Verify the ranking order
      expect(result.ranked).toHaveLength(3);
      expect(result.ranked[0].tableIndex).toBe(2); // MTO table first
      expect(result.ranked[0].score).toBeGreaterThan(100); // High score

      // Verify revision table is ranked low
      const revisionRank = result.ranked.find(r => r.tableIndex === 0);
      expect(revisionRank.score).toBeLessThan(0); // Negative score
      expect(revisionRank.signals.has_revision_group).toBe(true);

      // Verify inspection table is ranked low
      const inspectionRank = result.ranked.find(r => r.tableIndex === 1);
      expect(inspectionRank.score).toBeLessThan(0); // Negative score
      expect(inspectionRank.signals.has_inspection_group).toBe(true);

      // Log the results for debugging
      console.log('\nScoring Results:');
      result.ranked.forEach(r => {
        console.log(`  Table ${r.tableIndex}: score=${r.score}, reasons=[${r.reasons.join(', ')}]`);
      });
    });

    it('should gracefully handle no valid tables', () => {
      const extractedTables = [
        {
          tableIndex: 0,
          headers: ['Rev', 'Date', 'Approved'],
          rows: [['Rev', 'Date', 'Approved'], ['A', '2024-01-01', 'Yes']]
        },
        {
          tableIndex: 1,
          headers: ['Inspection', 'Witness'],
          rows: [['Inspection', 'Witness'], ['Visual', 'Yes']]
        }
      ];

      const result = pickBestTable(extractedTables);

      // No table should meet the threshold
      expect(result.best).toBeNull();
      expect(result.ranked).toHaveLength(2);
      expect(result.ranked[0].score).toBeLessThan(45); // Below threshold
    });

    it('should handle empty table list', () => {
      const result = pickBestTable([]);

      expect(result.best).toBeNull();
      expect(result.ranked).toHaveLength(0);
    });

    it('should handle tables with merged header rows', () => {
      // Simulate a table where headers might be split across rows
      const extractedTables = [
        {
          tableIndex: 0,
          headers: ['Item', 'Description', 'Quantity', 'Unit', 'Remarks'],
          rows: [
            ['Item', 'Description', 'Quantity', 'Unit', 'Remarks'],
            ['1', '6 inch seamless pipe ASTM A106 GR.B SCH40', '100', 'LENGTH', 'Urgent'],
            ['2', '4 inch seamless pipe ASTM A106 GR.B SCH40', '200', 'LENGTH', '']
          ]
        }
      ];

      const result = pickBestTable(extractedTables);

      expect(result.best).not.toBeNull();
      expect(result.best.tableIndex).toBe(0);
      expect(result.ranked[0].score).toBeGreaterThanOrEqual(45);
      expect(result.ranked[0].signals.has_item_group).toBe(true);
      expect(result.ranked[0].signals.has_description_group).toBe(true);
      expect(result.ranked[0].signals.has_quantity_group).toBe(true);
    });
  });
});
