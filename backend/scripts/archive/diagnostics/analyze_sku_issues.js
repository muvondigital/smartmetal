"use strict";
/**
 * SKU Issues Analysis Script
 *
 * READ-ONLY diagnostic script to analyze SKU generation issues.
 * Identifies invalid SKUs and duplicate SKUs without modifying database.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeSKUIssues = analyzeSKUIssues;
// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
var supabaseClient_1 = require("../src/db/supabaseClient");
var sku_1 = require("../src/services/sku");
/**
 * Main analysis function
 */
function analyzeSKUIssues() {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, materials, totalMaterials, materialsWithSKU, processed, _i, materials_1, material, skuResult, invalidMaterials, errorGroups, _a, invalidMaterials_1, material, primaryError, sortedErrorGroups, _b, sortedErrorGroups_1, group, _c, _d, material, skuMap, _e, materialsWithSKU_1, material, duplicateSKUs, categoryDuplicatesMap, _f, duplicateSKUs_1, duplicate, category, categoryDuplicates, _g, categoryDuplicates_1, categoryDup, exampleDuplicates, _h, exampleDuplicates_1, duplicate, exampleMaterials, _j, exampleMaterials_1, material, _k, categoryDuplicates_2, categoryDup, totalDuplicateMaterials_1, validMaterials, totalDuplicateMaterials, errorGroups, _l, invalidMaterials_2, material, primaryError, sortedErrors, _m, sortedErrors_1, _o, error, count, categoryDuplicatesMap, _p, duplicateSKUs_2, duplicate, category, sortedCategories, _q, sortedCategories_1, _r, category, count, error_1;
        return __generator(this, function (_s) {
            switch (_s.label) {
                case 0: return [4 /*yield*/, (0, supabaseClient_1.connectDb)()];
                case 1:
                    db = _s.sent();
                    console.log('🔍 SKU Issues Analysis');
                    console.log('═'.repeat(80));
                    console.log('');
                    console.log('⚠️  READ-ONLY ANALYSIS - No database modifications will be made');
                    console.log('');
                    _s.label = 2;
                case 2:
                    _s.trys.push([2, 4, , 5]);
                    // Load all materials from database
                    console.log('📦 Loading all materials from database...');
                    return [4 /*yield*/, db.query("\n      SELECT\n        id,\n        material_code,\n        category,\n        spec_standard,\n        grade,\n        material_type,\n        origin_type,\n        size_description,\n        notes\n      FROM materials\n      ORDER BY category, material_code\n    ")];
                case 3:
                    result = _s.sent();
                    materials = result.rows;
                    totalMaterials = materials.length;
                    console.log("   Found ".concat(totalMaterials, " materials to analyze"));
                    console.log('');
                    // Process all materials
                    console.log('🔄 Generating SKUs for analysis...');
                    console.log('');
                    materialsWithSKU = [];
                    processed = 0;
                    for (_i = 0, materials_1 = materials; _i < materials_1.length; _i++) {
                        material = materials_1[_i];
                        processed++;
                        try {
                            skuResult = (0, sku_1.generateAndValidateSKU)({
                                category: material.category,
                                material_type: material.material_type,
                                spec_standard: material.spec_standard,
                                grade: material.grade,
                                size_description: material.size_description,
                                origin_type: material.origin_type,
                                notes: material.notes,
                                material_code: material.material_code,
                            });
                            materialsWithSKU.push({
                                id: material.id,
                                material_code: material.material_code,
                                category: material.category,
                                sku: skuResult.sku,
                                attributes: skuResult.attributes,
                                valid: skuResult.valid,
                                errors: skuResult.errors,
                            });
                            // Progress indicator
                            if (processed % 100 === 0 || processed === totalMaterials) {
                                process.stdout.write("\r   Progress: ".concat(processed, "/").concat(totalMaterials, " (").concat(Math.round(processed / totalMaterials * 100), "%)"));
                            }
                        }
                        catch (error) {
                            console.error("\n\u274C Error processing ".concat(material.material_code, ":"), error.message);
                        }
                    }
                    console.log('\n');
                    console.log('✅ SKU generation complete');
                    console.log('');
                    // ═══════════════════════════════════════════════════════════════════════════
                    // 1. INVALID SKUs ANALYSIS
                    // ═══════════════════════════════════════════════════════════════════════════
                    console.log('═'.repeat(80));
                    console.log('❌ INVALID SKUs ANALYSIS');
                    console.log('═'.repeat(80));
                    console.log('');
                    invalidMaterials = materialsWithSKU.filter(function (m) { return !m.valid; });
                    if (invalidMaterials.length === 0) {
                        console.log('✅ No invalid SKUs found!');
                        console.log('');
                    }
                    else {
                        errorGroups = new Map();
                        for (_a = 0, invalidMaterials_1 = invalidMaterials; _a < invalidMaterials_1.length; _a++) {
                            material = invalidMaterials_1[_a];
                            primaryError = material.errors[0] || 'Unknown error';
                            if (!errorGroups.has(primaryError)) {
                                errorGroups.set(primaryError, []);
                            }
                            errorGroups.get(primaryError).push(material);
                        }
                        sortedErrorGroups = Array.from(errorGroups.entries())
                            .map(function (_a) {
                            var errorMessage = _a[0], materials = _a[1];
                            return ({
                                errorMessage: errorMessage,
                                count: materials.length,
                                examples: materials.slice(0, 5),
                            });
                        })
                            .sort(function (a, b) { return b.count - a.count; });
                        console.log("Found ".concat(invalidMaterials.length, " invalid SKUs grouped into ").concat(sortedErrorGroups.length, " error types:"));
                        console.log('');
                        for (_b = 0, sortedErrorGroups_1 = sortedErrorGroups; _b < sortedErrorGroups_1.length; _b++) {
                            group = sortedErrorGroups_1[_b];
                            console.log("\u250C\u2500 Error: \"".concat(group.errorMessage, "\""));
                            console.log("\u2502  Count: ".concat(group.count, " materials"));
                            console.log("\u2502  Examples (showing up to 5):");
                            console.log('│');
                            for (_c = 0, _d = group.examples; _c < _d.length; _c++) {
                                material = _d[_c];
                                console.log("\u2502  \u2022 ID: ".concat(material.id.substring(0, 8), "..."));
                                console.log("\u2502    Material Code: ".concat(material.material_code));
                                console.log("\u2502    Generated SKU: ".concat(material.sku));
                                console.log("\u2502    Attributes:");
                                console.log("\u2502      - Category: ".concat(material.attributes.category));
                                console.log("\u2502      - Material: ".concat(material.attributes.material));
                                console.log("\u2502      - Subcategory: ".concat(material.attributes.subcategory));
                                console.log("\u2502      - Standard: ".concat(material.attributes.std));
                                console.log("\u2502      - Size: ".concat(material.attributes.size));
                                console.log("\u2502      - Variant: ".concat(material.attributes.variant));
                                console.log('│');
                            }
                            console.log('└' + '─'.repeat(78));
                            console.log('');
                        }
                    }
                    // ═══════════════════════════════════════════════════════════════════════════
                    // 2. DUPLICATE SKUs ANALYSIS
                    // ═══════════════════════════════════════════════════════════════════════════
                    console.log('═'.repeat(80));
                    console.log('⚠️  DUPLICATE SKUs ANALYSIS');
                    console.log('═'.repeat(80));
                    console.log('');
                    skuMap = new Map();
                    for (_e = 0, materialsWithSKU_1 = materialsWithSKU; _e < materialsWithSKU_1.length; _e++) {
                        material = materialsWithSKU_1[_e];
                        if (!skuMap.has(material.sku)) {
                            skuMap.set(material.sku, []);
                        }
                        skuMap.get(material.sku).push(material);
                    }
                    duplicateSKUs = Array.from(skuMap.entries())
                        .filter(function (_a) {
                        var sku = _a[0], materials = _a[1];
                        return materials.length > 1;
                    })
                        .map(function (_a) {
                        var sku = _a[0], materials = _a[1];
                        return ({ sku: sku, materials: materials });
                    });
                    if (duplicateSKUs.length === 0) {
                        console.log('✅ No duplicate SKUs found!');
                        console.log('');
                    }
                    else {
                        categoryDuplicatesMap = new Map();
                        for (_f = 0, duplicateSKUs_1 = duplicateSKUs; _f < duplicateSKUs_1.length; _f++) {
                            duplicate = duplicateSKUs_1[_f];
                            category = duplicate.materials[0].attributes.category;
                            if (!categoryDuplicatesMap.has(category)) {
                                categoryDuplicatesMap.set(category, []);
                            }
                            categoryDuplicatesMap.get(category).push(duplicate);
                        }
                        categoryDuplicates = Array.from(categoryDuplicatesMap.entries())
                            .map(function (_a) {
                            var categoryCode = _a[0], duplicatedSKUs = _a[1];
                            return ({
                                categoryCode: categoryCode,
                                duplicatedSKUs: duplicatedSKUs,
                            });
                        })
                            .sort(function (a, b) { return b.duplicatedSKUs.length - a.duplicatedSKUs.length; });
                        console.log("Found ".concat(duplicateSKUs.length, " duplicated SKU strings across ").concat(categoryDuplicates.length, " categories:"));
                        console.log('');
                        for (_g = 0, categoryDuplicates_1 = categoryDuplicates; _g < categoryDuplicates_1.length; _g++) {
                            categoryDup = categoryDuplicates_1[_g];
                            console.log("\u250C\u2500 Category: ".concat(categoryDup.categoryCode));
                            console.log("\u2502  Distinct duplicated SKUs: ".concat(categoryDup.duplicatedSKUs.length));
                            console.log("\u2502  Examples (showing up to 5 duplicated SKUs):");
                            console.log('│');
                            exampleDuplicates = categoryDup.duplicatedSKUs.slice(0, 5);
                            for (_h = 0, exampleDuplicates_1 = exampleDuplicates; _h < exampleDuplicates_1.length; _h++) {
                                duplicate = exampleDuplicates_1[_h];
                                console.log("\u2502  \u25B8 SKU: ".concat(duplicate.sku));
                                console.log("\u2502    Appears ".concat(duplicate.materials.length, " times:"));
                                console.log('│');
                                exampleMaterials = duplicate.materials.slice(0, 5);
                                for (_j = 0, exampleMaterials_1 = exampleMaterials; _j < exampleMaterials_1.length; _j++) {
                                    material = exampleMaterials_1[_j];
                                    console.log("\u2502    \u2022 ID: ".concat(material.id.substring(0, 8), "..."));
                                    console.log("\u2502      Material Code: ".concat(material.material_code));
                                    console.log("\u2502      Attributes:");
                                    console.log("\u2502        - Category: ".concat(material.attributes.category));
                                    console.log("\u2502        - Material: ".concat(material.attributes.material));
                                    console.log("\u2502        - Subcategory: ".concat(material.attributes.subcategory));
                                    console.log("\u2502        - Standard: ".concat(material.attributes.std));
                                    console.log("\u2502        - Size: ".concat(material.attributes.size));
                                    console.log("\u2502        - Variant: ".concat(material.attributes.variant));
                                    console.log('│');
                                }
                                if (duplicate.materials.length > 5) {
                                    console.log("\u2502    ... and ".concat(duplicate.materials.length - 5, " more materials with this SKU"));
                                    console.log('│');
                                }
                            }
                            if (categoryDup.duplicatedSKUs.length > 5) {
                                console.log("\u2502  ... and ".concat(categoryDup.duplicatedSKUs.length - 5, " more duplicated SKUs in this category"));
                                console.log('│');
                            }
                            console.log('└' + '─'.repeat(78));
                            console.log('');
                        }
                        // Detailed breakdown by category
                        console.log('📊 Duplicates Breakdown by Category:');
                        console.log('─'.repeat(80));
                        for (_k = 0, categoryDuplicates_2 = categoryDuplicates; _k < categoryDuplicates_2.length; _k++) {
                            categoryDup = categoryDuplicates_2[_k];
                            totalDuplicateMaterials_1 = categoryDup.duplicatedSKUs.reduce(function (sum, dup) { return sum + dup.materials.length; }, 0);
                            console.log("   ".concat(categoryDup.categoryCode, ": ").concat(categoryDup.duplicatedSKUs.length, " duplicated SKUs (").concat(totalDuplicateMaterials_1, " total materials)"));
                        }
                        console.log('');
                    }
                    // ═══════════════════════════════════════════════════════════════════════════
                    // 3. SUMMARY REPORT
                    // ═══════════════════════════════════════════════════════════════════════════
                    console.log('═'.repeat(80));
                    console.log('📊 SUMMARY REPORT');
                    console.log('═'.repeat(80));
                    console.log('');
                    validMaterials = materialsWithSKU.filter(function (m) { return m.valid; });
                    totalDuplicateMaterials = duplicateSKUs.reduce(function (sum, dup) { return sum + dup.materials.length; }, 0);
                    console.log('Overall Statistics:');
                    console.log("   Total materials processed:        ".concat(totalMaterials));
                    console.log("   Valid SKUs:                       ".concat(validMaterials.length, " (").concat((validMaterials.length / totalMaterials * 100).toFixed(1), "%)"));
                    console.log("   Invalid SKUs:                     ".concat(invalidMaterials.length, " (").concat((invalidMaterials.length / totalMaterials * 100).toFixed(1), "%)"));
                    console.log('');
                    console.log('Duplicate SKUs:');
                    console.log("   Distinct duplicated SKU strings:  ".concat(duplicateSKUs.length));
                    console.log("   Total materials with duplicates:  ".concat(totalDuplicateMaterials));
                    console.log('');
                    if (invalidMaterials.length > 0) {
                        console.log('Invalid SKUs by Error Type:');
                        errorGroups = new Map();
                        for (_l = 0, invalidMaterials_2 = invalidMaterials; _l < invalidMaterials_2.length; _l++) {
                            material = invalidMaterials_2[_l];
                            primaryError = material.errors[0] || 'Unknown error';
                            errorGroups.set(primaryError, (errorGroups.get(primaryError) || 0) + 1);
                        }
                        sortedErrors = Array.from(errorGroups.entries())
                            .sort(function (a, b) { return b[1] - a[1]; });
                        for (_m = 0, sortedErrors_1 = sortedErrors; _m < sortedErrors_1.length; _m++) {
                            _o = sortedErrors_1[_m], error = _o[0], count = _o[1];
                            console.log("   \"".concat(error, "\": ").concat(count));
                        }
                        console.log('');
                    }
                    if (duplicateSKUs.length > 0) {
                        console.log('Duplicates by Category:');
                        categoryDuplicatesMap = new Map();
                        for (_p = 0, duplicateSKUs_2 = duplicateSKUs; _p < duplicateSKUs_2.length; _p++) {
                            duplicate = duplicateSKUs_2[_p];
                            category = duplicate.materials[0].attributes.category;
                            categoryDuplicatesMap.set(category, (categoryDuplicatesMap.get(category) || 0) + 1);
                        }
                        sortedCategories = Array.from(categoryDuplicatesMap.entries())
                            .sort(function (a, b) { return b[1] - a[1]; });
                        for (_q = 0, sortedCategories_1 = sortedCategories; _q < sortedCategories_1.length; _q++) {
                            _r = sortedCategories_1[_q], category = _r[0], count = _r[1];
                            console.log("   ".concat(category, ": ").concat(count, " duplicated SKUs"));
                        }
                        console.log('');
                    }
                    console.log('═'.repeat(80));
                    console.log('✅ Analysis complete!');
                    console.log('');
                    if (invalidMaterials.length > 0 || duplicateSKUs.length > 0) {
                        console.log('⚠️  Issues detected:');
                        if (invalidMaterials.length > 0) {
                            console.log("   - ".concat(invalidMaterials.length, " materials have invalid SKUs"));
                        }
                        if (duplicateSKUs.length > 0) {
                            console.log("   - ".concat(duplicateSKUs.length, " SKU strings are duplicated"));
                        }
                        console.log('');
                        console.log('📝 Review the detailed analysis above to identify and resolve issues.');
                    }
                    else {
                        console.log('✅ No issues detected! All SKUs are valid and unique.');
                    }
                    console.log('');
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _s.sent();
                    console.error('❌ Analysis failed:', error_1);
                    throw error_1;
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Run if called directly
if (require.main === module) {
    analyzeSKUIssues()
        .then(function () {
        console.log('Analysis script completed');
        process.exit(0);
    })
        .catch(function (error) {
        console.error('Analysis script failed:', error);
        process.exit(1);
    });
}
