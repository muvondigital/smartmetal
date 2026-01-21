/**
 * NSC QUOTATION FORMAT SCHEMA
 *
 * This is the OFFICIAL output format that NSC uses for their quotations.
 * Source: test_data/EndProduct/*.pdf (actual NSC quotation PDFs)
 *
 * DO NOT CHANGE THIS WITHOUT CHECKING REAL NSC QUOTATIONS.
 */

/**
 * NSC Quotation Line Item Schema
 * Based on actual EndProduct quotation PDFs:
 * - QUO-NSC25-2711-208 R0 (Material Incoloy dan Duplex)
 * - QUO-NSC25-2110-195 R0 (Pipes and Fittings)
 */
const NSC_QUOTATION_LINE_ITEM_SCHEMA = {
  // Core identification fields
  NO: 'number',                    // Line number (1, 2, 3, ...)
  ITEM: 'string',                  // Item type: PIPE, ELBOW 90 DEG, ELBOW 45 DEG, EQUAL TEE, BLIND FLANGE, FLANGE WN, BALL VALVE, BARRED TEE, REDUCER, BEAM HEA, BEAM HEB, PLATE
  SIZE: 'string | null',           // Nominal size: 6", 2", DN150, 457mm, 30000x25, etc.

  // Technical specification fields
  DESCRIPTION: 'string',           // Full material spec (formerly called MATERIAL SPEC column in some docs)
                                   // Examples:
                                   // - "PIPE 6", SCH 20, SMLS, BE, CS A53 GR.B/API 5L GR.B + INCOLOY 825 CLAD, ERW"
                                   // - "ELBOW 6", 90 DEG, SCH 20, BW, CS A234 WPB + INCOLOY 825 WELD OVERLAY, ASME B16.9"
                                   // - "PIPE 2", SCH 10S, WELD, BE, DUPLEX, A790 SS 31803 SEAMLESS, 6MTR"
                                   // - "PIPE,SEAMLESS,TYPE I,457 x 39.61 x 11800,EN10210 S355 K2H"
                                   // - "BEAM,HEA,TYPE I,1000 x 300 x 272 x 11800,EN10225 S355 MLO"

  'MATERIAL SPEC': 'string | null', // Material standard/specification (sometimes in OFFER column, sometimes separate)
                                     // Examples:
                                     // - "ASTM A790/ASME SA790 ; UNS S32205"
                                     // - "ASTM A815/ASME SA815 ; UNS S32205"
                                     // - "EN10210 S355 K2H"
                                     // - "EN10225 S355 MLO"
                                     // - "Monel 400"
                                     // - "COMPLY" (means complies with spec in description)

  // Quantity fields
  QTY: 'number',                   // Quantity as number (56.5, 2, 97, 11, etc.)
  UNIT: 'string',                  // Unit: M (meters), EA (each), PC (pieces), KG, etc. - ALWAYS UPPERCASE

  // Commercial fields (NSC adds these during quotation)
  OFFER: 'string | null',          // Compliance statement or offer terms (usually "COMPLY")
  'ORIGIN/BRAND': 'string | null', // Supplier/manufacturer: "BENKAN, JAPAN", "NSC, JAPAN", "W.MAASS, GERMANY", "CHINA", etc.
  LEADTIME: 'string | null',       // Delivery time: "10-12 WORKING WEEKS", "1-2 WORKING WEEKS", "45-55 WORKING DAYS"

  // Pricing fields (NSC adds these)
  'UNIT PRICE (USD)': 'number | null',  // Price per unit in USD
  'TOTAL PRICE (USD)': 'number | null', // Total = QTY × UNIT PRICE

  // Optional fields
  'OD (MM)': 'string | null',      // Outer diameter (for pipes/tubulars)
  'TK (MM)': 'string | null',      // Thickness/wall thickness
  'UNIT WEIGHT (KG)': 'number | null', // Unit weight
  'TOTAL WEIGHT (KG)': 'number | null', // Total weight
  'REMARKS': 'string | null'       // Additional notes: "For Jacket Roll & Pitch Braces", "For Piles", "TYPE I", etc.
};

/**
 * Example NSC Quotation Line Items (from real EndProduct PDFs)
 */
const NSC_QUOTATION_EXAMPLES = [
  {
    NO: 1,
    ITEM: 'PIPE',
    SIZE: '6"',
    DESCRIPTION: 'PIPE 6", SCH 20, SMLS, BE, CS A53 GR.B/API 5L GR.B + INCOLOY 825 CLAD, ERW',
    'MATERIAL SPEC': 'COMPLY',
    OFFER: 'COMPLY',
    'ORIGIN/BRAND': 'TPCO/HENYANG VALIN, CHINA',
    LEADTIME: '10-12 WORKING WEEKS',
    QTY: 56.5,
    UNIT: 'M',
    'UNIT PRICE (USD)': 563.00,
    'TOTAL PRICE (USD)': 31809.50
  },
  {
    NO: 2,
    ITEM: 'ELBOW 90 DEG',
    SIZE: '6"',
    DESCRIPTION: 'ELBOW 6", 90 DEG, SCH 20, BW, CS A234 WPB + INCOLOY 825 WELD OVERLAY, ASME B16.9',
    'MATERIAL SPEC': 'COMPLY',
    OFFER: 'COMPLY',
    'ORIGIN/BRAND': 'BENKAN, JAPAN',
    LEADTIME: '10-12 WORKING WEEKS',
    QTY: 2,
    UNIT: 'EA',
    'UNIT PRICE (USD)': 1875.00,
    'TOTAL PRICE (USD)': 3750.00
  },
  {
    NO: 9,
    ITEM: 'PIPE',
    SIZE: '2"',
    DESCRIPTION: 'PIPE 2", SCH 10S, WELD, BE, DUPLEX, A790 SS 31803 SEAMLESS, 6MTR',
    'MATERIAL SPEC': 'ASTM A790/ASME SA790 ; UNS S32205',
    OFFER: 'SEAMLESS, 6MTR',
    'ORIGIN/BRAND': 'NSC, JAPAN',
    LEADTIME: '1-2 WORKING WEEKS',
    QTY: 97,
    UNIT: 'M',
    'UNIT PRICE (USD)': 109.00,
    'TOTAL PRICE (USD)': 10573.00
  },
  {
    NO: 1,
    ITEM: 'PIPE',
    SIZE: null, // Sometimes size is embedded in description
    DESCRIPTION: 'Pipa DN25 Monel 400 (2.4360) sch40s DN40',
    'MATERIAL SPEC': 'Monel 400',
    'OD (MM)': '33.40',
    'TK (MM)': '6.02',
    QTY: 12,
    UNIT: 'M',
    'UNIT WEIGHT (KG)': 4.61,
    'TOTAL WEIGHT (KG)': 55.3,
    OFFER: 'COMPLY',
    'ORIGIN/BRAND': 'CHINA',
    LEADTIME: '45-55 WORKING DAYS',
    'UNIT PRICE (USD)': 159.00,
    'TOTAL PRICE (USD)': 1908.00
  }
];

/**
 * Field Extraction Priority
 *
 * When AI extracts from documents, use this priority:
 * 1. ITEM TYPE - Always extract separately (PIPE, ELBOW, etc.)
 * 2. SIZE - Extract if present and separate from description
 * 3. DESCRIPTION - Full technical spec (schedule, material, standard)
 * 4. MATERIAL SPEC - Standards (ASTM, EN, API, etc.)
 * 5. QTY + UNIT - Always required
 * 6. REMARKS - Any special notes
 * 7. Other fields - Set to null (NSC adds during quotation)
 */

module.exports = {
  NSC_QUOTATION_LINE_ITEM_SCHEMA,
  NSC_QUOTATION_EXAMPLES,
};
