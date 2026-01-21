/**
 * Unit tests for line-item table detection with revision columns
 * Tests the LINE_ITEM_OVERRIDE_BONUS fix
 */

const { scoreTableCandidate, SCORING_CONFIG } = require('../tableScoring');

describe('Line-Item Table Detection (with Rev columns)', () => {
  describe('Line-Item Override Bonus', () => {
    test('applies bonus for table with Item, Detail, Qty, and Rev (terminal logs scenario)', () => {
      // This is the exact header structure from the terminal logs that was failing
      const headers = ['Item', 'Detail', 'Pipe Spec', 'Qty', 'Unit', 'Size1', 'Size2', 'Notes', 'Rev'];
      const sampleRows = [
        ['1', 'Carbon Steel Pipe ASTM A106 GR.B', 'SCH40', '100', 'EA', '6"', '', 'Seamless', 'A'],
        ['2', 'Stainless Steel Pipe ASTM A312 TP316L', 'SCH10', '50', 'EA', '4"', '', '', 'A'],
        ['3', 'Alloy Pipe ASTM A335 P11', 'SCH80', '25', 'EA', '2"', '', 'Hot finished', 'B'],
      ];

      const result = scoreTableCandidate(headers, sampleRows);

      // Should apply line-item override bonus
      expect(result.signals.line_item_override_applied).toBe(true);

      // Check that all expected groups are detected
      expect(result.signals.has_item_group).toBe(true);
      expect(result.signals.has_description_group).toBe(true); // "Detail"
      expect(result.signals.has_quantity_group).toBe(true);
      expect(result.signals.has_material_group).toBe(true); // "Pipe Spec"
      expect(result.signals.has_revision_group).toBe(true); // "Rev"

      // Score should be above threshold (45) despite revision penalty
      expect(result.score).toBeGreaterThanOrEqual(SCORING_CONFIG.MIN_SCORE_THRESHOLD);

      // Verify the override bonus was added
      expect(result.reasons.some(r => r.includes('line_item_override_bonus'))).toBe(true);
    });

    test('does NOT apply bonus for pure revision tables (no line-item signals)', () => {
      const revisionTableHeaders = ['Rev', 'Date', 'Description', 'Prepared By', 'Checked By', 'Approved By'];
      const sampleRows = [
        ['A', '2024-01-15', 'Initial issue', 'John Doe', 'Jane Smith', 'Bob Manager'],
        ['B', '2024-02-20', 'Updated quantities', 'John Doe', 'Jane Smith', 'Bob Manager'],
      ];

      const result = scoreTableCandidate(revisionTableHeaders, sampleRows);

      // Should NOT apply line-item override (missing Item and Qty columns)
      expect(result.signals.line_item_override_applied).toBe(false);
      expect(result.signals.has_item_group).toBe(false);
      expect(result.signals.has_quantity_group).toBe(false);

      // Score should be low (likely below threshold)
      expect(result.score).toBeLessThan(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
    });

    test('applies bonus for line-item table with spec and dimension columns', () => {
      const headers = ['Item', 'Description', 'Qty', 'Size', 'Spec', 'Rev'];
      const sampleRows = [
        ['1', 'Pipe item 1', '100', '6"', 'SCH40', 'A'],
        ['2', 'Pipe item 2', '50', '4"', 'SCH10', 'A'],
      ];

      const result = scoreTableCandidate(headers, sampleRows);

      expect(result.signals.line_item_override_applied).toBe(true);
      expect(result.signals.has_item_group).toBe(true);
      expect(result.signals.has_quantity_group).toBe(true);
      expect(result.signals.has_dimension_group).toBe(true); // "Size"
      expect(result.signals.has_material_group).toBe(true); // "Spec"
      expect(result.score).toBeGreaterThanOrEqual(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
    });

    test('does NOT apply bonus if no revision column present (no penalty to override)', () => {
      const headers = ['Item', 'Description', 'Qty', 'Unit'];
      const sampleRows = [
        ['1', 'Item 1', '100', 'EA'],
        ['2', 'Item 2', '50', 'EA'],
      ];

      const result = scoreTableCandidate(headers, sampleRows);

      // Should NOT apply override (no revision group to override)
      expect(result.signals.line_item_override_applied).toBe(false);
      expect(result.signals.has_revision_group).toBe(false);

      // But score should still be high (has strong line-item signals without penalty)
      expect(result.score).toBeGreaterThanOrEqual(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
    });

    test('does NOT apply bonus if missing quantity column', () => {
      const headers = ['Item', 'Description', 'Spec', 'Rev'];
      const sampleRows = [
        ['1', 'Item 1', 'SCH40', 'A'],
        ['2', 'Item 2', 'SCH10', 'A'],
      ];

      const result = scoreTableCandidate(headers, sampleRows);

      // Missing quantity - should NOT apply override
      expect(result.signals.line_item_override_applied).toBe(false);
      expect(result.signals.has_quantity_group).toBe(false);
    });

    test('does NOT apply bonus if missing item column', () => {
      const headers = ['Description', 'Qty', 'Spec', 'Rev'];
      const sampleRows = [
        ['Item 1', '100', 'SCH40', 'A'],
        ['Item 2', '50', 'SCH10', 'A'],
      ];

      const result = scoreTableCandidate(headers, sampleRows);

      // Missing item number - should NOT apply override
      expect(result.signals.line_item_override_applied).toBe(false);
      expect(result.signals.has_item_group).toBe(false);
    });
  });

  describe('Score Calculation Verification', () => {
    test('verifies score components for line-item table with Rev', () => {
      const headers = ['Item', 'Detail', 'Qty', 'Rev'];

      const result = scoreTableCandidate(headers);

      // Expected score calculation:
      // +40 (ITEM_GROUP_SCORE)
      // +30 (DESCRIPTION_GROUP_SCORE) - "Detail"
      // +30 (QUANTITY_GROUP_SCORE)
      // -35 (REVISION_PENALTY)
      // +15 (MULTI_GROUP_BONUS) - 3 core groups
      // +50 (LINE_ITEM_OVERRIDE_BONUS) - has Item, Qty, Description, and Rev
      // = 130

      const expectedScore =
        SCORING_CONFIG.ITEM_GROUP_SCORE +
        SCORING_CONFIG.DESCRIPTION_GROUP_SCORE +
        SCORING_CONFIG.QUANTITY_GROUP_SCORE +
        SCORING_CONFIG.REVISION_PENALTY +
        SCORING_CONFIG.MULTI_GROUP_BONUS +
        SCORING_CONFIG.LINE_ITEM_OVERRIDE_BONUS;

      expect(result.score).toBe(expectedScore);
      expect(result.score).toBeGreaterThanOrEqual(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
    });

    test('verifies reasons array includes all applied bonuses and penalties', () => {
      const headers = ['Item', 'Description', 'Qty', 'Spec', 'Rev'];

      const result = scoreTableCandidate(headers);

      expect(result.reasons.some(r => r.includes('item_group'))).toBe(true);
      expect(result.reasons.some(r => r.includes('description_group'))).toBe(true);
      expect(result.reasons.some(r => r.includes('quantity_group'))).toBe(true);
      expect(result.reasons.some(r => r.includes('material_group'))).toBe(true); // Spec
      expect(result.reasons.some(r => r.includes('revision_penalty'))).toBe(true);
      expect(result.reasons.some(r => r.includes('multi_group_bonus'))).toBe(true);
      expect(result.reasons.some(r => r.includes('line_item_override_bonus'))).toBe(true);
    });
  });

  describe('Integration with pickBestTable', () => {
    test('prioritizes line-item table over revision table when both present', () => {
      const { pickBestTable } = require('../tableScoring');

      const tables = [
        {
          tableIndex: 0,
          headers: ['Rev', 'Date', 'Description', 'Prepared By', 'Approved By'],
          rows: [
            ['A', '2024-01-15', 'Initial', 'John', 'Bob'],
            ['B', '2024-02-20', 'Update', 'John', 'Bob'],
          ],
        },
        {
          tableIndex: 1,
          headers: ['Item', 'Detail', 'Qty', 'Spec', 'Rev'],
          rows: [
            ['1', 'Pipe 1', '100', 'SCH40', 'A'],
            ['2', 'Pipe 2', '50', 'SCH10', 'A'],
            ['3', 'Pipe 3', '25', 'SCH80', 'B'],
          ],
        },
      ];

      const result = pickBestTable(tables);

      expect(result.best).not.toBeNull();
      expect(result.best.tableIndex).toBe(1); // Line-item table should win
      expect(result.ranked[0].tableIndex).toBe(1);
      expect(result.ranked[0].score).toBeGreaterThanOrEqual(SCORING_CONFIG.MIN_SCORE_THRESHOLD);
    });
  });
});
