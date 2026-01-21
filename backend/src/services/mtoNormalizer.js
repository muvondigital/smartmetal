/**
 * MTO Material Normalization Module
 * 
 * Normalizes MTO (Material Take-Off) line items into SmartMetal material categories
 * and generates material codes following existing conventions.
 * 
 * ============================================================================
 * SOURCE OF TRUTH - SKU/Material Code Patterns
 * ============================================================================
 * 
 * Material Code Format:
 *   Pattern: M-{MATERIAL}-{CATEGORY}-{SIZE}-{VARIANT}-{STANDARD}
 *   Example: M-CS-PIPE-2-SCH40-A106B
 *   Location: backend/src/services/materialsService.js (createMaterial)
 * 
 * Existing Examples (from seedMetaSteelSuppliersAndMaterials.js):
 *   - M-CS-PIPE-2-SCH40-A106B
 *   - M-CS-ELBOW90-2-SCH40-A234WPB
 *   - M-CS-FLANGE-WN-4-150-A105
 *   - M-STRUCT-BEAM-HEA200-S275
 * 
 * Materials Table Schema:
 *   - Unique constraint: (tenant_id, material_code) - migration 058+
 *   - Required fields: material_code, category, origin_type, base_cost
 *   - Location: backend/src/db/migrations/000_bootstrap_core_schema.js (materials table)
 *   - Tenant scoping: backend/src/db/migrations/058_materials_tenantization_option_c_plus.js
 * 
 * Categories Used:
 *   - PIPE, FLANGE, FITTING, PLATE, FASTENER (existing)
 *   - STRUCTURAL_BEAM, STRUCTURAL_TUBULAR_ROLLED, PIPE_SEAMLESS, FABRICATION_CONE_REDUCER (new)
 * 
 * Constraints:
 *   - material_code must be unique per tenant
 *   - category is required and NOT NULL
 *   - origin_type is required and NOT NULL (CHINA, NON_CHINA, BOTH)
 *   - base_cost is required and NOT NULL (defaults to 0 in seeder)
 * 
 * ============================================================================
 * 
 * This module handles:
 * - W-beams (e.g., W36x194) -> STRUCTURAL_BEAM
 * - Rolled tubular (e.g., 2338×40) -> STRUCTURAL_TUBULAR_ROLLED
 * - Seamless pipe (e.g., 406.4×25.4) -> PIPE_SEAMLESS
 * - Plates (e.g., PL6, PL10) -> PLATE
 * - Reducers/cones (e.g., 1828.8→1371.6×38) -> FABRICATION_CONE_REDUCER
 */

/**
 * Normalizes a W-beam designation (e.g., "W36x194", "W24x104")
 * @param {string} designation - W-beam designation like "W36x194"
 * @returns {Object} Normalized attributes
 */
function normalizeWBeam(designation) {
  const match = designation.match(/^W(\d+)x(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid W-beam designation: ${designation}`);
  }
  
  const depth = parseInt(match[1], 10);
  const weight = parseInt(match[2], 10);
  
  return {
    category: 'STRUCTURAL_BEAM',
    series: 'W',
    designation: designation.toUpperCase(),
    depth_inch: depth,
    weight_lb_per_ft: weight,
    form: 'rolled',
  };
}

/**
 * Normalizes rolled tubular dimensions (e.g., "2338×40", "1828.8×44.5")
 * @param {string} dimensions - Dimensions like "2338×40" or "1828.8×44.5" (OD × WT in mm)
 * @returns {Object} Normalized attributes
 */
function normalizeRolledTubular(dimensions) {
  const match = dimensions.match(/^(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)$/);
  if (!match) {
    throw new Error(`Invalid rolled tubular dimensions: ${dimensions}`);
  }
  
  const od_mm = parseFloat(match[1]);
  const wt_mm = parseFloat(match[2]);
  
  return {
    category: 'STRUCTURAL_TUBULAR_ROLLED',
    od_mm,
    wt_mm,
    form: 'rolled',
  };
}

/**
 * Normalizes seamless pipe dimensions (e.g., "406.4×25.4", "273.1×15.9")
 * @param {string} dimensions - Dimensions like "406.4×25.4" (OD × WT in mm)
 * @returns {Object} Normalized attributes
 */
function normalizeSeamlessPipe(dimensions) {
  const match = dimensions.match(/^(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)$/);
  if (!match) {
    throw new Error(`Invalid seamless pipe dimensions: ${dimensions}`);
  }
  
  const od_mm = parseFloat(match[1]);
  const wt_mm = parseFloat(match[2]);
  
  return {
    category: 'PIPE_SEAMLESS',
    od_mm,
    wt_mm,
    form: 'seamless',
  };
}

/**
 * Normalizes plate thickness designation (e.g., "PL6", "PL10", "PL25")
 * @param {string} designation - Plate designation like "PL6" or "PL10"
 * @param {Object} options - Optional: plate_size_m (e.g., "2.4×6.0")
 * @returns {Object} Normalized attributes
 */
function normalizePlate(designation, options = {}) {
  const match = designation.match(/^PL(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid plate designation: ${designation}`);
  }
  
  const thickness_mm = parseInt(match[1], 10);
  
  return {
    category: 'PLATE',
    thickness_mm,
    plate_size_m: options.plate_size_m || '2.4×6.0', // Default typical size
    form: 'plate',
  };
}

/**
 * Normalizes reducer/cone dimensions (e.g., "1828.8→1371.6×38", "1016→1320.8×30")
 * @param {string} dimensions - Dimensions like "1828.8→1371.6×38" (from_od → to_od × thickness in mm)
 * @returns {Object} Normalized attributes
 */
function normalizeReducer(dimensions) {
  // Match reducer pattern: from→to×thickness or from->to×thickness
  // Use alternation instead of character class to avoid range issues with Unicode arrow
  const match = dimensions.match(/^(\d+(?:\.\d+)?)\s*(?:→|->|-)\s*(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)$/);
  if (!match) {
    throw new Error(`Invalid reducer dimensions: ${dimensions}`);
  }
  
  const from_od_mm = parseFloat(match[1]);
  const to_od_mm = parseFloat(match[2]);
  const thickness_mm = parseFloat(match[3]);
  
  return {
    category: 'FABRICATION_CONE_REDUCER',
    from_od_mm,
    to_od_mm,
    thickness_mm,
    form: 'fabrication',
  };
}

/**
 * Generates material code following SmartMetal conventions
 * Format: M-{MATERIAL}-{CATEGORY}-{SIZE}-{VARIANT}-{STANDARD}
 * 
 * @param {Object} normalized - Normalized material attributes
 * @param {Object} options - Optional: spec_standard, grade, material_type
 * @returns {string} Material code
 */
function generateMaterialCode(normalized, options = {}) {
  const { category } = normalized;
  
  // Material type code (default to CS for carbon steel)
  const materialType = (options.material_type || 'CS').toUpperCase();
  
  // Category code
  let categoryCode;
  switch (category) {
    case 'STRUCTURAL_BEAM':
      categoryCode = 'BEAM';
      break;
    case 'STRUCTURAL_TUBULAR_ROLLED':
      categoryCode = 'TUBROLLED';
      break;
    case 'PIPE_SEAMLESS':
      categoryCode = 'PIPE';
      break;
    case 'PLATE':
      categoryCode = 'PLATE';
      break;
    case 'FABRICATION_CONE_REDUCER':
      categoryCode = 'CONE';
      break;
    default:
      categoryCode = category.replace(/_/g, '').substring(0, 10).toUpperCase();
  }
  
  // Size component
  let sizeComponent;
  if (normalized.designation) {
    // W-beam: use designation like "W36X194"
    sizeComponent = normalized.designation.replace(/[×xX]/g, 'X');
  } else if (normalized.od_mm && normalized.wt_mm) {
    // Tubular/pipe: OD_WT format (remove decimals, use underscore)
    const od = normalized.od_mm.toString().replace('.', '_');
    const wt = normalized.wt_mm.toString().replace('.', '_');
    sizeComponent = `OD${od}_WT${wt}`;
  } else if (normalized.thickness_mm) {
    // Plate: thickness in mm
    sizeComponent = `T${normalized.thickness_mm}`;
  } else if (normalized.from_od_mm && normalized.to_od_mm && normalized.thickness_mm) {
    // Reducer: FROM_TO_T format
    const from = normalized.from_od_mm.toString().replace('.', '_');
    const to = normalized.to_od_mm.toString().replace('.', '_');
    sizeComponent = `${from}_${to}_T${normalized.thickness_mm}`;
  } else {
    sizeComponent = 'UNK';
  }
  
  // Variant component (form or other attributes)
  let variantComponent = normalized.form ? normalized.form.toUpperCase().substring(0, 4) : 'GEN';
  
  // Standard component (optional)
  let standardComponent = '';
  if (options.spec_standard) {
    // Normalize standard: "ASTM A106" -> "A106", "API 5L" -> "API5L"
    standardComponent = options.spec_standard
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/ASTM\s*/gi, '')
      .replace(/GR\./gi, 'GR')
      .replace(/\./g, '');
  }
  
  // Build material code
  let materialCode = `M-${materialType}-${categoryCode}-${sizeComponent}`;
  if (variantComponent && variantComponent !== 'GEN') {
    materialCode += `-${variantComponent}`;
  }
  if (standardComponent) {
    materialCode += `-${standardComponent}`;
  }
  
  return materialCode;
}

/**
 * Normalizes an MTO line item into SmartMetal format
 * @param {Object} mtoItem - MTO line item with type and dimensions
 * @returns {Object} Normalized material data ready for database insertion
 */
function normalizeMtoItem(mtoItem) {
  const { type, designation, dimensions, plate_size_m, spec_standard, grade, material_type, origin_type } = mtoItem;
  
  let normalized;
  
  // Normalize based on type
  switch (type) {
    case 'W_BEAM':
      normalized = normalizeWBeam(designation);
      break;
    case 'ROLLED_TUBULAR':
      normalized = normalizeRolledTubular(dimensions);
      break;
    case 'SEAMLESS_PIPE':
      normalized = normalizeSeamlessPipe(dimensions);
      break;
    case 'PLATE':
      normalized = normalizePlate(designation, { plate_size_m });
      break;
    case 'REDUCER':
      normalized = normalizeReducer(dimensions);
      break;
    default:
      throw new Error(`Unknown MTO type: ${type}`);
  }
  
  // Generate material code
  const material_code = generateMaterialCode(normalized, {
    spec_standard,
    grade,
    material_type: material_type || 'CS', // Default to Carbon Steel
  });
  
  // Build description
  let description;
  if (normalized.designation) {
    description = `W-Beam ${normalized.designation}`;
  } else if (normalized.od_mm && normalized.wt_mm) {
    if (normalized.category === 'PIPE_SEAMLESS') {
      description = `Seamless Pipe ${normalized.od_mm}×${normalized.wt_mm} mm`;
    } else {
      description = `Rolled Tubular ${normalized.od_mm}×${normalized.wt_mm} mm`;
    }
  } else if (normalized.thickness_mm && !normalized.from_od_mm) {
    description = `Plate PL${normalized.thickness_mm} (${normalized.plate_size_m || '2.4×6.0'} m)`;
  } else if (normalized.from_od_mm && normalized.to_od_mm) {
    description = `Reducer Cone ${normalized.from_od_mm}→${normalized.to_od_mm}×${normalized.thickness_mm} mm`;
  } else {
    description = `${normalized.category} ${JSON.stringify(normalized)}`;
  }
  
  // Build size_description
  let size_description;
  if (normalized.designation) {
    size_description = normalized.designation;
  } else if (normalized.od_mm && normalized.wt_mm) {
    size_description = `${normalized.od_mm}×${normalized.wt_mm} mm`;
  } else if (normalized.thickness_mm) {
    size_description = `PL${normalized.thickness_mm} mm`;
  } else if (normalized.from_od_mm) {
    size_description = `${normalized.from_od_mm}→${normalized.to_od_mm}×${normalized.thickness_mm} mm`;
  } else {
    size_description = JSON.stringify(normalized);
  }
  
  // Store normalized attributes in notes as JSON
  const notes = JSON.stringify({
    normalized_attributes: normalized,
    mto_source: 'WHP-DHN',
    mto_pages: '26-32',
  }, null, 2);
  
  return {
    material_code,
    category: normalized.category,
    spec_standard: spec_standard || null,
    grade: grade || null,
    material_type: material_type || 'Carbon Steel',
    origin_type: origin_type || 'NON_CHINA',
    size_description,
    base_cost: 0, // Will need to be updated with actual pricing
    currency: 'USD',
    notes,
    // Additional metadata for reference
    _normalized: normalized,
    _description: description,
  };
}

module.exports = {
  normalizeWBeam,
  normalizeRolledTubular,
  normalizeSeamlessPipe,
  normalizePlate,
  normalizeReducer,
  generateMaterialCode,
  normalizeMtoItem,
};
