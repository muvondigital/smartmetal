/**
 * SKU Engine Module
 * 
 * Main entry point for SKU generation, extraction, normalization, and validation.
 */

// Normalize exports
export {
  normalizeCategory,
  normalizeMaterial,
  normalizeStandard,
  normalizeSize,
  normalizeVariant,
  normalizeAttributes,
} from './normalize';

// Extract exports
export {
  extractCategory,
  extractMaterial,
  extractStandard,
  extractSize,
  extractVariant,
  extractAttributes,
  type MaterialRecord,
  type SKUAttributes,
} from './extract';

// Validate exports
export {
  validateSKUFormat,
  validateCategorySpecificRules,
  validateSKU,
} from './validate';

// Generate exports
export {
  generateSKU,
  generateAndValidateSKU,
} from './generate';

// Pipe SKU exports
export {
  buildPipeSku,
  validatePipeSku,
  parsePipeSku,
  normaliseNpsForSku as normalisePipeNps,
  normaliseSpecForSku as normalisePipeSpec,
  normaliseManufacturingMethod,
  normaliseSchedule as normalisePipeSchedule,
} from './pipeSku';

// Flange SKU exports
export {
  buildFlangeSku,
  validateFlangeSku,
  parseFlangeSku,
  normaliseNpsForSku as normaliseFlangeNps,
  normaliseFlangeType,
  normaliseRating,
  normaliseStandard as normaliseFlangeStandard,
  normaliseMaterialSpec as normaliseFlangeMaterialSpec,
} from './flangeSku';

// Fitting SKU exports
export {
  buildFittingSku,
  validateFittingSku,
  parseFittingSku,
  normaliseFittingType,
  normaliseFittingSize,
  normaliseSchedule as normaliseFittingSchedule,
  normaliseStandard as normaliseFittingStandard,
  normaliseMaterialSpec as normaliseFittingMaterialSpec,
} from './fittingSku';

