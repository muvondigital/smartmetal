/**
 * Fitting SKU Generation Module
 *
 * Generates standardized SKUs for fittings following the pattern:
 * FITG-{TYPE}-{SIZE}-{SCHEDULE}-{STANDARD}-{GRADE}
 *
 * Examples:
 * - FITG-EL90-6IN-40-B165-A234WPBW
 * - FITG-TEE-12IN-80-B165-A234WP11
 * - FITG-RECC-8X6IN-STD-B165-A105
 */

import { Fitting } from '../../types/fitting';

/**
 * Normalizes fitting type and angle/configuration for SKU
 * Maps common fitting types to standard codes with angle/config suffix
 *
 * @param fittingType - Fitting type (e.g., "Elbow", "Tee", "Reducer")
 * @param angle - Angle or configuration (e.g., "90", "45", "Concentric")
 * @returns Normalized type code (e.g., "EL90", "EL45", "TEE", "RECC")
 *
 * @example
 * normaliseFittingType("Elbow", "90") // "EL90"
 * normaliseFittingType("Elbow", "45") // "EL45"
 * normaliseFittingType("Tee", null) // "TEE"
 * normaliseFittingType("Reducer", "Concentric") // "RECC"
 */
export function normaliseFittingType(
  fittingType: string | null,
  angle?: string | null
): string {
  if (!fittingType) return 'GEN';

  const normalized = fittingType.toUpperCase().trim();
  let typeCode = 'GEN';

  // Elbows
  if (normalized.includes('ELBOW') || normalized === 'EL') {
    typeCode = 'EL';
    // Add angle if provided
    if (angle) {
      const angleNorm = angle.toString().trim();
      if (angleNorm === '90' || angleNorm.includes('90')) {
        typeCode = 'EL90';
      } else if (angleNorm === '45' || angleNorm.includes('45')) {
        typeCode = 'EL45';
      }
    } else {
      // Try to extract angle from fitting type itself
      if (normalized.includes('90')) {
        typeCode = 'EL90';
      } else if (normalized.includes('45')) {
        typeCode = 'EL45';
      }
    }
    return typeCode;
  }

  // Tees
  if (normalized.includes('TEE')) {
    // Check for reducing tee
    if (normalized.includes('REDUCING') || normalized.includes('RED')) {
      return 'TEER'; // Reducing Tee
    }
    return 'TEE'; // Equal Tee
  }

  // Reducers
  if (normalized.includes('REDUCER') || normalized.includes('RED')) {
    // Check for concentric or eccentric
    if (
      normalized.includes('CONCENTRIC') ||
      normalized.includes('CONC') ||
      angle?.toUpperCase().includes('CONC')
    ) {
      return 'RECC'; // Concentric Reducer
    }
    if (
      normalized.includes('ECCENTRIC') ||
      normalized.includes('ECC') ||
      angle?.toUpperCase().includes('ECC')
    ) {
      return 'REEE'; // Eccentric Reducer
    }
    return 'RED'; // Generic Reducer
  }

  // Caps
  if (normalized.includes('CAP')) {
    return 'CAP';
  }

  // Couplings
  if (normalized.includes('COUPLING') || normalized === 'CPL') {
    // Check for reducing coupling
    if (normalized.includes('REDUCING') || normalized.includes('RED')) {
      return 'CPLR';
    }
    return 'CPL';
  }

  // Crosses
  if (normalized.includes('CROSS')) {
    return 'CRS';
  }

  // Laterals
  if (normalized.includes('LATERAL') || normalized === 'LAT') {
    return 'LAT';
  }

  // Stub Ends
  if (normalized.includes('STUB')) {
    return 'STUB';
  }

  // Return as-is if already short code, otherwise return GEN
  return normalized.length <= 5 ? normalized : 'GEN';
}

/**
 * Normalizes fitting size for SKU
 * Handles single sizes and reducing sizes (e.g., "6IN", "12X8IN")
 *
 * @param size - Fitting size (e.g., "6\"", "12\" x 8\"", "1.5\"")
 * @param size2 - Second size for reducing fittings (optional)
 * @returns Normalized size string (e.g., "6IN", "12X8IN", "1_5IN")
 *
 * @example
 * normaliseFittingSize("6") // "6IN"
 * normaliseFittingSize("12", "8") // "12X8IN"
 * normaliseFittingSize("1.5") // "1_5IN"
 */
export function normaliseFittingSize(
  size: string | number | null,
  size2?: string | number | null
): string {
  if (!size) return 'NS'; // No Size

  // Clean and convert size
  let sizeStr = String(size)
    .replace(/["']/g, '')
    .replace(/\s+/g, '')
    .trim();

  // Replace decimal point with underscore
  sizeStr = sizeStr.replace('.', '_');

  // If second size provided (reducing fitting)
  if (size2) {
    let size2Str = String(size2)
      .replace(/["']/g, '')
      .replace(/\s+/g, '')
      .trim();
    size2Str = size2Str.replace('.', '_');
    return `${sizeStr}X${size2Str}IN`;
  }

  // Check if size already contains 'X' (reducing)
  if (sizeStr.includes('X')) {
    return `${sizeStr}IN`;
  }

  return `${sizeStr}IN`;
}

/**
 * Normalizes schedule for SKU
 *
 * @param schedule - Pipe schedule (e.g., "40", "STD", "XS")
 * @returns Normalized schedule string (e.g., "40", "STD", "XS", "NS")
 *
 * @example
 * normaliseSchedule("40") // "40"
 * normaliseSchedule("STD") // "STD"
 * normaliseSchedule("Schedule 80") // "80"
 */
export function normaliseSchedule(schedule: string | null): string {
  if (!schedule) return 'NS'; // No Schedule

  const normalized = schedule.toUpperCase().trim();

  // Remove "SCH" or "SCHEDULE" prefix if present
  const cleaned = normalized
    .replace(/^SCH(EDULE)?\s*/i, '')
    .trim();

  return cleaned;
}

/**
 * Normalizes material standard for SKU
 *
 * @param standard - Material standard (e.g., "ASME B16.9", "MSS SP-75")
 * @returns Normalized standard code (e.g., "B169", "MSSSP75")
 *
 * @example
 * normaliseStandard("ASME B16.9") // "B169"
 * normaliseStandard("MSS SP-75") // "MSSSP75"
 */
export function normaliseStandard(standard: string | null): string {
  if (!standard) return 'GEN';

  const normalized = standard.toUpperCase().trim();

  // ASME B16.x standards
  if (normalized.includes('B16')) {
    const match = normalized.match(/B\s*16[.\s]*(\d+)/);
    if (match) {
      return `B16${match[1]}`;
    }
  }

  // MSS SP standards
  if (normalized.includes('MSS') && normalized.includes('SP')) {
    const match = normalized.match(/SP[.\s-]*(\d+)/);
    if (match) {
      return `MSSSP${match[1]}`;
    }
  }

  // EN standards
  if (normalized.includes('EN')) {
    const match = normalized.match(/EN\s*(\d+)/);
    if (match) {
      return `EN${match[1]}`;
    }
  }

  // DIN standards
  if (normalized.includes('DIN')) {
    const match = normalized.match(/DIN\s*(\d+)/);
    if (match) {
      return `DIN${match[1]}`;
    }
  }

  // Remove spaces and special characters
  return normalized.replace(/\s+/g, '').replace(/[.-]/g, '').substring(0, 8);
}

/**
 * Normalizes material specification/grade for SKU
 *
 * @param materialSpec - Material specification (e.g., "ASTM A234 WPB-W", "ASTM A105")
 * @returns Normalized spec string (e.g., "A234WPBW", "A105")
 *
 * @example
 * normaliseMaterialSpec("ASTM A234 WPB-W") // "A234WPBW"
 * normaliseMaterialSpec("ASTM A234 WP11") // "A234WP11"
 * normaliseMaterialSpec("A105") // "A105"
 */
export function normaliseMaterialSpec(materialSpec: string | null): string {
  if (!materialSpec) return 'GEN';

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
 * Builds a complete SKU for a fitting
 *
 * SKU Format: FITG-{TYPE}-{SIZE}-{SCHEDULE}-{STANDARD}-{GRADE}
 *
 * @param fitting - Fitting object from database
 * @returns Complete SKU string
 *
 * @example
 * buildFittingSku({
 *   fitting_type: "Elbow",
 *   angle: "90",
 *   nps_inch: 6,
 *   schedule: "40",
 *   standard: "ASME B16.9",
 *   material_spec: "ASTM A234 WPB-W"
 * })
 * // Returns: "FITG-EL90-6IN-40-B169-A234WPBW"
 */
export function buildFittingSku(fitting: Fitting): string {
  const typePart = normaliseFittingType(
    fitting.fitting_type,
    fitting.angle || fitting.configuration
  );
  const sizePart = normaliseFittingSize(
    fitting.nps_inch,
    fitting.nps_inch_2
  );
  const schedPart = normaliseSchedule(fitting.schedule);
  const stdPart = normaliseStandard(fitting.standard);
  const specPart = normaliseMaterialSpec(fitting.material_spec);

  return `FITG-${typePart}-${sizePart}-${schedPart}-${stdPart}-${specPart}`;
}

/**
 * Validates a fitting SKU format
 *
 * @param sku - SKU string to validate
 * @returns True if SKU matches expected fitting SKU pattern
 *
 * @example
 * validateFittingSku("FITG-EL90-6IN-40-B169-A234WPBW") // true
 * validateFittingSku("INVALID-SKU") // false
 */
export function validateFittingSku(sku: string): boolean {
  // Pattern: FITG-{TYPE}-{SIZE}-{SCHEDULE}-{STANDARD}-{GRADE}
  const pattern = /^FITG-[A-Z0-9]+-[\d_X]+IN-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/;
  return pattern.test(sku);
}

/**
 * Parses a fitting SKU into its components
 *
 * @param sku - SKU string to parse
 * @returns Object with SKU components or null if invalid
 *
 * @example
 * parseFittingSku("FITG-EL90-6IN-40-B169-A234WPBW")
 * // Returns: { type: "EL90", size: "6IN", schedule: "40", standard: "B169", grade: "A234WPBW" }
 */
export function parseFittingSku(sku: string): {
  type: string;
  size: string;
  schedule: string;
  standard: string;
  grade: string;
} | null {
  if (!validateFittingSku(sku)) {
    return null;
  }

  const parts = sku.split('-');
  if (parts.length !== 6) {
    return null;
  }

  return {
    type: parts[1],
    size: parts[2],
    schedule: parts[3],
    standard: parts[4],
    grade: parts[5],
  };
}
