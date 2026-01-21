/**
 * SKU Validation Module
 * 
 * Validates SKU format and category-specific rules.
 */

import { SKUAttributes } from './extract';

/**
 * Validates SKU format: {CATEGORY}-{MATERIAL}-{STD}-{SIZE}-{VARIANT}
 */
export function validateSKUFormat(sku: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!sku || typeof sku !== 'string') {
    errors.push('SKU must be a non-empty string');
    return { valid: false, errors };
  }
  
  // Check format: should be 6 segments separated by hyphens
  // Format: {CATEGORY}-{MATERIAL}-{SUBCAT}-{STD}-{SIZE}-{VARIANT}
  const parts = sku.split('-');
  if (parts.length !== 6) {
    errors.push(`SKU must have exactly 6 segments separated by hyphens, found ${parts.length}`);
    return { valid: false, errors };
  }
  
  const [category, material, subcategory, std, size, variant] = parts;
  
  // Validate each segment
  if (!category || category.length === 0) {
    errors.push('Category segment cannot be empty');
  }
  if (category && category.length > 10) {
    errors.push(`Category segment too long (max 10 chars): ${category}`);
  }
  
  if (!material || material.length === 0) {
    errors.push('Material segment cannot be empty');
  }
  if (material && material.length > 10) {
    errors.push(`Material segment too long (max 10 chars): ${material}`);
  }
  
  if (!subcategory || subcategory.length === 0) {
    errors.push('Subcategory segment cannot be empty');
  }
  if (subcategory && subcategory.length > 15) {
    errors.push(`Subcategory segment too long (max 15 chars): ${subcategory}`);
  }
  // Subcategory can contain underscores (e.g., S1_SERR, S1_SMOOTH for gratings)
  if (subcategory && !/^[A-Za-z0-9_]+$/.test(subcategory)) {
    errors.push(`Subcategory segment contains invalid characters (only alphanumeric and underscores allowed): ${subcategory}`);
  }
  
  if (!std || std.length === 0) {
    errors.push('Standard segment cannot be empty');
  }
  if (std && std.length > 15) {
    errors.push(`Standard segment too long (max 15 chars): ${std}`);
  }
  // STD can contain grade codes for fasteners (A193B7M) or rating for flanges (B165R300) or schedule for pipes (A106S40)
  if (std && !/^[A-Za-z0-9]+$/.test(std)) {
    errors.push(`Standard segment contains invalid characters (only alphanumeric allowed): ${std}`);
  }
  
  if (!size || size.length === 0) {
    errors.push('Size segment cannot be empty');
  }
  if (size && size.length > 15) {
    errors.push(`Size segment too long (max 15 chars): ${size}`);
  }
  // SIZE segment must not contain hyphens (only alphanumeric, 'x', and '_' allowed)
  if (size && /[-]/.test(size)) {
    errors.push(`Size segment contains hyphens (not allowed): ${size}`);
  }
  if (size && !/^[A-Za-z0-9x_]+$/.test(size)) {
    errors.push(`Size segment contains invalid characters (only alphanumeric, 'x', and '_' allowed): ${size}`);
  }
  
  if (!variant || variant.length === 0) {
    errors.push('Variant segment cannot be empty');
  }
  if (variant && variant.length > 15) {
    errors.push(`Variant segment too long (max 15 chars): ${variant}`);
  }
  // Variant can contain underscores for gratings (e.g., PLN_HDG, SER_BLK)
  if (variant && !/^[A-Za-z0-9_]+$/.test(variant)) {
    errors.push(`Variant segment contains invalid characters (only alphanumeric and underscores allowed): ${variant}`);
  }
  
  // Check for invalid characters (only alphanumeric, hyphens, underscores, and 'x' allowed)
  // Note: Hyphens are used as segment separators, underscores and 'x' can appear within segments
  const invalidCharPattern = /[^A-Z0-9x_-]/i;
  if (invalidCharPattern.test(sku)) {
    errors.push('SKU contains invalid characters (only alphanumeric, hyphens, underscores, and \'x\' allowed)');
  }
  
  // Check total length
  if (sku.length > 64) {
    errors.push(`SKU too long (max 64 chars): ${sku.length} chars`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates category-specific rules
 */
export function validateCategorySpecificRules(
  category: string,
  attributes: SKUAttributes
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const cat = category.toUpperCase();
  
  // Categories that don't require standards (UNK is acceptable)
  const categoriesWithoutStandardRequirement = [
    'FAST', 'FST',           // Fasteners
    'PLAT', 'PLT',           // Plates
    'STRU', 'STR',            // Structural
    'BM',                     // Beams
    'ANG',                    // Angles
    'CHN',                    // Channels
    'HSS',                    // Hollow Structural Sections
    'SHF',                    // Shapes
    'WMS',                    // Wide Flange Members
    'GRAT', 'GRT',            // Gratings
    'FRG',                    // Forgings
    'DRN', 'DRAI',            // Drainage
  ];
  
  const requiresStandard = !categoriesWithoutStandardRequirement.some(c => 
    cat === c || cat.includes(c)
  );
  
  // PIPE category rules (strict - requires standard OR schedule)
  if (cat === 'PIPE' || cat.includes('PIPE')) {
    // Check if size contains schedule code (S20, S40, S80, etc.)
    const hasSchedule = attributes.size && /S\d+/.test(attributes.size);
    
    if (attributes.std === 'UNK' && !hasSchedule) {
      warnings.push('PIPE category should have a standard specification or schedule code (S20/S40/S80)');
    } else if (attributes.std === 'UNK' && hasSchedule) {
      // Has schedule but no standard - acceptable, just a low-level warning
      warnings.push('PIPE has schedule but standard is unknown - consider specifying standard');
    }
    
    // Pipes should have a size (NPS)
    if (attributes.size === 'UNK') {
      warnings.push('PIPE category should have a size (NPS)');
    }
    
    // Pipes typically have material CS, SS, LTCS, or ALLOY
    if (attributes.material === 'UNK') {
      warnings.push('PIPE category should have a material type');
    }
  }
  
  // FITTING category rules (strict - requires standard)
  if (cat === 'FITG' || cat.includes('FITTING')) {
    // Fittings should have a standard (usually ASME B16.9)
    if (attributes.std === 'UNK') {
      warnings.push('FITTING category should have a standard specification');
    }
    
    // Fittings should have a size
    if (attributes.size === 'UNK') {
      warnings.push('FITTING category should have a size');
    }
  }
  
  // FLANGE category rules (strict - requires standard OR rating)
  if (cat === 'FLNG' || cat.includes('FLANGE')) {
    // Check if size or std contains rating (R150, R300, PN16, etc.)
    const hasRating = (attributes.size && /[RP]\d+/.test(attributes.size)) ||
                      (attributes.std && /[RP]\d+/.test(attributes.std));
    
    if (attributes.std === 'UNK' && !hasRating) {
      warnings.push('FLANGE category should have a standard specification or rating (R150/R300/PN16)');
    } else if (attributes.std === 'UNK' && hasRating) {
      // Has rating but no standard - acceptable, just a low-level warning
      warnings.push('FLANGE has rating but standard is unknown - consider specifying standard');
    }
    
    // Flanges should have a size
    if (attributes.size === 'UNK') {
      warnings.push('FLANGE category should have a size');
    }
  }
  
  // GRATING category rules (relaxed - no standard required)
  if (cat === 'GRAT' || cat.includes('GRATING')) {
    // Gratings should have a size (load bar dimensions)
    if (attributes.size === 'UNK') {
      warnings.push('GRATING category should have a size (load bar dimensions)');
    }
    
    // Gratings typically have material CS or SS
    if (attributes.material === 'UNK') {
      warnings.push('GRATING category should have a material type');
    }
    
    // No standard requirement for gratings
  }
  
  // FASTENER category rules (relaxed - no standard required)
  if (cat === 'FAST' || cat.includes('FASTENER')) {
    // Fasteners should have a size
    if (attributes.size === 'UNK') {
      warnings.push('FASTENER category should have a size');
    }
    
    // No standard requirement for fasteners (UNK is acceptable)
    // Add informational warning only (doesn't affect validity)
    if (attributes.std === 'UNK') {
      // Low-level informational - fasteners don't always have standards
      // This is acceptable, so we don't add a warning
    }
  }
  
  // General rules - only apply to categories that require standards
  if (attributes.category === 'UNK') {
    warnings.push('Category is unknown (UNK) - consider specifying category');
  }
  
  if (attributes.material === 'UNK') {
    warnings.push('Material is unknown (UNK) - consider specifying material type');
  }
  
  // Only warn about missing standard for categories that require it
  if (attributes.std === 'UNK' && requiresStandard) {
    // Don't add general warning - category-specific rules handle it
  }
  
  if (attributes.size === 'UNK') {
    warnings.push('Size is unknown (UNK) - consider specifying size');
  }
  
  if (attributes.variant === 'UNK') {
    warnings.push('Variant is unknown (UNK) - consider specifying variant');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates SKU and attributes together
 */
export function validateSKU(
  sku: string,
  attributes: SKUAttributes
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const formatValidation = validateSKUFormat(sku);
  const categoryValidation = validateCategorySpecificRules(attributes.category, attributes);
  
  const allErrors = [...formatValidation.errors, ...categoryValidation.errors];
  const allWarnings = [...categoryValidation.warnings];
  
  // Verify SKU matches attributes
  const expectedSku = `${attributes.category}-${attributes.material}-${attributes.subcategory}-${attributes.std}-${attributes.size}-${attributes.variant}`;
  if (sku !== expectedSku) {
    allErrors.push(`SKU does not match attributes. Expected: ${expectedSku}, Got: ${sku}`);
  }
  
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

