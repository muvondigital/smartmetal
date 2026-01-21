/**
 * Pipe SKU Generation Module
 *
 * Generates standardized SKUs for pipes following the pattern:
 * PIPE-{NPS}-{SCHEDULE}-{MFG_METHOD}-{MATERIAL_SPEC}
 *
 * Examples:
 * - PIPE-2IN-40-SMLS-A106GRB
 * - PIPE-3_5IN-80-ERW-API5LX52
 * - PIPE-0_5IN-XS-SAW-A312TP316L
 */

import { Pipe } from '../../types/pipe';

/**
 * Normalizes NPS (Nominal Pipe Size) for SKU
 * Converts decimal inches to underscore-separated format
 *
 * @param npsInch - Nominal pipe size in inches
 * @returns Normalized NPS string (e.g., "2IN", "3_5IN", "0_5IN")
 *
 * @example
 * normaliseNpsForSku(2) // "2IN"
 * normaliseNpsForSku(3.5) // "3_5IN"
 * normaliseNpsForSku(0.5) // "0_5IN"
 */
export function normaliseNpsForSku(npsInch: number): string {
  // Convert to string and replace decimal point with underscore
  const npsStr = String(npsInch).replace('.', '_');
  return `${npsStr}IN`;
}

/**
 * Normalizes material specification for SKU
 * Removes spaces, standardizes grade notation, and removes hyphens
 *
 * @param spec - Material specification (e.g., "ASTM A106 GR.B", "API 5L X52")
 * @returns Normalized spec string (e.g., "A106GRB", "API5LX52")
 *
 * @example
 * normaliseSpecForSku("ASTM A106 GR.B") // "A106GRB"
 * normaliseSpecForSku("API 5L X52") // "API5LX52"
 * normaliseSpecForSku(null) // "GEN"
 */
export function normaliseSpecForSku(spec: string | null): string {
  if (!spec) return 'GEN';

  return spec
    .toUpperCase()
    .replace(/ASTM\s*/gi, '') // Remove ASTM prefix
    .replace(/\s+/g, '') // Remove all spaces
    .replace(/GR\./gi, 'GR') // "GR.B" -> "GRB"
    .replace(/GR\s*/gi, 'GR') // "GR B" -> "GRB"
    .replace(/-/g, '') // Remove hyphens
    .replace(/\./g, ''); // Remove periods
}

/**
 * Normalizes manufacturing method for SKU
 *
 * @param method - Manufacturing method (e.g., "Seamless", "ERW", "SAW")
 * @returns Normalized method code (e.g., "SMLS", "ERW", "SAW", "GEN")
 *
 * @example
 * normaliseManufacturingMethod("Seamless") // "SMLS"
 * normaliseManufacturingMethod("ERW") // "ERW"
 * normaliseManufacturingMethod(null) // "GEN"
 */
export function normaliseManufacturingMethod(method: string | null): string {
  if (!method) return 'GEN';

  const normalized = method.toUpperCase().trim();

  // Map common manufacturing methods
  if (normalized.includes('SEAMLESS') || normalized === 'SMLS') {
    return 'SMLS';
  }
  if (normalized === 'ERW' || normalized.includes('ELECTRIC RESISTANCE')) {
    return 'ERW';
  }
  if (normalized === 'SAW' || normalized.includes('SUBMERGED ARC')) {
    return 'SAW';
  }
  if (normalized === 'HFI' || normalized.includes('HIGH FREQUENCY')) {
    return 'HFI';
  }

  // Return as-is if already short code, otherwise return GEN
  return normalized.length <= 4 ? normalized : 'GEN';
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
 * normaliseSchedule(null) // "NS"
 */
export function normaliseSchedule(schedule: string | null): string {
  if (!schedule) return 'NS'; // No Schedule

  const normalized = schedule.toUpperCase().trim();

  // Remove "SCH" prefix if present
  const cleaned = normalized.replace(/^SCH\s*/i, '');

  return cleaned;
}

/**
 * Builds a complete SKU for a pipe
 *
 * SKU Format: PIPE-{NPS}-{SCHEDULE}-{MFG_METHOD}-{MATERIAL_SPEC}
 *
 * @param pipe - Pipe object from database
 * @returns Complete SKU string
 *
 * @example
 * buildPipeSku({
 *   nps_inch: 2,
 *   schedule: "40",
 *   manufacturing_method: "Seamless",
 *   material_spec: "ASTM A106 GR.B"
 * })
 * // Returns: "PIPE-2IN-40-SMLS-A106GRB"
 *
 * @example
 * buildPipeSku({
 *   nps_inch: 3.5,
 *   schedule: "80",
 *   manufacturing_method: "ERW",
 *   material_spec: "API 5L X52"
 * })
 * // Returns: "PIPE-3_5IN-80-ERW-API5LX52"
 */
export function buildPipeSku(pipe: Pipe): string {
  const npsPart = normaliseNpsForSku(pipe.nps_inch);
  const schedPart = normaliseSchedule(pipe.schedule);
  const mfgPart = normaliseManufacturingMethod(pipe.manufacturing_method);
  const specPart = normaliseSpecForSku(pipe.material_spec);

  return `PIPE-${npsPart}-${schedPart}-${mfgPart}-${specPart}`;
}

/**
 * Validates a pipe SKU format
 *
 * @param sku - SKU string to validate
 * @returns True if SKU matches expected pipe SKU pattern
 *
 * @example
 * validatePipeSku("PIPE-2IN-40-SMLS-A106GRB") // true
 * validatePipeSku("INVALID-SKU") // false
 */
export function validatePipeSku(sku: string): boolean {
  // Pattern: PIPE-{NPS}-{SCHEDULE}-{MFG}-{SPEC}
  // NPS can have underscore for decimals (e.g., "3_5IN")
  const pattern = /^PIPE-[\d_]+IN-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/;
  return pattern.test(sku);
}

/**
 * Parses a pipe SKU into its components
 *
 * @param sku - SKU string to parse
 * @returns Object with SKU components or null if invalid
 *
 * @example
 * parsePipeSku("PIPE-2IN-40-SMLS-A106GRB")
 * // Returns: { nps: "2IN", schedule: "40", mfg: "SMLS", spec: "A106GRB" }
 */
export function parsePipeSku(sku: string): {
  nps: string;
  schedule: string;
  mfg: string;
  spec: string;
} | null {
  if (!validatePipeSku(sku)) {
    return null;
  }

  const parts = sku.split('-');
  if (parts.length !== 5) {
    return null;
  }

  return {
    nps: parts[1],
    schedule: parts[2],
    mfg: parts[3],
    spec: parts[4],
  };
}
