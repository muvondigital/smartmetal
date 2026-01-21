/**
 * Unit tests for Material Treatment Doctrine v1
 *
 * Tests:
 * 1. extractItemParameters() - parameter extraction from descriptions
 * 2. inferTreatmentType() - classification into CANONICAL, PARAMETERIZED, PROJECT_SPECIFIC
 * 3. Edge cases and special handling (REDUCER, plate sizes, etc.)
 */

const {
  TREATMENT_TYPES,
  extractItemParameters,
  inferTreatmentType,
} = require('../materialTreatmentDoctrine');

describe('Material Treatment Doctrine v1', () => {
  describe('extractItemParameters()', () => {
    it('should return null for empty or invalid input', () => {
      expect(extractItemParameters(null)).toBeNull();
      expect(extractItemParameters(undefined)).toBeNull();
      expect(extractItemParameters('')).toBeNull();
      expect(extractItemParameters(123)).toBeNull();
    });

    it('should return null when no parameters are found', () => {
      const result = extractItemParameters('PIPE API5L-X52 24" SCH40');
      expect(result).toBeNull();
    });

    it('should extract LENGTH in meters', () => {
      const result = extractItemParameters('PIPE API5L-X52 24" SCH40 LENGTH 3.7M');
      expect(result).toEqual({ length_m: 3.7 });
    });

    it('should extract LENGTH in mm and convert to meters', () => {
      const result = extractItemParameters('PIPE LENGTH 3700MM');
      expect(result).toEqual({ length_m: 3.7 });
    });

    it('should extract LENGTH in feet and convert to meters', () => {
      const result = extractItemParameters('PIPE LENGTH 12FT');
      expect(result).toEqual({ length_m: expect.closeTo(3.6576, 4) });
    });

    it('should extract CUT TO in meters', () => {
      const result = extractItemParameters('PIPE API5L-X52 24" SCH40 CUT TO 3.7M');
      expect(result).toEqual({ cut_to_m: 3.7 });
    });

    it('should extract CUT (without TO) in meters', () => {
      const result = extractItemParameters('PIPE CUT 3.7M');
      expect(result).toEqual({ cut_to_m: 3.7 });
    });

    it('should extract plate cut size (2.4 x 6.0)', () => {
      const result = extractItemParameters('PLATE 2.4 x 6.0 M');
      expect(result).toEqual({
        plate_cut_size_m: { width_m: 2.4, length_m: 6.0 },
      });
    });

    it('should extract plate cut size with PLATE keyword', () => {
      const result = extractItemParameters('STEEL SHEET 2.4 X 6.0 PLATE');
      expect(result).toEqual({
        plate_cut_size_m: { width_m: 2.4, length_m: 6.0 },
      });
    });

    it('should extract reducer transition (24 -> 18)', () => {
      const result = extractItemParameters('REDUCER 24 -> 18');
      expect(result).toEqual({
        transition: { from_mm: 24, to_mm: 18 },
      });
    });

    it('should extract reducer transition (24 TO 18)', () => {
      const result = extractItemParameters('REDUCER 24 TO 18');
      expect(result).toEqual({
        transition: { from_mm: 24, to_mm: 18 },
      });
    });

    it('should extract LONG LENGTH keyword', () => {
      const result = extractItemParameters('PIPE LONG LENGTH');
      expect(result).toEqual({ long_length: true });
    });

    it('should extract multiple parameters', () => {
      const result = extractItemParameters('PIPE CUT TO 3.7M LONG LENGTH');
      expect(result).toEqual({
        cut_to_m: 3.7,
        long_length: true,
      });
    });

    it('should extract explicit OD in mm', () => {
      const result = extractItemParameters('PIPE OD: 610MM');
      expect(result).toEqual({ od_mm: 610 });
    });

    it('should extract explicit OD in inches and convert to mm', () => {
      const result = extractItemParameters('PIPE OD: 24"');
      expect(result).toEqual({ od_mm: expect.closeTo(609.6, 1) });
    });

    it('should extract explicit WT in mm', () => {
      const result = extractItemParameters('PIPE WT: 12.7MM');
      expect(result).toEqual({ wt_mm: 12.7 });
    });
  });

  describe('inferTreatmentType()', () => {
    describe('CANONICAL classification', () => {
      it('should classify standard pipe as CANONICAL', () => {
        const result = inferTreatmentType({
          description: 'PIPE API5L-X52 24" SCH40',
        });
        expect(result).toBe(TREATMENT_TYPES.CANONICAL);
      });

      it('should classify standard flange as CANONICAL', () => {
        const result = inferTreatmentType({
          description: 'FLANGE ANSI B16.5 150# 24" WN RF',
        });
        expect(result).toBe(TREATMENT_TYPES.CANONICAL);
      });

      it('should return CANONICAL for empty description', () => {
        const result = inferTreatmentType({ description: '' });
        expect(result).toBe(TREATMENT_TYPES.CANONICAL);
      });

      it('should return CANONICAL for null description', () => {
        const result = inferTreatmentType({ description: null });
        expect(result).toBe(TREATMENT_TYPES.CANONICAL);
      });
    });

    describe('PARAMETERIZED classification', () => {
      it('should classify pipe with CUT TO as PARAMETERIZED', () => {
        const result = inferTreatmentType({
          description: 'PIPE API5L-X52 24" SCH40 CUT TO 3.7M',
        });
        expect(result).toBe(TREATMENT_TYPES.PARAMETERIZED);
      });

      it('should classify pipe with LENGTH as PARAMETERIZED', () => {
        const result = inferTreatmentType({
          description: 'PIPE LENGTH 3.7M',
        });
        expect(result).toBe(TREATMENT_TYPES.PARAMETERIZED);
      });

      it('should classify plate with cut size as PARAMETERIZED', () => {
        const result = inferTreatmentType({
          description: 'PLATE 2.4 x 6.0',
        });
        expect(result).toBe(TREATMENT_TYPES.PARAMETERIZED);
      });

      it('should classify LONG LENGTH as PARAMETERIZED', () => {
        const result = inferTreatmentType({
          description: 'PIPE LONG LENGTH',
        });
        expect(result).toBe(TREATMENT_TYPES.PARAMETERIZED);
      });

      it('should classify as PARAMETERIZED when item_parameters provided', () => {
        const result = inferTreatmentType({
          description: 'PIPE API5L-X52 24"',
          item_parameters: { cut_to_m: 3.7 },
        });
        expect(result).toBe(TREATMENT_TYPES.PARAMETERIZED);
      });

      it('should classify REDUCER with transition as PARAMETERIZED (not PROJECT_SPECIFIC)', () => {
        const result = inferTreatmentType({
          description: 'REDUCER 24 -> 18',
        });
        expect(result).toBe(TREATMENT_TYPES.PARAMETERIZED);
      });

      it('should classify REDUCER 24 TO 18 as PARAMETERIZED', () => {
        const result = inferTreatmentType({
          description: 'REDUCER 24 TO 18',
        });
        expect(result).toBe(TREATMENT_TYPES.PARAMETERIZED);
      });
    });

    describe('PROJECT_SPECIFIC classification', () => {
      it('should classify FABRICATION as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'PIPE FABRICATION 24" ASSEMBLY',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });

      it('should classify FABRICATED as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'FABRICATED PIPE SPOOL',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });

      it('should classify ASSEMBLY as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'VALVE ASSEMBLY',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });

      it('should classify SPOOL as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'PIPE SPOOL 24"',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });

      it('should classify SKID as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'EQUIPMENT SKID',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });

      it('should classify CONE as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'CONE REDUCER 24 TO 18',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });

      it('should classify TRANSITION as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'TRANSITION PIECE 24 TO 18',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });

      it('should classify CUSTOM as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'CUSTOM REDUCER 24 -> 18',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });

      it('should classify WELD/WELDED as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'WELDED PIPE ASSEMBLY',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });

      it('should classify REDUCER with CUSTOM FAB as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'REDUCER 24" -> 18" CUSTOM FAB',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });
    });

    describe('REDUCER special case handling', () => {
      it('should NOT classify plain REDUCER as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'REDUCER 24 X 18',
        });
        expect(result).not.toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });

      it('should classify REDUCER with transition as PARAMETERIZED', () => {
        const result = inferTreatmentType({
          description: 'REDUCER 24 -> 18',
        });
        expect(result).toBe(TREATMENT_TYPES.PARAMETERIZED);
      });

      it('should classify REDUCER + fab keyword as PROJECT_SPECIFIC', () => {
        const result = inferTreatmentType({
          description: 'REDUCER 24 -> 18 CUSTOM FABRICATION',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });
    });

    describe('Case insensitivity', () => {
      it('should handle lowercase keywords', () => {
        const result = inferTreatmentType({
          description: 'pipe cut to 3.7m',
        });
        expect(result).toBe(TREATMENT_TYPES.PARAMETERIZED);
      });

      it('should handle mixed case keywords', () => {
        const result = inferTreatmentType({
          description: 'Pipe Fabrication Assembly',
        });
        expect(result).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      });
    });
  });

  describe('Integration: extract + infer', () => {
    it('should extract and infer for CUT TO scenario', () => {
      const description = 'PIPE API5L-X52 24" SCH40 CUT TO 3.7M';
      const params = extractItemParameters(description);
      const type = inferTreatmentType({ description, item_parameters: params });

      expect(params).toEqual({ cut_to_m: 3.7 });
      expect(type).toBe(TREATMENT_TYPES.PARAMETERIZED);
    });

    it('should extract and infer for REDUCER scenario', () => {
      const description = 'REDUCER 24 -> 18';
      const params = extractItemParameters(description);
      const type = inferTreatmentType({ description, item_parameters: params });

      expect(params).toEqual({ transition: { from_mm: 24, to_mm: 18 } });
      expect(type).toBe(TREATMENT_TYPES.PARAMETERIZED);
    });

    it('should extract and infer for PROJECT_SPECIFIC scenario', () => {
      const description = 'REDUCER 24" -> 18" CUSTOM FAB';
      const params = extractItemParameters(description);
      const type = inferTreatmentType({ description, item_parameters: params });

      expect(params).toEqual({ transition: { from_mm: 24, to_mm: 18 } });
      expect(type).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
    });

    it('should extract and infer for plate cut scenario', () => {
      const description = 'PLATE 2.4 x 6.0';
      const params = extractItemParameters(description);
      const type = inferTreatmentType({ description, item_parameters: params });

      expect(params).toEqual({
        plate_cut_size_m: { width_m: 2.4, length_m: 6.0 },
      });
      expect(type).toBe(TREATMENT_TYPES.PARAMETERIZED);
    });

    it('should extract and infer for CANONICAL scenario', () => {
      const description = 'PIPE API5L-X52 24" SCH40';
      const params = extractItemParameters(description);
      const type = inferTreatmentType({ description, item_parameters: params });

      expect(params).toBeNull();
      expect(type).toBe(TREATMENT_TYPES.CANONICAL);
    });
  });
});
