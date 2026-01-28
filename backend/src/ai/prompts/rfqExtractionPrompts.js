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
Extract ALL legitimate items from the document tables - extract everything that appears to be a material/item line in the document, regardless of type.
Extract items like a human would: if it's in a table with item numbers, descriptions, quantities, and units - extract it.

IGNORE ONLY:
- Administrative documents (VDRL tables, revision histories, approval matrices, transmittals)
- Header rows, footer rows, summary rows that don't represent actual items
- Empty rows or rows with only formatting/separators

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
- Extract ALL legitimate items from tables - extract every item that appears in the document with item numbers, descriptions, quantities, and units
- Extract items like a human would: if it's a real item in the document, extract it (cables, electrical, instruments, pipes, flanges - extract everything)
- SKIP ONLY: Administrative tables (VDRL, revision history, approval matrices), header/footer rows, empty rows, summary rows
- Let NSC decide later what to quote - your job is to extract everything that's in the document
- If a field is missing or unclear, set it to null (do NOT guess)
- OD/TK only when the document clearly provides them
- Do NOT include pricing, origin, leadtime, or supplier fields (NSC adds these during quotation)
- Handle format variations: "DN" = "NPS", "Pipa" = "Pipe", Indonesian/English variations

CRITICAL QUANTITY vs LENGTH RULES (READ CAREFULLY):
- "quantity" = NUMBER OF PIECES (integer count of items, e.g., 36 beams, 18 pipes)
  - Look for columns named: "Round Qty", "Qty", "Quantity", "PCS", "Nett Qty", "Pieces"
  - This is typically a small integer (1-500)
- For MTO documents, "Total As Drawing", "Total Length", "Req Length" columns contain LENGTH in METERS - NOT quantity!
  - These are typically decimal numbers (e.g., 428.91 m)
- DO NOT confuse total length (meters) with quantity (pieces)!
- If a table has both "Round Qty" (or similar) and "Total Length" columns:
  - Extract "Round Qty" value as quantity (pieces)
  - Do NOT use "Total Length" as quantity
- unit should be EA, PCS, or SET for piece counts - NOT "M" (meters) when counting pieces
- If you see decimal values like 428.91 with unit "m", that's LENGTH not QUANTITY - look for a separate piece count column`,
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

