/**
 * Unit Tests for MTO Normalizer
 * 
 * Tests parsing and SKU generation for:
 * - W-beam designations
 * - OD×WT dimensions (rolled tubular and seamless pipe)
 * - Plate thickness designations
 * - Reducer/cone dimensions
 * - Material code generation
 */

const {
  normalizeWBeam,
  normalizeRolledTubular,
  normalizeSeamlessPipe,
  normalizePlate,
  normalizeReducer,
  generateMaterialCode,
  normalizeMtoItem,
} = require('../mtoNormalizer');

describe('MTO Normalizer', () => {
  describe('normalizeWBeam', () => {
    it('should normalize W36x194', () => {
      const result = normalizeWBeam('W36x194');
      expect(result).toEqual({
        category: 'STRUCTURAL_BEAM',
        series: 'W',
        designation: 'W36X194',
        depth_inch: 36,
        weight_lb_per_ft: 194,
        form: 'rolled',
      });
    });

    it('should normalize W24x104', () => {
      const result = normalizeWBeam('W24x104');
      expect(result.designation).toBe('W24X104');
      expect(result.depth_inch).toBe(24);
      expect(result.weight_lb_per_ft).toBe(104);
    });

    it('should handle lowercase input', () => {
      const result = normalizeWBeam('w18x60');
      expect(result.designation).toBe('W18X60');
    });

    it('should throw error for invalid format', () => {
      expect(() => normalizeWBeam('INVALID')).toThrow('Invalid W-beam designation');
    });
  });

  describe('normalizeRolledTubular', () => {
    it('should normalize 2338×40', () => {
      const result = normalizeRolledTubular('2338×40');
      expect(result).toEqual({
        category: 'STRUCTURAL_TUBULAR_ROLLED',
        od_mm: 2338,
        wt_mm: 40,
        form: 'rolled',
      });
    });

    it('should normalize 1828.8×44.5', () => {
      const result = normalizeRolledTubular('1828.8×44.5');
      expect(result.od_mm).toBe(1828.8);
      expect(result.wt_mm).toBe(44.5);
    });

    it('should handle x separator', () => {
      const result = normalizeRolledTubular('2134x60');
      expect(result.od_mm).toBe(2134);
      expect(result.wt_mm).toBe(60);
    });

    it('should throw error for invalid format', () => {
      expect(() => normalizeRolledTubular('INVALID')).toThrow('Invalid rolled tubular dimensions');
    });
  });

  describe('normalizeSeamlessPipe', () => {
    it('should normalize 406.4×25.4', () => {
      const result = normalizeSeamlessPipe('406.4×25.4');
      expect(result).toEqual({
        category: 'PIPE_SEAMLESS',
        od_mm: 406.4,
        wt_mm: 25.4,
        form: 'seamless',
      });
    });

    it('should normalize 273.1×15.9', () => {
      const result = normalizeSeamlessPipe('273.1×15.9');
      expect(result.od_mm).toBe(273.1);
      expect(result.wt_mm).toBe(15.9);
    });

    it('should throw error for invalid format', () => {
      expect(() => normalizeSeamlessPipe('INVALID')).toThrow('Invalid seamless pipe dimensions');
    });
  });

  describe('normalizePlate', () => {
    it('should normalize PL6', () => {
      const result = normalizePlate('PL6');
      expect(result).toEqual({
        category: 'PLATE',
        thickness_mm: 6,
        plate_size_m: '2.4×6.0',
        form: 'plate',
      });
    });

    it('should normalize PL25 with custom size', () => {
      const result = normalizePlate('PL25', { plate_size_m: '3.0×8.0' });
      expect(result.thickness_mm).toBe(25);
      expect(result.plate_size_m).toBe('3.0×8.0');
    });

    it('should throw error for invalid format', () => {
      expect(() => normalizePlate('INVALID')).toThrow('Invalid plate designation');
    });
  });

  describe('normalizeReducer', () => {
    it('should normalize 1828.8→1371.6×38', () => {
      const result = normalizeReducer('1828.8→1371.6×38');
      expect(result).toEqual({
        category: 'FABRICATION_CONE_REDUCER',
        from_od_mm: 1828.8,
        to_od_mm: 1371.6,
        thickness_mm: 38,
        form: 'fabrication',
      });
    });

    it('should handle -> separator', () => {
      const result = normalizeReducer('1016->1320.8×30');
      expect(result.from_od_mm).toBe(1016);
      expect(result.to_od_mm).toBe(1320.8);
      expect(result.thickness_mm).toBe(30);
    });

    it('should throw error for invalid format', () => {
      expect(() => normalizeReducer('INVALID')).toThrow('Invalid reducer dimensions');
    });
  });

  describe('generateMaterialCode', () => {
    it('should generate code for W-beam', () => {
      const normalized = normalizeWBeam('W36x194');
      const code = generateMaterialCode(normalized, {
        spec_standard: 'ASTM A992',
        grade: 'GR50',
        material_type: 'CS',
      });
      expect(code).toBe('M-CS-BEAM-W36X194-ROLL-A992');
    });

    it('should generate code for rolled tubular', () => {
      const normalized = normalizeRolledTubular('2338×40');
      const code = generateMaterialCode(normalized, {
        spec_standard: 'ASTM A106',
        grade: 'GR.B',
        material_type: 'CS',
      });
      expect(code).toBe('M-CS-TUBROLLED-OD2338_WT40-ROLL-A106');
    });

    it('should generate code for seamless pipe', () => {
      const normalized = normalizeSeamlessPipe('406.4×25.4');
      const code = generateMaterialCode(normalized, {
        spec_standard: 'ASTM A106',
        grade: 'GR.B',
        material_type: 'CS',
      });
      expect(code).toBe('M-CS-PIPE-OD406_4_WT25_4-SEAM-A106');
    });

    it('should generate code for plate', () => {
      const normalized = normalizePlate('PL25');
      const code = generateMaterialCode(normalized, {
        spec_standard: 'ASTM A36',
        material_type: 'CS',
      });
      expect(code).toBe('M-CS-PLATE-T25-PLAT-A36');
    });

    it('should generate code for reducer', () => {
      const normalized = normalizeReducer('1828.8→1371.6×38');
      const code = generateMaterialCode(normalized, {
        spec_standard: 'ASTM A36',
        material_type: 'CS',
      });
      expect(code).toBe('M-CS-CONE-1828_8_1371_6_T38-FABR-A36');
    });

    it('should handle missing standard', () => {
      const normalized = normalizePlate('PL10');
      const code = generateMaterialCode(normalized, {
        material_type: 'CS',
      });
      expect(code).toBe('M-CS-PLATE-T10-PLAT');
    });
  });

  describe('normalizeMtoItem', () => {
    it('should normalize W-beam MTO item', () => {
      const mtoItem = {
        type: 'W_BEAM',
        designation: 'W36x194',
        spec_standard: 'ASTM A992',
        grade: 'GR50',
        material_type: 'CS',
        origin_type: 'NON_CHINA',
      };
      
      const result = normalizeMtoItem(mtoItem);
      
      expect(result.material_code).toBe('M-CS-BEAM-W36X194-ROLL-A992');
      expect(result.category).toBe('STRUCTURAL_BEAM');
      expect(result.material_type).toBe('CS');
      expect(result.origin_type).toBe('NON_CHINA');
      expect(result.size_description).toBe('W36X194');
      expect(result._description).toContain('W-Beam');
    });

    it('should normalize rolled tubular MTO item', () => {
      const mtoItem = {
        type: 'ROLLED_TUBULAR',
        dimensions: '2338×40',
        spec_standard: 'ASTM A106',
        grade: 'GR.B',
        material_type: 'CS',
        origin_type: 'NON_CHINA',
      };
      
      const result = normalizeMtoItem(mtoItem);
      
      expect(result.material_code).toBe('M-CS-TUBROLLED-OD2338_WT40-ROLL-A106');
      expect(result.category).toBe('STRUCTURAL_TUBULAR_ROLLED');
      expect(result.size_description).toBe('2338×40 mm');
    });

    it('should normalize seamless pipe MTO item', () => {
      const mtoItem = {
        type: 'SEAMLESS_PIPE',
        dimensions: '406.4×25.4',
        spec_standard: 'ASTM A106',
        grade: 'GR.B',
        material_type: 'CS',
        origin_type: 'NON_CHINA',
      };
      
      const result = normalizeMtoItem(mtoItem);
      
      expect(result.material_code).toBe('M-CS-PIPE-OD406_4_WT25_4-SEAM-A106');
      expect(result.category).toBe('PIPE_SEAMLESS');
      expect(result._description).toContain('Seamless Pipe');
    });

    it('should normalize plate MTO item', () => {
      const mtoItem = {
        type: 'PLATE',
        designation: 'PL25',
        plate_size_m: '2.4×6.0',
        spec_standard: 'ASTM A36',
        material_type: 'CS',
        origin_type: 'NON_CHINA',
      };
      
      const result = normalizeMtoItem(mtoItem);
      
      expect(result.material_code).toBe('M-CS-PLATE-T25-PLAT-A36');
      expect(result.category).toBe('PLATE');
      expect(result.size_description).toBe('PL25 mm');
    });

    it('should normalize reducer MTO item', () => {
      const mtoItem = {
        type: 'REDUCER',
        dimensions: '1828.8→1371.6×38',
        spec_standard: 'ASTM A36',
        material_type: 'CS',
        origin_type: 'NON_CHINA',
      };
      
      const result = normalizeMtoItem(mtoItem);
      
      expect(result.material_code).toBe('M-CS-CONE-1828_8_1371_6_T38-FABR-A36');
      expect(result.category).toBe('FABRICATION_CONE_REDUCER');
      expect(result._description).toContain('Reducer Cone');
    });

    it('should use default material_type if not provided', () => {
      const mtoItem = {
        type: 'PLATE',
        designation: 'PL10',
        origin_type: 'NON_CHINA',
      };
      
      const result = normalizeMtoItem(mtoItem);
      
      expect(result.material_type).toBe('Carbon Steel');
      expect(result.material_code).toContain('M-CS-');
    });

    it('should throw error for unknown type', () => {
      const mtoItem = {
        type: 'UNKNOWN',
        designation: 'TEST',
      };
      
      expect(() => normalizeMtoItem(mtoItem)).toThrow('Unknown MTO type');
    });
  });

  describe('SKU uniqueness', () => {
    it('should generate unique codes for different W-beams', () => {
      const codes = [
        normalizeMtoItem({ type: 'W_BEAM', designation: 'W36x194', material_type: 'CS', origin_type: 'NON_CHINA' }).material_code,
        normalizeMtoItem({ type: 'W_BEAM', designation: 'W24x104', material_type: 'CS', origin_type: 'NON_CHINA' }).material_code,
        normalizeMtoItem({ type: 'W_BEAM', designation: 'W18x60', material_type: 'CS', origin_type: 'NON_CHINA' }).material_code,
      ];
      
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should generate unique codes for different plates', () => {
      const codes = [
        normalizeMtoItem({ type: 'PLATE', designation: 'PL6', material_type: 'CS', origin_type: 'NON_CHINA' }).material_code,
        normalizeMtoItem({ type: 'PLATE', designation: 'PL10', material_type: 'CS', origin_type: 'NON_CHINA' }).material_code,
        normalizeMtoItem({ type: 'PLATE', designation: 'PL25', material_type: 'CS', origin_type: 'NON_CHINA' }).material_code,
      ];
      
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should generate unique codes for different pipe sizes', () => {
      const codes = [
        normalizeMtoItem({ type: 'SEAMLESS_PIPE', dimensions: '406.4×25.4', material_type: 'CS', origin_type: 'NON_CHINA' }).material_code,
        normalizeMtoItem({ type: 'SEAMLESS_PIPE', dimensions: '273.1×15.9', material_type: 'CS', origin_type: 'NON_CHINA' }).material_code,
        normalizeMtoItem({ type: 'SEAMLESS_PIPE', dimensions: '219.1×12.7', material_type: 'CS', origin_type: 'NON_CHINA' }).material_code,
      ];
      
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });
});
