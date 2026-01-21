/**
 * SKU Normalization Module
 * 
 * Normalizes material attributes to standardized SKU codes.
 * Uses mapping tables to convert human-readable values to SKU codes.
 */

// Category mapping: human-readable -> SKU code
const CATEGORY_MAP: Record<string, string> = {
  // Pipes
  'pipe': 'PIPE',
  'pipes': 'PIPE',
  'tube': 'PIPE',
  'tubes': 'PIPE',
  
  // Fittings
  'fitting': 'FITG',
  'fittings': 'FITG',
  'elbow': 'FITG',
  'elbows': 'FITG',
  'tee': 'FITG',
  'tees': 'FITG',
  'reducer': 'FITG',
  'reducers': 'FITG',
  'coupling': 'FITG',
  'couplings': 'FITG',
  
  // Flanges
  'flange': 'FLNG',
  'flanges': 'FLNG',
  
  // Gratings
  'grating': 'GRAT',
  'gratings': 'GRAT',
  'grate': 'GRAT',
  'grates': 'GRAT',
  
  // Fasteners
  'fastener': 'FAST',
  'fasteners': 'FAST',
  'bolt': 'FAST',
  'bolts': 'FAST',
  'screw': 'FAST',
  'screws': 'FAST',
  'nut': 'FAST',
  'nuts': 'FAST',
  'washer': 'FAST',
  'washers': 'FAST',
  
  // Plates
  'plate': 'PLAT',
  'plates': 'PLAT',
  'sheet': 'PLAT',
  'sheets': 'PLAT',
  
  // Valves
  'valve': 'VALV',
  'valves': 'VALV',
  
  // Structural
  'beam': 'STRU',
  'beams': 'STRU',
  'angle': 'STRU',
  'angles': 'STRU',
  'channel': 'STRU',
  'channels': 'STRU',
};

// Material type mapping: human-readable -> SKU code
const MATERIAL_MAP: Record<string, string> = {
  // Carbon Steel
  'carbon steel': 'CS',
  'cs': 'CS',
  'mild steel': 'CS',
  'ms': 'CS',
  'carbon': 'CS',
  
  // Stainless Steel
  'stainless steel': 'SS',
  'ss': 'SS',
  'stainless': 'SS',
  '304': 'SS',
  '316': 'SS',
  '316l': 'SS',
  '304l': 'SS',
  
  // Low Temperature Carbon Steel
  'low temperature carbon steel': 'LTCS',
  'ltcs': 'LTCS',
  'low temp carbon steel': 'LTCS',
  'low temp cs': 'LTCS',
  
  // Alloy Steel
  'alloy steel': 'ALLOY',
  'alloy': 'ALLOY',
  'chrome moly': 'ALLOY',
  'crmo': 'ALLOY',
  
  // Aluminum
  'aluminum': 'AL',
  'al': 'AL',
  'aluminium': 'AL',
  
  // Copper
  'copper': 'CU',
  'cu': 'CU',
  
  // Brass
  'brass': 'BR',
  'br': 'BR',
};

// Standard mapping: human-readable -> SKU code
const STANDARD_MAP: Record<string, string> = {
  // ASTM Standards
  'astm a106': 'A106',
  'a106': 'A106',
  'astm a106 gr.b': 'A106',
  'astm a106 gr.a': 'A106',
  
  'astm a333': 'A333',
  'a333': 'A333',
  'astm a333 gr.6': 'A333',
  
  'astm a312': 'A312',
  'a312': 'A312',
  'astm a312 tp304': 'A312',
  'astm a312 tp316': 'A312',
  'astm a312 tp316l': 'A312',
  
  'astm a53': 'A53',
  'a53': 'A53',
  
  'astm a234': 'A234',
  'a234': 'A234',
  
  'astm a105': 'A105',
  'a105': 'A105',
  
  'astm a182': 'A182',
  'a182': 'A182',
  
  // API Standards
  'api 5l': 'API5L',
  'api5l': 'API5L',
  'api 5l x42': 'API5L',
  'api 5l x52': 'API5L',
  
  // ASME Standards
  'asme b16.9': 'B169',
  'b16.9': 'B169',
  
  'asme b16.5': 'B165',
  'b16.5': 'B165',
  
  // ISO Standards
  'iso 9001': 'ISO9K',
  'iso 14001': 'ISO14K',
  
  // DIN Standards
  'din': 'DIN',
  
  // BS Standards
  'bs': 'BS',
};

// Size normalization patterns
const SIZE_PATTERNS = [
  // Pipe sizes: NPS in inches
  { pattern: /(\d+(?:\.\d+)?)\s*[""]/i, extract: (m: RegExpMatchArray) => `${m[1]}IN` },
  // DN sizes
  { pattern: /dn\s*(\d+)/i, extract: (m: RegExpMatchArray) => `DN${m[1]}` },
  // Schedule
  { pattern: /sch\s*(\d+|[a-z]+)/i, extract: (m: RegExpMatchArray) => `SCH${m[1].toUpperCase()}` },
  // Dimensions like 25x5, 32x5
  { pattern: /(\d+)\s*x\s*(\d+)/i, extract: (m: RegExpMatchArray) => `${m[1]}X${m[2]}` },
  // Single numbers (fallback)
  { pattern: /^(\d+)$/, extract: (m: RegExpMatchArray) => m[1] },
];

// Variant mapping: common variants
const VARIANT_MAP: Record<string, string> = {
  // Form variants
  'seamless': 'SLS',
  'welded': 'WLD',
  'erw': 'WLD',
  'saw': 'WLD',
  
  // Surface variants
  'plain': 'PLN',
  'serrated': 'SER',
  'smooth': 'PLN',
  
  // Finish variants
  'galvanized': 'GALV',
  'galvanised': 'GALV',
  'gi': 'GALV',
  'hdg': 'GALV',
  'hot dip galvanized': 'GALV',
  'black': 'BLK',
  'bitumen': 'BLK',
  'untreated': 'UNT',
  'bare': 'UNT',
  'coated': 'CTD',
  
  // Grade variants
  'gr.b': 'GRB',
  'gr.a': 'GRA',
  'gr.6': 'GR6',
  'tp304': 'TP304',
  'tp316': 'TP316',
  'tp316l': 'TP316L',
  'x42': 'X42',
  'x52': 'X52',
  'x60': 'X60',
  
  // Origin variants
  'china': 'CN',
  'non-china': 'NCN',
  'non_china': 'NCN',
};

/**
 * Normalizes category to SKU code
 */
export function normalizeCategory(category: string | null | undefined): string {
  if (!category) {
    return 'UNK';
  }
  
  const normalized = category.toLowerCase().trim();
  
  // Direct match
  if (CATEGORY_MAP[normalized]) {
    return CATEGORY_MAP[normalized];
  }
  
  // Partial match (check if category contains any key)
  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  // Fallback: use uppercase first 4 chars
  return normalized.substring(0, 4).toUpperCase().padEnd(4, 'X');
}

/**
 * Normalizes material type to SKU code
 */
export function normalizeMaterial(
  materialType: string | null | undefined,
  category: string | null | undefined,
  notes: string | null | undefined
): string {
  if (!materialType) {
    // Special handling for FRP gratings
    const cat = (category || '').toLowerCase();
    if (cat.includes('frp') || cat.includes('grating')) {
      // Check notes for FRP type
      if (notes) {
        const notesLower = typeof notes === 'string' ? notes.toLowerCase() : JSON.stringify(notes).toLowerCase();
        if (notesLower.includes('pultruded')) {
          return 'FRPP';
        }
        if (notesLower.includes('molded')) {
          return 'FRPM';
        }
      }
    }
    return 'UNK';
  }
  
  const normalized = materialType.toLowerCase().trim();
  
  // Direct match
  if (MATERIAL_MAP[normalized]) {
    return MATERIAL_MAP[normalized];
  }
  
  // Partial match
  for (const [key, value] of Object.entries(MATERIAL_MAP)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  // Special handling for FRP gratings
  const cat = (category || '').toLowerCase();
  if (cat.includes('frp') || cat.includes('grating')) {
    if (normalized.includes('pultruded')) {
      return 'FRPP';
    }
    if (normalized.includes('molded')) {
      return 'FRPM';
    }
    // Check notes if material type doesn't have it
    if (notes) {
      const notesLower = typeof notes === 'string' ? notes.toLowerCase() : JSON.stringify(notes).toLowerCase();
      if (notesLower.includes('pultruded')) {
        return 'FRPP';
      }
      if (notesLower.includes('molded')) {
        return 'FRPM';
      }
    }
  }
  
  // Try to infer from common patterns
  if (normalized.includes('carbon') || normalized.includes('mild')) {
    return 'CS';
  }
  if (normalized.includes('stainless')) {
    return 'SS';
  }
  if (normalized.includes('alloy')) {
    return 'ALLOY';
  }
  
  return 'UNK';
}

/**
 * Normalizes standard to SKU code
 */
export function normalizeStandard(standard: string | null | undefined): string {
  if (!standard) {
    return 'UNK';
  }
  
  const normalized = standard.toLowerCase().trim();
  
  // Direct match
  if (STANDARD_MAP[normalized]) {
    return STANDARD_MAP[normalized];
  }
  
  // Partial match
  for (const [key, value] of Object.entries(STANDARD_MAP)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  // Extract common patterns
  const astmMatch = normalized.match(/astm\s*([a-z0-9]+)/i);
  if (astmMatch) {
    return astmMatch[1].toUpperCase();
  }
  
  const apiMatch = normalized.match(/api\s*([a-z0-9]+)/i);
  if (apiMatch) {
    return `API${apiMatch[1].toUpperCase()}`;
  }
  
  const asmeMatch = normalized.match(/asme\s*([a-z0-9.]+)/i);
  if (asmeMatch) {
    return asmeMatch[1].replace(/\./g, '').toUpperCase();
  }
  
  // Fallback: use first 6 uppercase chars
  return normalized.substring(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(4, 'X');
}

/**
 * Converts decimal inches to fraction or safe slug
 * Returns fractions using underscore separator (e.g., "1_2" for 1/2)
 */
function convertDecimalToFraction(decimal: number): string {
  // Common decimal to fraction mappings (using underscore instead of hyphen)
  const fractionMap: Record<number, string> = {
    0.5: '1_2',
    0.625: '5_8',
    0.75: '3_4',
    0.875: '7_8',
    0.25: '1_4',
    0.125: '1_8',
    0.375: '3_8',
  };

  if (fractionMap[decimal]) {
    return fractionMap[decimal];
  }

  // If no fraction match, convert to safe slug (remove decimal point)
  return decimal.toString().replace('.', '');
}

/**
 * Normalizes size to SKU code
 * IMPORTANT: Returns size strings WITHOUT hyphens to avoid ambiguity in SKU format
 */
export function normalizeSize(sizeDescription: string | null | undefined): string {
  if (!sizeDescription) {
    return 'UNK';
  }

  const normalized = sizeDescription.trim();

  // Check for decimal inches (e.g., 0.5IN, 0.625IN, etc.)
  const decimalInchMatch = normalized.match(/(\d+\.\d+)\s*IN/i);
  if (decimalInchMatch) {
    const decimal = parseFloat(decimalInchMatch[1]);
    const fraction = convertDecimalToFraction(decimal);
    return `${fraction}IN`;
  }

  // Check for decimal without IN suffix (e.g., 0.5, 0.625)
  const decimalMatch = normalized.match(/^(\d+\.\d+)$/);
  if (decimalMatch) {
    const decimal = parseFloat(decimalMatch[1]);
    const fraction = convertDecimalToFraction(decimal);
    return fraction;
  }

  // Try each pattern
  for (const { pattern, extract } of SIZE_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      try {
        let result = extract(match);
        // Check if result contains decimal point and fix it
        if (result.includes('.')) {
          const decimalMatch = result.match(/(\d+\.\d+)/);
          if (decimalMatch) {
            const decimal = parseFloat(decimalMatch[1]);
            const fraction = convertDecimalToFraction(decimal);
            result = result.replace(decimalMatch[1], fraction);
          }
        }
        // CRITICAL: Remove all hyphens from the result
        result = result.replace(/-/g, '');
        return result;
      } catch (e) {
        // Continue to next pattern
      }
    }
  }

  // If no pattern matches, try to clean and use first meaningful part
  // But first check for any remaining decimal points
  let cleaned = normalized.replace(/[^A-Z0-9X._-]/gi, '');

  // Fix any decimal points in the cleaned string
  if (cleaned.includes('.')) {
    const decimalMatch = cleaned.match(/(\d+\.\d+)/);
    if (decimalMatch) {
      const decimal = parseFloat(decimalMatch[1]);
      const fraction = convertDecimalToFraction(decimal);
      cleaned = cleaned.replace(decimalMatch[1], fraction);
    } else {
      // Remove decimal point if it's not part of a number
      cleaned = cleaned.replace(/\./g, '');
    }
  }

  // CRITICAL: Remove all hyphens from the final result
  // Replace hyphens with empty string (e.g., "U-TYPELOAD" -> "UTYPELOAD")
  cleaned = cleaned.replace(/-/g, '');

  cleaned = cleaned.substring(0, 10);
  if (cleaned.length > 0) {
    return cleaned.toUpperCase();
  }

  return 'UNK';
}

/**
 * Normalizes variant to SKU code
 * Variant can come from grade, notes, or other attributes
 */
export function normalizeVariant(
  grade: string | null | undefined,
  notes: string | null | undefined,
  originType: string | null | undefined
): string {
  // Check grade first
  if (grade) {
    const normalizedGrade = grade.toLowerCase().trim();
    if (VARIANT_MAP[normalizedGrade]) {
      return VARIANT_MAP[normalizedGrade];
    }
    
    // Partial match in grade
    for (const [key, value] of Object.entries(VARIANT_MAP)) {
      if (normalizedGrade.includes(key)) {
        return value;
      }
    }
  }
  
  // Check notes (may contain JSON with additional info)
  if (notes) {
    try {
      const notesObj = typeof notes === 'string' ? JSON.parse(notes) : notes;
      const notesStr = JSON.stringify(notesObj).toLowerCase();
      
      for (const [key, value] of Object.entries(VARIANT_MAP)) {
        if (notesStr.includes(key)) {
          return value;
        }
      }
    } catch (e) {
      // Not JSON, treat as string
      const notesLower = notes.toLowerCase();
      for (const [key, value] of Object.entries(VARIANT_MAP)) {
        if (notesLower.includes(key)) {
          return value;
        }
      }
    }
  }
  
  // Check origin type
  if (originType) {
    const originLower = originType.toLowerCase();
    if (originLower === 'china') {
      return 'CN';
    }
    if (originLower === 'non_china' || originLower === 'non-china') {
      return 'NCN';
    }
  }
  
  return 'UNK';
}

/**
 * Normalizes subcategory to SKU code
 */
export function normalizeSubcategory(
  subcategory: string | null | undefined,
  category: string | null | undefined
): string {
  if (!subcategory) {
    return 'NCN'; // Default: No Category Name
  }
  
  const normalized = subcategory.toUpperCase().trim();
  const cat = (category || '').toUpperCase();
  
  // Fasteners
  if (cat.includes('FAST')) {
    if (normalized === 'HX' || normalized.includes('HEX')) return 'HX';
    if (normalized === 'ST' || normalized.includes('STUD')) return 'ST';
    if (normalized === 'NT' || normalized.includes('NUT')) return 'NT';
    if (normalized === 'UB' || normalized.includes('ANCHOR')) return 'UB';
    if (normalized === 'WS' || normalized.includes('WASHER')) return 'WS';
  }
  
  // Fittings
  if (cat.includes('FITG') || cat.includes('FITTING')) {
    if (normalized === 'EL' || normalized.includes('ELBOW')) return 'EL';
    if (normalized === 'TE' || normalized.includes('TEE')) return 'TE';
    if (normalized === 'RE' || normalized.includes('REDUCER')) return 'RE';
    if (normalized === 'CA' || normalized.includes('CAP') || normalized.includes('COUPLING')) return 'CA';
  }
  
  // Flanges
  if (cat.includes('FLNG') || cat.includes('FLANGE')) {
    if (normalized.includes('SORF') || normalized.includes('SO-RF')) return 'SORF';
    if (normalized.includes('BLRF') || normalized.includes('BL-RF')) return 'BLRF';
    if (normalized.includes('WNRF') || normalized.includes('WN-RF') || normalized.includes('WNRTJ')) return 'WNRF';
  }
  
  // Gratings
  if (cat.includes('GRAT') || cat.includes('GRATING')) {
    // Series patterns like S1-SERR, S1-SMOOTH, etc.
    // CRITICAL: Replace hyphens with underscores to avoid invalid SKUs
    if (normalized.match(/^S\d+[_-](SERR|SMOOTH)$/)) {
      return normalized.replace(/-/g, '_');
    }
    // Try to extract from patterns
    const seriesMatch = normalized.match(/S(\d+)/);
    if (seriesMatch) {
      const series = seriesMatch[1];
      const isSerrated = normalized.includes('SERR') || normalized.includes('S-');
      return `S${series}_${isSerrated ? 'SERR' : 'SMOOTH'}`;
    }
  }
  
  // Pipes
  if (cat.includes('PIPE')) {
    if (normalized.includes('SMS') || normalized.includes('SEAMLESS')) return 'SMS';
    if (normalized.includes('WLD') || normalized.includes('WELDED')) return 'WLD';
  }
  
  // Return as-is if it's already a valid code, otherwise return NCN
  if (normalized.length <= 10 && /^[A-Z0-9-]+$/.test(normalized)) {
    return normalized;
  }
  
  return 'NCN';
}

/**
 * Normalizes all attributes at once
 */
export function normalizeAttributes(attributes: {
  category?: string | null;
  materialType?: string | null;
  subcategory?: string | null;
  standard?: string | null;
  sizeDescription?: string | null;
  grade?: string | null;
  notes?: string | null;
  originType?: string | null;
}): {
  category: string;
  material: string;
  subcategory: string;
  std: string;
  size: string;
  variant: string;
} {
  const category = normalizeCategory(attributes.category);
  return {
    category,
    material: normalizeMaterial(attributes.materialType, attributes.category, attributes.notes),
    subcategory: normalizeSubcategory(attributes.subcategory, attributes.category),
    std: normalizeStandard(attributes.standard),
    size: normalizeSize(attributes.sizeDescription),
    variant: normalizeVariant(attributes.grade, attributes.notes, attributes.originType),
  };
}

