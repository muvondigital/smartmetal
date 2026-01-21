"use strict";
/**
 * SKU Engine Module
 *
 * Main entry point for SKU generation, extraction, normalization, and validation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normaliseFittingMaterialSpec = exports.normaliseFittingStandard = exports.normaliseFittingSchedule = exports.normaliseFittingSize = exports.normaliseFittingType = exports.parseFittingSku = exports.validateFittingSku = exports.buildFittingSku = exports.normaliseFlangeMaterialSpec = exports.normaliseFlangeStandard = exports.normaliseRating = exports.normaliseFlangeType = exports.normaliseFlangeNps = exports.parseFlangeSku = exports.validateFlangeSku = exports.buildFlangeSku = exports.normalisePipeSchedule = exports.normaliseManufacturingMethod = exports.normalisePipeSpec = exports.normalisePipeNps = exports.parsePipeSku = exports.validatePipeSku = exports.buildPipeSku = exports.generateAndValidateSKU = exports.generateSKU = exports.validateSKU = exports.validateCategorySpecificRules = exports.validateSKUFormat = exports.extractAttributes = exports.extractVariant = exports.extractSize = exports.extractStandard = exports.extractMaterial = exports.extractCategory = exports.normalizeAttributes = exports.normalizeVariant = exports.normalizeSize = exports.normalizeStandard = exports.normalizeMaterial = exports.normalizeCategory = void 0;
// Normalize exports
var normalize_1 = require("./normalize");
Object.defineProperty(exports, "normalizeCategory", { enumerable: true, get: function () { return normalize_1.normalizeCategory; } });
Object.defineProperty(exports, "normalizeMaterial", { enumerable: true, get: function () { return normalize_1.normalizeMaterial; } });
Object.defineProperty(exports, "normalizeStandard", { enumerable: true, get: function () { return normalize_1.normalizeStandard; } });
Object.defineProperty(exports, "normalizeSize", { enumerable: true, get: function () { return normalize_1.normalizeSize; } });
Object.defineProperty(exports, "normalizeVariant", { enumerable: true, get: function () { return normalize_1.normalizeVariant; } });
Object.defineProperty(exports, "normalizeAttributes", { enumerable: true, get: function () { return normalize_1.normalizeAttributes; } });
// Extract exports
var extract_1 = require("./extract");
Object.defineProperty(exports, "extractCategory", { enumerable: true, get: function () { return extract_1.extractCategory; } });
Object.defineProperty(exports, "extractMaterial", { enumerable: true, get: function () { return extract_1.extractMaterial; } });
Object.defineProperty(exports, "extractStandard", { enumerable: true, get: function () { return extract_1.extractStandard; } });
Object.defineProperty(exports, "extractSize", { enumerable: true, get: function () { return extract_1.extractSize; } });
Object.defineProperty(exports, "extractVariant", { enumerable: true, get: function () { return extract_1.extractVariant; } });
Object.defineProperty(exports, "extractAttributes", { enumerable: true, get: function () { return extract_1.extractAttributes; } });
// Validate exports
var validate_1 = require("./validate");
Object.defineProperty(exports, "validateSKUFormat", { enumerable: true, get: function () { return validate_1.validateSKUFormat; } });
Object.defineProperty(exports, "validateCategorySpecificRules", { enumerable: true, get: function () { return validate_1.validateCategorySpecificRules; } });
Object.defineProperty(exports, "validateSKU", { enumerable: true, get: function () { return validate_1.validateSKU; } });
// Generate exports
var generate_1 = require("./generate");
Object.defineProperty(exports, "generateSKU", { enumerable: true, get: function () { return generate_1.generateSKU; } });
Object.defineProperty(exports, "generateAndValidateSKU", { enumerable: true, get: function () { return generate_1.generateAndValidateSKU; } });
// Pipe SKU exports
var pipeSku_1 = require("./pipeSku");
Object.defineProperty(exports, "buildPipeSku", { enumerable: true, get: function () { return pipeSku_1.buildPipeSku; } });
Object.defineProperty(exports, "validatePipeSku", { enumerable: true, get: function () { return pipeSku_1.validatePipeSku; } });
Object.defineProperty(exports, "parsePipeSku", { enumerable: true, get: function () { return pipeSku_1.parsePipeSku; } });
Object.defineProperty(exports, "normalisePipeNps", { enumerable: true, get: function () { return pipeSku_1.normaliseNpsForSku; } });
Object.defineProperty(exports, "normalisePipeSpec", { enumerable: true, get: function () { return pipeSku_1.normaliseSpecForSku; } });
Object.defineProperty(exports, "normaliseManufacturingMethod", { enumerable: true, get: function () { return pipeSku_1.normaliseManufacturingMethod; } });
Object.defineProperty(exports, "normalisePipeSchedule", { enumerable: true, get: function () { return pipeSku_1.normaliseSchedule; } });
// Flange SKU exports
var flangeSku_1 = require("./flangeSku");
Object.defineProperty(exports, "buildFlangeSku", { enumerable: true, get: function () { return flangeSku_1.buildFlangeSku; } });
Object.defineProperty(exports, "validateFlangeSku", { enumerable: true, get: function () { return flangeSku_1.validateFlangeSku; } });
Object.defineProperty(exports, "parseFlangeSku", { enumerable: true, get: function () { return flangeSku_1.parseFlangeSku; } });
Object.defineProperty(exports, "normaliseFlangeNps", { enumerable: true, get: function () { return flangeSku_1.normaliseNpsForSku; } });
Object.defineProperty(exports, "normaliseFlangeType", { enumerable: true, get: function () { return flangeSku_1.normaliseFlangeType; } });
Object.defineProperty(exports, "normaliseRating", { enumerable: true, get: function () { return flangeSku_1.normaliseRating; } });
Object.defineProperty(exports, "normaliseFlangeStandard", { enumerable: true, get: function () { return flangeSku_1.normaliseStandard; } });
Object.defineProperty(exports, "normaliseFlangeMaterialSpec", { enumerable: true, get: function () { return flangeSku_1.normaliseMaterialSpec; } });
// Fitting SKU exports
var fittingSku_1 = require("./fittingSku");
Object.defineProperty(exports, "buildFittingSku", { enumerable: true, get: function () { return fittingSku_1.buildFittingSku; } });
Object.defineProperty(exports, "validateFittingSku", { enumerable: true, get: function () { return fittingSku_1.validateFittingSku; } });
Object.defineProperty(exports, "parseFittingSku", { enumerable: true, get: function () { return fittingSku_1.parseFittingSku; } });
Object.defineProperty(exports, "normaliseFittingType", { enumerable: true, get: function () { return fittingSku_1.normaliseFittingType; } });
Object.defineProperty(exports, "normaliseFittingSize", { enumerable: true, get: function () { return fittingSku_1.normaliseFittingSize; } });
Object.defineProperty(exports, "normaliseFittingSchedule", { enumerable: true, get: function () { return fittingSku_1.normaliseSchedule; } });
Object.defineProperty(exports, "normaliseFittingStandard", { enumerable: true, get: function () { return fittingSku_1.normaliseStandard; } });
Object.defineProperty(exports, "normaliseFittingMaterialSpec", { enumerable: true, get: function () { return fittingSku_1.normaliseMaterialSpec; } });
