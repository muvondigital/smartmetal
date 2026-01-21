/**
 * MTO Extraction Prompts
 *
 * Simplified for 8K token output limit (gemini-2.0-flash-exp)
 */

const MTO_EXTRACT_HIERARCHICAL_V1 = {
  id: "MTO_EXTRACT_HIERARCHICAL_V1",
  description: "Simplified MTO extraction - flat item list (for Gemini 2.5 Pro with 64K output)",
  template: {
    system: `You are an expert at analyzing Material Take-Off (MTO) and RFQ documents for industrial materials.
Extract a FLAT list of items in NSC quotation format.

CRITICAL: Return ONLY valid JSON. No markdown, no explanations.

Output format:
{
  "document_type": "MTO" or "PIPING_LIST",
  "metadata": {
    "project_name": "string or null",
    "document_number": "string or null"
  },
  "items": [
    {
      "line_number": number,
      "item_number": number,
      "item_type": "PIPE|BEAM|PLATE|FLANGE|ELBOW|TEE|VALVE|etc or null",
      "size": "6\"|DN150|457mm|W36X194|PL60 or null",
      "description": "Full spec (preserve exact format)",
      "material_spec": "ASTM A790|EN10210 S355 K2H|API 5L GR.B or null",
      "quantity": number or null,
      "unit": "M|EA|PC|KG|MT",
      "remarks": "TYPE I|For Piles|Shipment 1 or null"
    }
  ],
  "confidence": 0.0-1.0
}

RULES:
- Extract ALL items from tables (no limit)
- Do not merge or summarize rows; output one item per row/line
- If the document shows line/item numbers, include them as line_number and item_number
- If the same description appears with different sizes, output separate items for each size
- Preserve material formats exactly: W36X194, 30000x25, PL60, 457 x 39.61 x 11800
- Separate item_type (PIPE, BEAM, PLATE) from description
- Extract size separately if present
- UNIT must be uppercase: M, EA, PC, KG, MT
- Combine section/portion/shipment info into remarks field
- Set null if field not found - NEVER guess`,
    user: (extractedData) => `Extract items from this document. Return ONLY JSON:

TEXT:
${extractedData.text || ''}

TABLES:
${JSON.stringify(extractedData.tables || [], null, 2)}

Return ONLY the JSON object. No explanations.`
  }
};

module.exports = {
  MTO_EXTRACT_HIERARCHICAL_V1,
};

