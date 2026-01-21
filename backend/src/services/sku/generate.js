"use strict";
/**
 * SKU Generation Module
 *
 * Generates SKUs from material attributes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSKU = generateSKU;
exports.generateAndValidateSKU = generateAndValidateSKU;
var extract_1 = require("./extract");
var validate_1 = require("./validate");
/**
 * Generates SKU from attributes
 * Format: {CATEGORY}-{MATERIAL}-{SUBCAT}-{STD}-{SIZE}-{VARIANT}
 */
function generateSKU(attributes) {
    var category = attributes.category, material = attributes.material, subcategory = attributes.subcategory, std = attributes.std, size = attributes.size, variant = attributes.variant;
    // Ensure subcategory has a default value if undefined
    var subcat = subcategory || 'NCN';
    return "".concat(category, "-").concat(material, "-").concat(subcat, "-").concat(std, "-").concat(size, "-").concat(variant);
}
/**
 * Generates and validates SKU from material record
 * Returns SKU string, attributes, validation results, and warnings/errors
 */
function generateAndValidateSKU(materialRecord) {
    // Extract and normalize attributes
    var attributes = (0, extract_1.extractAttributes)(materialRecord);
    // Generate SKU
    var sku = generateSKU(attributes);
    // Validate
    var validation = (0, validate_1.validateSKU)(sku, attributes);
    return {
        sku: sku,
        attributes: attributes,
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
    };
}
