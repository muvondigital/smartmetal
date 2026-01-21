/**
 * SKU Generation Module
 * 
 * Generates SKUs from material attributes.
 */

import { extractAttributes, MaterialRecord, SKUAttributes } from './extract';
import { validateSKU } from './validate';

/**
 * Generates SKU from attributes
 * Format: {CATEGORY}-{MATERIAL}-{SUBCAT}-{STD}-{SIZE}-{VARIANT}
 */
export function generateSKU(attributes: SKUAttributes): string {
  const { category, material, subcategory, std, size, variant } = attributes;
  
  // Ensure subcategory has a default value if undefined
  const subcat = subcategory || 'NCN';
  
  return `${category}-${material}-${subcat}-${std}-${size}-${variant}`;
}

/**
 * Generates and validates SKU from material record
 * Returns SKU string, attributes, validation results, and warnings/errors
 */
export function generateAndValidateSKU(materialRecord: MaterialRecord): {
  sku: string;
  attributes: SKUAttributes;
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  // Extract and normalize attributes
  const attributes = extractAttributes(materialRecord);
  
  // Generate SKU
  const sku = generateSKU(attributes);
  
  // Validate
  const validation = validateSKU(sku, attributes);
  
  return {
    sku,
    attributes,
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

