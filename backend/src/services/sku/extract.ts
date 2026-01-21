/**
 * SKU Extraction Module
 * 
 * Extracts SKU attributes from material records.
 * Parses database fields and notes to extract category, material, standard, size, and variant.
 */

import { normalizeAttributes } from './normalize';

/**
 * Material record type (from database)
 */
export interface MaterialRecord {
  category?: string | null;
  material_type?: string | null;
  spec_standard?: string | null;
  grade?: string | null;
  size_description?: string | null;
  origin_type?: string | null;
  notes?: string | null;
  material_code?: string | null;
}

/**
 * Extracted SKU attributes
 */
export interface SKUAttributes {
  category: string;
  material: string;
  subcategory: string;
  std: string;
  size: string;
  variant: string;
}

/**
 * Extracts category from material record
 */
export function extractCategory(materialRecord: MaterialRecord): string | null {
  return materialRecord.category || null;
}

/**
 * Extracts material type from material record
 */
export function extractMaterial(materialRecord: MaterialRecord): string | null {
  // Try material_type first
  if (materialRecord.material_type) {
    return materialRecord.material_type;
  }
  
  // Try to extract from notes
  if (materialRecord.notes) {
    try {
      const notesObj = typeof materialRecord.notes === 'string' 
        ? JSON.parse(materialRecord.notes) 
        : materialRecord.notes;
      
      if (notesObj.material_family) {
        return notesObj.material_family;
      }
      if (notesObj.material_type) {
        return notesObj.material_type;
      }
    } catch (e) {
      // Not JSON, ignore
    }
  }
  
  return null;
}

/**
 * Extracts standard from material record
 */
export function extractStandard(materialRecord: MaterialRecord): string | null {
  // Try spec_standard first
  if (materialRecord.spec_standard) {
    return materialRecord.spec_standard;
  }
  
  // Try to extract from notes
  if (materialRecord.notes) {
    try {
      const notesObj = typeof materialRecord.notes === 'string' 
        ? JSON.parse(materialRecord.notes) 
        : materialRecord.notes;
      
      if (notesObj.standard) {
        return notesObj.standard;
      }
      if (notesObj.spec_standard) {
        return notesObj.spec_standard;
      }
    } catch (e) {
      // Not JSON, ignore
    }
  }
  
  return null;
}

/**
 * Extracts size from material record
 */
export function extractSize(materialRecord: MaterialRecord): string | null {
  // Try size_description first
  if (materialRecord.size_description) {
    return materialRecord.size_description;
  }
  
  // Try to extract from notes
  if (materialRecord.notes) {
    try {
      const notesObj = typeof materialRecord.notes === 'string' 
        ? JSON.parse(materialRecord.notes) 
        : materialRecord.notes;
      
      // For pipes: try NPS
      if (notesObj.nps_inch) {
        const schedule = notesObj.schedule ? ` SCH${notesObj.schedule}` : '';
        return `${notesObj.nps_inch}"${schedule}`;
      }
      
      // For gratings: try load bar dimensions
      if (notesObj.load_bar_width_mm && notesObj.load_bar_thickness_mm) {
        return `${notesObj.load_bar_width_mm}x${notesObj.load_bar_thickness_mm}`;
      }
      
      // Generic size field
      if (notesObj.size) {
        return notesObj.size;
      }
      if (notesObj.size_description) {
        return notesObj.size_description;
      }
    } catch (e) {
      // Not JSON, ignore
    }
  }
  
  return null;
}

/**
 * Extracts subcategory from material record
 * Subcategory comes from material_code, notes, or category-specific patterns
 */
export function extractSubcategory(materialRecord: MaterialRecord): string | null {
  // Try material_code first (most reliable)
  if (materialRecord.material_code) {
    const code = materialRecord.material_code.toUpperCase();
    
    // Fasteners: HEXBOLT, STUDBOLT, NUT, ANCHORBOLT, etc.
    if (code.includes('HEXBOLT') || code.includes('HEX-BOLT')) {
      return 'HX';
    }
    if (code.includes('STUDBOLT') || code.includes('STUD-BOLT')) {
      return 'ST';
    }
    if (code.includes('NUT') && !code.includes('ANCHOR')) {
      return 'NT';
    }
    if (code.includes('ANCHORBOLT') || code.includes('ANCHOR-BOLT')) {
      return 'UB';
    }
    if (code.includes('WASHER')) {
      return 'WS';
    }
    
    // Fittings: ELB, TEE, RED, CAP, etc.
    if (code.includes('ELB') || code.includes('ELBOW')) {
      return 'EL';
    }
    if (code.includes('TEE')) {
      return 'TE';
    }
    if (code.includes('RED') || code.includes('REDUCER')) {
      return 'RE';
    }
    if (code.includes('CAP') || code.includes('COUPLING')) {
      return 'CA';
    }
    
    // Flanges: SORF, BLRF, WNRF, etc.
    if (code.includes('SORF') || code.includes('SO-RF')) {
      return 'SORF';
    }
    if (code.includes('BLRF') || code.includes('BL-RF')) {
      return 'BLRF';
    }
    if (code.includes('WNRF') || code.includes('WN-RF') || code.includes('WNRTJ')) {
      return 'WNRF';
    }
    
    // Gratings: Series patterns
    if (code.includes('TA-') || code.includes('KGSB-TA') || code.includes('TA')) {
      // Extract series from pattern like TA-255-1 or TA-203-2
      const seriesMatch = code.match(/TA-?\d+-(\d+)/);
      if (seriesMatch) {
        const series = seriesMatch[1];
        // Check for serrated (S) or plain (P) in code
        const isSerrated = code.includes('-S-') || code.includes('SERR');
        // CRITICAL: Use underscore instead of hyphen to avoid creating 7-segment SKUs
        return `S${series}_${isSerrated ? 'SERR' : 'SMOOTH'}`;
      }
    }
  }
  
  // Try notes for additional info
  if (materialRecord.notes) {
    try {
      const notesObj = typeof materialRecord.notes === 'string' 
        ? JSON.parse(materialRecord.notes) 
        : materialRecord.notes;
      
      // Fastener type from notes
      if (notesObj.fastener_type) {
        const ft = notesObj.fastener_type.toUpperCase();
        if (ft.includes('HEX')) return 'HX';
        if (ft.includes('STUD')) return 'ST';
        if (ft.includes('NUT')) return 'NT';
        if (ft.includes('ANCHOR')) return 'UB';
        if (ft.includes('WASHER')) return 'WS';
      }
      
      // Fitting type from notes
      if (notesObj.fitting_type) {
        const fit = notesObj.fitting_type.toUpperCase();
        if (fit.includes('ELBOW')) return 'EL';
        if (fit.includes('TEE')) return 'TE';
        if (fit.includes('REDUCER')) return 'RE';
        if (fit.includes('CAP') || fit.includes('COUPLING')) return 'CA';
      }
      
      // Pipe form (seamless/welded)
      if (notesObj.form) {
        const form = notesObj.form.toUpperCase();
        if (form.includes('SEAMLESS')) return 'SMS';
        if (form.includes('WELDED')) return 'WLD';
      }
    } catch (e) {
      // Not JSON, ignore
    }
  }
  
  return null;
}

/**
 * Extracts grade/specification from material code for fasteners
 * Returns grade codes like A193B7, A325, A490, etc.
 */
function extractFastenerGrade(materialCode: string): string | null {
  const code = materialCode.toUpperCase();

  // Extract ASTM grade codes - keep full suffix to differentiate
  const gradePatterns = [
    /A193B7M/,    // Must check A193B7M before A193B7
    /A193B7/,
    /A194[A-Z0-9]*/,
    /A320[A-Z0-9]*/,
    /A325/,
    /A490/,
    /A307/,
    /SAE\s*J429/,
  ];

  for (const pattern of gradePatterns) {
    const match = code.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

/**
 * Extracts finish/coating from material code
 * Returns codes like GALV, BLK, ZP (zinc plated), HDG, etc.
 */
function extractFinish(materialCode: string, notes: string | null): string | null {
  const code = materialCode.toUpperCase();

  // Check for galvanized
  if (code.includes('GALV') || code.includes('HDG') || code.includes('HOT-DIP')) {
    return 'GALV';
  }

  // Check for zinc plated
  if (code.includes('ZINC') || code.includes('ZP')) {
    return 'ZP';
  }

  // Check for black/bitumen
  if (code.includes('BLACK') || code.includes('BLK') || code.includes('BITUMEN')) {
    return 'BLK';
  }

  // Check notes if nothing found in code
  if (notes) {
    try {
      const notesObj = typeof notes === 'string' ? JSON.parse(notes) : notes;
      const notesStr = JSON.stringify(notesObj).toUpperCase();

      if (notesStr.includes('GALV') || notesStr.includes('HDG')) {
        return 'GALV';
      }
      if (notesStr.includes('ZINC') || notesStr.includes('ZP')) {
        return 'ZP';
      }
      if (notesStr.includes('BLACK') || notesStr.includes('BLK')) {
        return 'BLK';
      }
    } catch (e) {
      const notesUpper = notes.toUpperCase();
      if (notesUpper.includes('GALV') || notesUpper.includes('HDG')) {
        return 'GALV';
      }
      if (notesUpper.includes('ZINC') || notesUpper.includes('ZP')) {
        return 'ZP';
      }
      if (notesUpper.includes('BLACK') || notesUpper.includes('BLK')) {
        return 'BLK';
      }
    }
  }

  return null;
}

/**
 * Extracts variant from material record
 * Variant can come from grade, notes (form, finish, surface), or origin_type
 */
export function extractVariant(materialRecord: MaterialRecord): string | null {
  // Grade is often the variant
  if (materialRecord.grade) {
    return materialRecord.grade;
  }
  
  // Try to extract from notes
  if (materialRecord.notes) {
    try {
      const notesObj = typeof materialRecord.notes === 'string' 
        ? JSON.parse(materialRecord.notes) 
        : materialRecord.notes;
      
      // Check for form (seamless/welded)
      if (notesObj.form) {
        return notesObj.form;
      }
      
      // Check for finish
      if (notesObj.finish) {
        return notesObj.finish;
      }
      
      // Check for surface
      if (notesObj.surface) {
        return notesObj.surface;
      }
      
      // Check for grade in notes
      if (notesObj.grade) {
        return notesObj.grade;
      }
    } catch (e) {
      // Not JSON, ignore
    }
  }
  
  // Origin type can be a variant
  if (materialRecord.origin_type) {
    return materialRecord.origin_type;
  }
  
  return null;
}

/**
 * Extracts pressure rating from flange material code or notes
 * Returns ratings like 150, 300, 600, etc.
 */
function extractPressureRating(materialCode: string | null, notes: string | null): string | null {
  if (!materialCode) return null;

  const code = materialCode.toUpperCase();

  // Extract rating from patterns like 150, 300, 600, 900, 1500, 2500
  // Match common flange ratings - look for number patterns that aren't part of other codes
  const ratingMatch = code.match(/-(150|300|600|900|1500|2500)-|^(150|300|600|900|1500|2500)-/);
  if (ratingMatch) {
    return ratingMatch[1] || ratingMatch[2];
  }

  // Also try matching at word boundaries
  const ratingBoundaryMatch = code.match(/\b(150|300|600|900|1500|2500)\b/);
  if (ratingBoundaryMatch) {
    return ratingBoundaryMatch[1];
  }

  // Check for PN ratings (PN16, PN25, PN40)
  const pnMatch = code.match(/PN(\d+)/);
  if (pnMatch) {
    return `PN${pnMatch[1]}`;
  }

  return null;
}

/**
 * Extracts fitting angle from material code
 * Returns angle codes like 90, 45, etc.
 */
function extractFittingAngle(materialCode: string | null): string | null {
  if (!materialCode) return null;

  const code = materialCode.toUpperCase();

  // Check for elbow angles
  if (code.includes('ELB') || code.includes('ELBOW')) {
    if (code.includes('90')) return '90';
    if (code.includes('45')) return '45';
  }

  // Check for reducer types
  if (code.includes('RECC')) return 'CC'; // Concentric
  if (code.includes('REEE') || code.includes('REECC')) return 'ECC'; // Eccentric

  return null;
}

/**
 * Extracts schedule from material code or size description
 * Returns schedule numbers like 40, 80, 160, etc.
 */
function extractSchedule(materialCode: string | null, sizeDescription: string | null): string | null {
  const combined = `${materialCode || ''} ${sizeDescription || ''}`.toUpperCase();

  // Extract schedule patterns: SCH40, SCH80, SCH160, etc.
  const scheduleMatch = combined.match(/SCH\s*(\d+|STD|XS|XXS)/);
  if (scheduleMatch) {
    return scheduleMatch[1];
  }

  return null;
}

/**
 * Extracts pipe grade from material code
 * Returns grade codes like GRB, GRA, X42, X52, etc.
 */
function extractPipeGrade(materialCode: string | null, grade: string | null): string | null {
  const combined = `${materialCode || ''} ${grade || ''}`.toUpperCase();

  // Check for API grades
  if (combined.includes('X42')) return 'X42';
  if (combined.includes('X52')) return 'X52';
  if (combined.includes('X60')) return 'X60';
  if (combined.includes('X65')) return 'X65';
  if (combined.includes('X70')) return 'X70';

  // Check for ASTM grades
  if (combined.includes('GR.B') || combined.includes('GRB') || combined.includes('A106B')) return 'GRB';
  if (combined.includes('GR.A') || combined.includes('GRA') || combined.includes('A106A')) return 'GRA';

  return null;
}

/**
 * Extracts grating surface finish from material code
 * Returns codes like SER (serrated), PLN (plain/smooth)
 */
function extractGratingSurface(materialCode: string | null): string | null {
  if (!materialCode) return null;

  const code = materialCode.toUpperCase();

  // Check for serrated
  if (code.includes('-S-') || code.includes('SERR')) {
    return 'SER';
  }

  // Check for plain/smooth
  if (code.includes('-P-') || code.includes('PLAIN') || code.includes('SMOOTH')) {
    return 'PLN';
  }

  return null;
}

/**
 * Extracts grating coating from material code or notes
 * Returns codes like HDG (hot-dip galvanized), BLK (black), etc.
 */
function extractGratingCoating(materialCode: string | null, notes: string | null): string | null {
  const combined = `${materialCode || ''} ${notes || ''}`.toUpperCase();

  // Check for galvanized coatings
  if (combined.includes('GALV') || combined.includes('HDG') || combined.includes('-G')) {
    return 'HDG';
  }

  // Check for black/untreated
  if (combined.includes('BLACK') || combined.includes('BLK') || combined.includes('-B')) {
    return 'BLK';
  }

  // Check for unpainted/untreated
  if (combined.includes('UNPAINT') || combined.includes('-U')) {
    return 'UNP';
  }

  return null;
}

/**
 * Extracts all SKU attributes from material record
 * Returns normalized SKU codes with category-specific logic
 */
export function extractAttributes(materialRecord: MaterialRecord): SKUAttributes {
  const category = extractCategory(materialRecord);
  const categoryUpper = (category || '').toUpperCase();

  let rawAttributes: any = {
    category,
    materialType: extractMaterial(materialRecord),
    subcategory: extractSubcategory(materialRecord),
    standard: extractStandard(materialRecord),
    sizeDescription: extractSize(materialRecord),
    grade: extractVariant(materialRecord),
    notes: materialRecord.notes,
    originType: materialRecord.origin_type,
  };

  // Category-specific overrides
  if (categoryUpper.includes('FAST')) {
    // For fasteners: use grade as STD, finish as VARIANT
    const grade = materialRecord.material_code ? extractFastenerGrade(materialRecord.material_code) : null;
    const finish = materialRecord.material_code ? extractFinish(materialRecord.material_code, materialRecord.notes) : null;

    if (grade) {
      rawAttributes.standard = grade;
    }
    if (finish) {
      rawAttributes.grade = finish;
    }
  } else if (categoryUpper.includes('FLNG')) {
    // For flanges: append pressure rating to STD
    const rating = extractPressureRating(materialRecord.material_code, materialRecord.notes);
    if (rating) {
      const baseStd = rawAttributes.standard || 'UNK';
      rawAttributes.standard = `${baseStd}R${rating}`;
    }
  } else if (categoryUpper.includes('FITG')) {
    // For fittings: add angle/type to subcategory, schedule to STD
    const angle = extractFittingAngle(materialRecord.material_code);
    const schedule = extractSchedule(materialRecord.material_code, materialRecord.size_description);

    if (angle && rawAttributes.subcategory) {
      rawAttributes.subcategory = `${rawAttributes.subcategory}${angle}`;
    }
    if (schedule) {
      rawAttributes.standard = `${rawAttributes.standard || 'UNK'}S${schedule}`;
    }
  } else if (categoryUpper.includes('PIPE')) {
    // For pipes: add schedule to STD, grade suffix to VARIANT
    const schedule = extractSchedule(materialRecord.material_code, materialRecord.size_description);
    const gradeVariant = extractPipeGrade(materialRecord.material_code, materialRecord.grade);

    if (schedule) {
      rawAttributes.standard = `${rawAttributes.standard || 'UNK'}S${schedule}`;
    }
    if (gradeVariant) {
      rawAttributes.grade = gradeVariant;
    }
  } else if (categoryUpper.includes('GRAT')) {
    // For gratings: add finish and coating to VARIANT
    const surface = extractGratingSurface(materialRecord.material_code);
    const coating = extractGratingCoating(materialRecord.material_code, materialRecord.notes);

    if (surface && coating) {
      rawAttributes.grade = `${surface}_${coating}`;
    } else if (surface) {
      rawAttributes.grade = surface;
    } else if (coating) {
      rawAttributes.grade = coating;
    }
  }

  return normalizeAttributes(rawAttributes);
}

