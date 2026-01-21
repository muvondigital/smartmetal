"use strict";
/**
 * Flange SKU Generation Module
 *
 * Generates standardized SKUs for flanges following the pattern:
 * FLNG-{NPS}-{TYPE}-{RATING}-{STANDARD}-{GRADE}
 *
 * Examples:
 * - FLNG-6IN-WNRF-150-B165-A182F316L
 * - FLNG-12IN-SORF-300-B165-A105
 * - FLNG-24IN-BLRF-600-B165-A350LF2
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normaliseNpsForSku = normaliseNpsForSku;
exports.normaliseFlangeType = normaliseFlangeType;
exports.normaliseRating = normaliseRating;
exports.normaliseStandard = normaliseStandard;
exports.normaliseMaterialSpec = normaliseMaterialSpec;
exports.buildFlangeSku = buildFlangeSku;
exports.validateFlangeSku = validateFlangeSku;
exports.parseFlangeSku = parseFlangeSku;
/**
 * Normalizes NPS (Nominal Pipe Size) for SKU
 * Converts decimal inches to underscore-separated format
 *
 * @param npsInch - Nominal pipe size in inches
 * @returns Normalized NPS string (e.g., "2IN", "3_5IN", "0_5IN")
 *
 * @example
 * normaliseNpsForSku(6) // "6IN"
 * normaliseNpsForSku(1.5) // "1_5IN"
 */
function normaliseNpsForSku(npsInch) {
    var npsStr = String(npsInch).replace('.', '_');
    return "".concat(npsStr, "IN");
}
/**
 * Normalizes flange type for SKU
 * Maps common flange types to standard codes
 *
 * @param flangeType - Flange type (e.g., "Weld Neck RF", "Slip-On RF", "Blind RF")
 * @returns Normalized type code (e.g., "WNRF", "SORF", "BLRF")
 *
 * @example
 * normaliseFlangeType("Weld Neck RF") // "WNRF"
 * normaliseFlangeType("Slip-On RF") // "SORF"
 * normaliseFlangeType("Blind Raised Face") // "BLRF"
 */
function normaliseFlangeType(flangeType) {
    if (!flangeType)
        return 'GEN';
    var normalized = flangeType.toUpperCase().trim();
    // Weld Neck variants
    if (normalized.includes('WELD NECK') || normalized === 'WN') {
        if (normalized.includes('RTJ'))
            return 'WNRTJ';
        if (normalized.includes('RF') || normalized.includes('RAISED'))
            return 'WNRF';
        if (normalized.includes('FF') || normalized.includes('FLAT'))
            return 'WNFF';
        return 'WNRF'; // Default to RF
    }
    // Slip-On variants
    if (normalized.includes('SLIP') || normalized.includes('SO')) {
        if (normalized.includes('RTJ'))
            return 'SORTJ';
        if (normalized.includes('RF') || normalized.includes('RAISED'))
            return 'SORF';
        if (normalized.includes('FF') || normalized.includes('FLAT'))
            return 'SOFF';
        return 'SORF'; // Default to RF
    }
    // Blind variants
    if (normalized.includes('BLIND') || normalized === 'BL') {
        if (normalized.includes('RTJ'))
            return 'BLRTJ';
        if (normalized.includes('RF') || normalized.includes('RAISED'))
            return 'BLRF';
        if (normalized.includes('FF') || normalized.includes('FLAT'))
            return 'BLFF';
        return 'BLRF'; // Default to RF
    }
    // Socket Weld
    if (normalized.includes('SOCKET') || normalized === 'SW') {
        return 'SW';
    }
    // Threaded
    if (normalized.includes('THREAD') || normalized === 'TH') {
        return 'TH';
    }
    // Lap Joint
    if (normalized.includes('LAP') || normalized === 'LJ') {
        return 'LJ';
    }
    // Long Weld Neck
    if (normalized.includes('LONG WELD') || normalized === 'LWN') {
        return 'LWN';
    }
    // Return as-is if already short code, otherwise return GEN
    return normalized.length <= 6 ? normalized : 'GEN';
}
/**
 * Normalizes pressure rating for SKU
 *
 * @param rating - Pressure rating (e.g., "150", "300", "600", "PN16")
 * @returns Normalized rating string (e.g., "150", "300", "PN16")
 *
 * @example
 * normaliseRating("150") // "150"
 * normaliseRating("Class 300") // "300"
 * normaliseRating("PN16") // "PN16"
 */
function normaliseRating(rating) {
    if (!rating)
        return 'NR'; // No Rating
    var normalized = String(rating).toUpperCase().trim();
    // Remove "CLASS" prefix if present
    var cleaned = normalized.replace(/^CLASS\s*/i, '');
    // Extract numeric ratings (150, 300, 600, etc.)
    var numericMatch = cleaned.match(/^(\d+)$/);
    if (numericMatch) {
        return numericMatch[1];
    }
    // PN ratings (PN16, PN25, etc.)
    var pnMatch = cleaned.match(/^PN(\d+)$/);
    if (pnMatch) {
        return "PN".concat(pnMatch[1]);
    }
    return cleaned || 'NR';
}
/**
 * Normalizes material standard for SKU
 *
 * @param standard - Material standard (e.g., "ASME B16.5", "ASME B16.47", "EN 1092")
 * @returns Normalized standard code (e.g., "B165", "B1647", "EN1092")
 *
 * @example
 * normaliseStandard("ASME B16.5-2020") // "B165"
 * normaliseStandard("ASME B16.47") // "B1647"
 * normaliseStandard("EN 1092-1") // "EN1092"
 */
function normaliseStandard(standard) {
    if (!standard)
        return 'GEN';
    var normalized = standard.toUpperCase().trim();
    // ASME B16.x standards
    if (normalized.includes('B16')) {
        var match = normalized.match(/B\s*16[.\s]*(\d+)/);
        if (match) {
            return "B16".concat(match[1]);
        }
    }
    // EN standards
    if (normalized.includes('EN')) {
        var match = normalized.match(/EN\s*(\d+)/);
        if (match) {
            return "EN".concat(match[1]);
        }
    }
    // DIN standards
    if (normalized.includes('DIN')) {
        var match = normalized.match(/DIN\s*(\d+)/);
        if (match) {
            return "DIN".concat(match[1]);
        }
    }
    // JIS standards
    if (normalized.includes('JIS')) {
        var match = normalized.match(/JIS\s*([A-Z]\d+)/);
        if (match) {
            return "JIS".concat(match[1]);
        }
    }
    // Remove spaces and periods
    return normalized.replace(/\s+/g, '').replace(/[.-]/g, '').substring(0, 8);
}
/**
 * Normalizes material specification/grade for SKU
 *
 * @param materialSpec - Material specification (e.g., "ASTM A182 F316L", "ASTM A105")
 * @returns Normalized spec string (e.g., "A182F316L", "A105")
 *
 * @example
 * normaliseMaterialSpec("ASTM A182 F316L") // "A182F316L"
 * normaliseMaterialSpec("ASTM A105") // "A105"
 * normaliseMaterialSpec("A350 LF2") // "A350LF2"
 */
function normaliseMaterialSpec(materialSpec) {
    if (!materialSpec)
        return 'GEN';
    return materialSpec
        .toUpperCase()
        .replace(/ASTM\s*/gi, '') // Remove ASTM prefix
        .replace(/\s+/g, '') // Remove all spaces
        .replace(/GR\./gi, 'GR') // "GR.B" -> "GRB"
        .replace(/GR\s*/gi, 'GR') // "GR B" -> "GRB"
        .replace(/-/g, '') // Remove hyphens
        .replace(/\./g, ''); // Remove periods
}
/**
 * Builds a complete SKU for a flange
 *
 * SKU Format: FLNG-{NPS}-{TYPE}-{RATING}-{STANDARD}-{GRADE}
 *
 * @param flange - Flange object from database
 * @returns Complete SKU string
 *
 * @example
 * buildFlangeSku({
 *   nps_inch: 6,
 *   flange_type: "Weld Neck RF",
 *   pressure_rating: 150,
 *   standard: "ASME B16.5",
 *   material_spec: "ASTM A182 F316L"
 * })
 * // Returns: "FLNG-6IN-WNRF-150-B165-A182F316L"
 */
function buildFlangeSku(flange) {
    var npsPart = normaliseNpsForSku(flange.nps_inch);
    var typePart = normaliseFlangeType(flange.flange_type);
    var ratingPart = normaliseRating(flange.pressure_rating);
    var stdPart = normaliseStandard(flange.standard);
    var specPart = normaliseMaterialSpec(flange.material_spec);
    return "FLNG-".concat(npsPart, "-").concat(typePart, "-").concat(ratingPart, "-").concat(stdPart, "-").concat(specPart);
}
/**
 * Validates a flange SKU format
 *
 * @param sku - SKU string to validate
 * @returns True if SKU matches expected flange SKU pattern
 *
 * @example
 * validateFlangeSku("FLNG-6IN-WNRF-150-B165-A182F316L") // true
 * validateFlangeSku("INVALID-SKU") // false
 */
function validateFlangeSku(sku) {
    // Pattern: FLNG-{NPS}-{TYPE}-{RATING}-{STANDARD}-{GRADE}
    var pattern = /^FLNG-[\d_]+IN-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/;
    return pattern.test(sku);
}
/**
 * Parses a flange SKU into its components
 *
 * @param sku - SKU string to parse
 * @returns Object with SKU components or null if invalid
 *
 * @example
 * parseFlangeSku("FLNG-6IN-WNRF-150-B165-A182F316L")
 * // Returns: { nps: "6IN", type: "WNRF", rating: "150", standard: "B165", grade: "A182F316L" }
 */
function parseFlangeSku(sku) {
    if (!validateFlangeSku(sku)) {
        return null;
    }
    var parts = sku.split('-');
    if (parts.length !== 6) {
        return null;
    }
    return {
        nps: parts[1],
        type: parts[2],
        rating: parts[3],
        standard: parts[4],
        grade: parts[5],
    };
}
