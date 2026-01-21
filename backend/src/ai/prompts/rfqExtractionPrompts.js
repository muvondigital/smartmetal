/**
 * RFQ Extraction Prompts
 * 
 * Prompts for extracting and parsing RFQ data from documents
 */

/**
 * Base template for RFQ parsing prompt
 * This is a template function that builds the prompt dynamically based on input
 * Note: The actual prompt building logic remains in aiParseService.js
 * This file contains the base template structure
 */
const RFQ_EXTRACT_V1 = {
  id: "RFQ_EXTRACT_V1",
  description: "RFQ extraction prompt for parsing structured OCR output into RFQ JSON format",
  template: null, // This is built dynamically by buildRfqParsingPrompt function
  // The template is constructed in aiParseService.js based on document structure
};

/**
 * Document Intelligence RFQ structuring prompt
 */
const RFQ_STRUCTURE_V1 = {
  id: "RFQ_STRUCTURE_V1",
  description: "RFQ structuring prompt for Document Intelligence extracted data - NSC QUOTATION FORMAT",
  template: {
    system: `You are an expert at analyzing RFQ (Request for Quotation) documents for NSC, a steel trading company.
Your task is to extract structured data that matches NSC's quotation input contract.

REFERENCE: test_data/ground_truth/NSC_ENDPRODUCT_MAPPING.md

NSC BUSINESS CONTEXT:
NSC is a steel trading company that trades:
- Item Types: Pipes, Flanges, Fittings (elbows, tees, reducers), Valves, Beams (HEA, HEB, W-beams), Plates, Fasteners (bolts, gaskets, studs)
- Materials: Carbon Steel (A105, A106, A234, A53, API 5L), Stainless Steel (316L, 304L, A182, A312, A403), Alloys (Monel 400, Incoloy 825, Duplex/S32205, Hastelloy), European standards (EN10210, EN10225, S355)
- Units: M (meters), EA (each), PCS (pieces), KG, SET

WHAT TO EXTRACT:
Focus on items that NSC trades (pipes, flanges, fittings, valves, structural steel, fasteners).
IGNORE: Administrative documents (VDRL tables, revision histories, approval matrices, transmittals), non-steel items (electrical, cables, instruments, software, services).

NSC ENDPRODUCT FIELDS (only these):
- item_no (line number)
- rfq_reference
- description (full item description)
- material (material spec)
- od_mm (pipes only)
- tk_mm (pipes only)
- quantity
- unit (M, EA, KG, SET - uppercase)
- unit_weight_kg (optional)
- total_weight_kg (optional)
- notes (optional)

Return a JSON object with this structure:
{
  "metadata": {
    "customer_name": "string or null",
    "rfq_number": "string or null",
    "date": "YYYY-MM-DD or null",
    "project": "string or null",
    "delivery_address": "string or null",
    "contact_name": "string or null",
    "contact_email": "string or null",
    "contact_phone": "string or null"
  },
  "items": [
    {
      "item_no": "1",
      "rfq_reference": "RFQ/10/2025/01630",
      "description": "Pipa DN25 Monel 400 Sch40s (2.4360)",
      "material": "Monel 400",
      "od_mm": "33.40",
      "tk_mm": "6.02",
      "quantity": "12",
      "unit": "M",
      "unit_weight_kg": "4.61",
      "total_weight_kg": "55.3",
      "notes": ""
    }
  ],
  "confidence": 0.0-1.0,
  "extraction_notes": "any issues or ambiguities found"
}

CRITICAL RULES:
- Extract ALL items from tables that match NSC's business (pipes, flanges, fittings, valves, beams, plates, fasteners)
- SKIP items that are clearly administrative (VDRL, revision history, approval matrices) or non-steel (electrical, cables, instruments, services)
- Quantity and unit must be exact; use uppercase units (M, EA, PCS, KG, SET)
- If a field is missing or unclear, set it to null (do NOT guess)
- OD/TK only when the document clearly provides them
- Do NOT include pricing, origin, leadtime, or supplier fields (NSC adds these during quotation)
- Handle format variations: "DN" = "NPS", "Pipa" = "Pipe", Indonesian/English variations`,
    user: (extractedData) => `Please extract RFQ data from the following document:

EXTRACTED TEXT:
${extractedData.text}

EXTRACTED TABLES:
${JSON.stringify(extractedData.tables, null, 2)}

Extract and structure this into the standard RFQ format.`
  }
};

module.exports = {
  RFQ_EXTRACT_V1,
  RFQ_STRUCTURE_V1,
};

