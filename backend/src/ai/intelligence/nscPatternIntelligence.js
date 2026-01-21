/**
 * NSC Pattern Intelligence
 * 
 * This module defines what NSC trades based on analysis of NSC's actual quotations.
 * Source: test_data/EndProduct/*.pdf (actual NSC quotation PDFs)
 * 
 * Purpose:
 * - Teach the system what NSC cares about (item types, materials, structure)
 * - Use these patterns to intelligently filter commercial requests
 * - Handle format variations (Shell, Petronas, PetroVietnam) by focusing on content
 * 
 * Key Insight: NSC is a steel trading company. They trade specific item types and materials.
 * Commercial requests vary in format, but contain the same types of items NSC quotes.
 */

/**
 * ITEM TYPES that NSC Quotes
 * 
 * Based on analysis of QUO-NSC25-2711-208 and QUO-NSC25-2110-195
 */
const NSC_ITEM_TYPES = {
  // Pipes and Tubulars
  PIPE: {
    keywords: ['pipe', 'pipa', 'tube', 'tubular'],
    patterns: [
      /pipe/i,
      /pipa/i,
      /\d+"\s*sch/i,  // "6" SCH"
      /dn\d+/i,        // "DN25"
      /nps\s*\d+/i     // "NPS 6"
    ],
    units: ['M', 'EA', 'MTR', 'METRE', 'METER'],
    descriptionPatterns: [
      /pipe.*sch.*[a-z0-9]/i,
      /pipa.*dn\d+/i,
      /tubular.*\d+.*x.*\d+/i  // "457 x 39.61"
    ]
  },

  // Fittings
  ELBOW_90: {
    keywords: ['elbow 90', 'elbow', '90 deg', '90°'],
    patterns: [/elbow.*90/i, /90.*deg.*elbow/i],
    units: ['EA', 'PCS', 'SET'],
    variants: ['ELBOW 90 DEG', 'ELBOW 90°', '90 DEG ELBOW']
  },
  ELBOW_45: {
    keywords: ['elbow 45', '45 deg', '45°'],
    patterns: [/elbow.*45/i, /45.*deg.*elbow/i],
    units: ['EA', 'PCS'],
    variants: ['ELBOW 45 DEG', 'ELBOW 45°']
  },
  TEE: {
    keywords: ['tee', 'equal tee', 'barred tee', 't-joint'],
    patterns: [/equal tee/i, /barred tee/i, /tee/i],
    units: ['EA', 'PCS'],
    variants: ['EQUAL TEE', 'BARRED TEE', 'TEE']
  },
  REDUCER: {
    keywords: ['reducer', 'concentric reducer', 'eccentric reducer'],
    patterns: [/reducer/i],
    units: ['EA', 'PCS'],
    variants: ['REDUCER', 'CONCENTRIC REDUCER', 'ECCENTRIC REDUCER']
  },
  COUPLING: {
    keywords: ['coupling', 'coupler'],
    patterns: [/coupling/i],
    units: ['EA', 'PCS', 'SET'],
    variants: ['COUPLING']
  },
  CAP: {
    keywords: ['cap', 'end cap'],
    patterns: [/cap/i],
    units: ['EA', 'PCS'],
    variants: ['CAP']
  },

  // Flanges
  FLANGE_WN: {
    keywords: ['flange wn', 'welding neck flange', 'wn flange'],
    patterns: [/flange.*wn/i, /wn.*flange/i, /welding neck/i],
    units: ['EA', 'PCS'],
    variants: ['FLANGE WN', 'WELDING NECK FLANGE']
  },
  BLIND_FLANGE: {
    keywords: ['blind flange', 'blank flange'],
    patterns: [/blind flange/i, /blank flange/i],
    units: ['EA', 'PCS'],
    variants: ['BLIND FLANGE', 'BLANK FLANGE']
  },
  FLANGE: {
    keywords: ['flange'],
    patterns: [/flange/i],
    units: ['EA', 'PCS'],
    variants: ['FLANGE']
  },

  // Valves
  VALVE: {
    keywords: ['valve', 'ball valve', 'gate valve', 'check valve', 'butterfly valve'],
    patterns: [/ball valve/i, /gate valve/i, /check valve/i, /butterfly valve/i, /\bvalve\b/i],
    units: ['EA', 'PCS', 'SET'],
    variants: ['BALL VALVE', 'GATE VALVE', 'CHECK VALVE', 'BUTTERFLY VALVE', 'VALVE']
  },

  // Structural
  BEAM_HEA: {
    keywords: ['beam hea', 'hea beam'],
    patterns: [/hea.*beam/i, /beam.*hea/i, /hea\s+\d+/i],
    units: ['M', 'EA', 'MTR'],
    variants: ['BEAM HEA', 'HEA BEAM']
  },
  BEAM_HEB: {
    keywords: ['beam heb', 'heb beam'],
    patterns: [/heb.*beam/i, /beam.*heb/i, /heb\s+\d+/i],
    units: ['M', 'EA', 'MTR'],
    variants: ['BEAM HEB', 'HEB BEAM']
  },
  BEAM: {
    keywords: ['beam', 'w beam', 'i beam'],
    patterns: [/w\d+.*x.*\d+/i, /i\s*\d+.*beam/i, /\bbeam\b/i],
    units: ['M', 'EA', 'MTR'],
    variants: ['BEAM', 'W BEAM', 'I BEAM']
  },
  PLATE: {
    keywords: ['plate', 'sheet'],
    patterns: [/pl\d+/i, /plate.*\d+.*mm/i, /\bplate\b/i],
    units: ['M2', 'KG', 'EA', 'M²'],
    variants: ['PLATE', 'SHEET']
  },

  // Fasteners (NSC also trades these)
  BOLT: {
    keywords: ['bolt', 'stud bolt'],
    patterns: [/bolt/i, /stud bolt/i],
    units: ['EA', 'PCS', 'SET'],
    variants: ['BOLT', 'STUD BOLT']
  },
  GASKET: {
    keywords: ['gasket'],
    patterns: [/gasket/i],
    units: ['EA', 'PCS', 'SET'],
    variants: ['GASKET']
  },
  NUT: {
    keywords: ['nut'],
    patterns: [/nut/i],
    units: ['EA', 'PCS', 'SET'],
    variants: ['NUT']
  },
  STUD: {
    keywords: ['stud'],
    patterns: [/stud/i],
    units: ['EA', 'PCS', 'SET'],
    variants: ['STUD']
  }
};

/**
 * MATERIALS that NSC Trades
 * 
 * Based on actual quotations: Monel 400, Incoloy 825, Duplex, Carbon Steel, Stainless Steel
 */
const NSC_MATERIALS = {
  // Carbon Steel Grades
  CARBON_STEEL: {
    standards: ['A105', 'A106', 'A234', 'A350', 'A694', 'A53', 'API 5L'],
    grades: ['GR.B', 'GR.A', 'WPB', 'WPC', 'LF2'],
    keywords: ['carbon steel', 'cs', 'mild steel'],
    patterns: [
      /a53\s*gr\.?b/i,
      /a106\s*gr\.?b/i,
      /a234\s*wpb/i,
      /api\s*5l/i,
      /carbon\s*steel/i,
      /\bcs\b/i
    ]
  },

  // Stainless Steel
  STAINLESS_STEEL: {
    standards: ['A182', 'A312', 'A403', 'A240'],
    grades: ['316L', '304L', '316', '304', '321', '347'],
    keywords: ['stainless', 'ss', '316l', '304l'],
    patterns: [
      /a182\s*f[0-9]+/i,
      /a312\s*tp[0-9]+/i,
      /316l/i,
      /304l/i,
      /stainless\s*steel/i,
      /\bss\b/i
    ]
  },

  // Alloys
  MONEL: {
    keywords: ['monel'],
    grades: ['400', 'K500'],
    patterns: [/monel\s*400/i, /monel\s*k500/i],
    examples: ['Monel 400', 'MONEL 400']
  },
  INCOLOY: {
    keywords: ['incoloy'],
    grades: ['825', '800', '800H'],
    patterns: [/incoloy\s*825/i, /incoloy\s*800/i],
    examples: ['INCOLOY 825', 'Incoloy 825']
  },
  DUPLEX: {
    keywords: ['duplex', 'super duplex'],
    standards: ['A790', 'A815'],
    grades: ['S32205', 'S31803', 'S32750'],
    patterns: [
      /duplex/i,
      /a790.*s32205/i,
      /a815.*s32205/i,
      /uns\s*s32205/i,
      /super\s*duplex/i
    ],
    examples: ['DUPLEX', 'ASTM A790/ASME SA790 ; UNS S32205']
  },
  HASTELLOY: {
    keywords: ['hastelloy'],
    grades: ['C276', 'C22', 'B2'],
    patterns: [/hastelloy/i],
    examples: ['Hastelloy C276']
  },

  // European Standards (from quotations)
  EUROPEAN_STEEL: {
    standards: ['EN10210', 'EN10225'],
    grades: ['S355', 'S355 K2H', 'S355 MLO'],
    patterns: [
      /en10210\s*s355/i,
      /en10225\s*s355/i,
      /s355\s*k2h/i,
      /s355\s*mlo/i
    ],
    examples: ['EN10210 S355 K2H', 'EN10225 S355 MLO']
  }
};

/**
 * UNITS that NSC Uses
 */
const NSC_UNITS = {
  LENGTH: ['M', 'MTR', 'METRE', 'METER', 'FT', 'FEET'],
  QUANTITY: ['EA', 'PCS', 'PC', 'PIECE', 'PIECES', 'EACH'],
  WEIGHT: ['KG', 'TON', 'TONNE', 'LB', 'POUND'],
  AREA: ['M2', 'M²', 'SQM', 'SQFT'],
  SET: ['SET', 'SETS']
};

/**
 * PATTERNS that indicate NSC-relevant items
 */
const NSC_RELEVANCE_PATTERNS = {
  // Positive signals (items NSC trades)
  POSITIVE: [
    // Item types
    ...Object.values(NSC_ITEM_TYPES).flatMap(type => type.keywords),
    // Materials
    ...Object.values(NSC_MATERIALS).flatMap(mat => mat.keywords || []),
    ...Object.values(NSC_MATERIALS).flatMap(mat => mat.grades || []),
    // Standards
    ...Object.values(NSC_MATERIALS).flatMap(mat => mat.standards || []),
    // Units
    ...Object.values(NSC_UNITS).flat(),
    // Dimensions
    ['dn', 'nps', 'sch', 'schedule', 'class', 'rating', 'od', 'id', 'thickness'],
    // Column headers
    ['item', 'qty', 'quantity', 'description', 'material', 'size', 'spec', 'unit']
  ].flat(),

  // Negative signals (items NSC does NOT trade or noise)
  NEGATIVE: [
    // Administrative documents
    'vendor data requirement', 'vdrl', 'document list',
    'revision history', 'approval matrix', 'transmittal',
    'table of contents', 'reference documents',
    'signature', 'approval', 'revision',
    // Non-NSC items (examples of what to ignore)
    'electrical', 'cable', 'instrument', 'software',
    'service', 'installation', 'labor', 'transportation',
    // Format noise
    'page', 'of', 'confidential', 'proprietary'
  ]
};

/**
 * Check if an item description matches NSC's item types
 * @param {string} description - Item description
 * @returns {Object|null} Matched item type info or null
 */
function matchNscItemType(description) {
  if (!description) return null;

  const desc = description.toUpperCase();

  // Check each item type
  for (const [typeKey, typeInfo] of Object.entries(NSC_ITEM_TYPES)) {
    // Check keywords
    const keywordMatch = typeInfo.keywords.some(keyword =>
      desc.includes(keyword.toUpperCase())
    );

    // Check patterns
    const patternMatch = typeInfo.patterns.some(pattern =>
      pattern.test(description)
    );

    if (keywordMatch || patternMatch) {
      return {
        type: typeKey,
        variant: typeInfo.variants?.[0] || typeKey,
        confidence: keywordMatch && patternMatch ? 0.95 : 0.75,
        matchedPattern: keywordMatch ? 'keyword' : 'pattern'
      };
    }
  }

  return null;
}

/**
 * Check if material matches NSC's material patterns
 * @param {string} material - Material description
 * @returns {Object|null} Matched material info or null
 */
function matchNscMaterial(material) {
  if (!material) return null;

  const mat = material.toUpperCase();

  // Check each material category
  for (const [matKey, matInfo] of Object.entries(NSC_MATERIALS)) {
    // Check keywords
    const keywordMatch = matInfo.keywords?.some(keyword =>
      mat.includes(keyword.toUpperCase())
    );

    // Check patterns
    const patternMatch = matInfo.patterns?.some(pattern =>
      pattern.test(material)
    );

    // Check standards
    const standardMatch = matInfo.standards?.some(standard =>
      mat.includes(standard.toUpperCase())
    );

    // Check grades
    const gradeMatch = matInfo.grades?.some(grade =>
      mat.includes(grade.toUpperCase())
    );

    if (keywordMatch || patternMatch || standardMatch || gradeMatch) {
      return {
        category: matKey,
        confidence: (keywordMatch ? 0.3 : 0) + (patternMatch ? 0.4 : 0) + (standardMatch ? 0.2 : 0) + (gradeMatch ? 0.1 : 0),
        matchedSignals: {
          keyword: keywordMatch,
          pattern: patternMatch,
          standard: standardMatch,
          grade: gradeMatch
        }
      };
    }
  }

  return null;
}

/**
 * Check if a page/text is relevant to NSC (contains NSC-tradeable items)
 * @param {string} text - Text to check
 * @returns {Object} Relevance score and reasons
 */
function scoreNscRelevance(text) {
  if (!text) return { score: 0, reasons: ['empty_text'] };

  const lowerText = text.toLowerCase();
  let score = 0;
  const reasons = [];
  const signals = {
    itemTypes: [],
    materials: [],
    units: [],
    negative: []
  };

  // Positive signals: Item types
  for (const [typeKey, typeInfo] of Object.entries(NSC_ITEM_TYPES)) {
    const match = typeInfo.keywords.some(keyword => lowerText.includes(keyword));
    if (match) {
      score += 10;
      signals.itemTypes.push(typeKey);
      reasons.push(`item_type: ${typeKey}`);
    }
  }

  // Positive signals: Materials
  for (const [matKey, matInfo] of Object.entries(NSC_MATERIALS)) {
    const match = matInfo.keywords?.some(keyword => lowerText.includes(keyword.toLowerCase()));
    if (match) {
      score += 8;
      signals.materials.push(matKey);
      reasons.push(`material: ${matKey}`);
    }
  }

  // Positive signals: Units
  for (const unit of Object.values(NSC_UNITS).flat()) {
    if (new RegExp(`\\b${unit.toLowerCase()}\\b`).test(lowerText)) {
      score += 2;
      signals.units.push(unit);
      if (!reasons.some(r => r.startsWith('unit'))) {
        reasons.push('unit: present');
      }
    }
  }

  // Negative signals
  for (const negKeyword of NSC_RELEVANCE_PATTERNS.NEGATIVE) {
    if (lowerText.includes(negKeyword.toLowerCase())) {
      score -= 30; // Strong penalty
      signals.negative.push(negKeyword);
      reasons.push(`negative: ${negKeyword}`);
    }
  }

  return {
    score: Math.max(0, score),
    reasons,
    signals,
    isRelevant: score > 15 // Threshold: needs multiple positive signals
  };
}

/**
 * Get all NSC item type keywords (for filtering)
 */
function getAllNscItemKeywords() {
  return Object.values(NSC_ITEM_TYPES).flatMap(type => type.keywords);
}

/**
 * Get all NSC material keywords (for filtering)
 */
function getAllNscMaterialKeywords() {
  return Object.values(NSC_MATERIALS).flatMap(mat => mat.keywords || []);
}

module.exports = {
  NSC_ITEM_TYPES,
  NSC_MATERIALS,
  NSC_UNITS,
  NSC_RELEVANCE_PATTERNS,
  matchNscItemType,
  matchNscMaterial,
  scoreNscRelevance,
  getAllNscItemKeywords,
  getAllNscMaterialKeywords
};
