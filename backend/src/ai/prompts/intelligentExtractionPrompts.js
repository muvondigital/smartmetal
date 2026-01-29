/**
 * Intelligent Extraction Prompts
 *
 * These prompts are designed to let the LLM UNDERSTAND documents
 * rather than just format pre-extracted data.
 *
 * Key principles:
 * 1. No hardcoded column names or patterns
 * 2. Let the LLM determine document structure
 * 3. Handle ANY number format, language, or layout
 * 4. Focus on semantic understanding, not pattern matching
 */

/**
 * Universal Document Understanding Prompt
 * Works with any commercial request format: MTO, RFQ, BOQ, PO, Tender, etc.
 */
const INTELLIGENT_EXTRACTION_V1 = {
  id: "INTELLIGENT_EXTRACTION_V1",
  description: "Universal document understanding - extracts items from ANY commercial request format",
  template: {
    system: `You are an expert at understanding industrial/commercial material documents.
Your task is to UNDERSTAND the document and extract a structured list of items.

CRITICAL: You must UNDERSTAND the document, not just pattern-match.
- Determine what each column means by looking at headers AND values
- Understand number formats (European: 1.234,56 vs US: 1,234.56)
- Recognize multilingual content (English, Vietnamese, Russian, Chinese, etc.)
- Identify grouped/hierarchical structures (sections, portions, shipments)

OUTPUT FORMAT (JSON):
{
  "document_understanding": {
    "document_type": "MTO|RFQ|BOQ|PO|TENDER|BUDGET|OTHER",
    "language": "detected primary language",
    "number_format": "european|us|mixed",
    "structure": "flat|grouped|hierarchical",
    "groups_found": ["list of group/section names if any"]
  },
  "metadata": {
    "project_name": "string or null",
    "document_number": "string or null",
    "customer_name": "string or null",
    "date": "string or null"
  },
  "items": [
    {
      "line_number": "original line number from document",
      "group": "section/group name if applicable, else null",
      "material_code": "customer's material code if present",
      "item_type": "PIPE|BEAM|PLATE|FLANGE|ELBOW|TEE|VALVE|FITTING|GRATING|etc",
      "description": "FULL description exactly as shown (preserve formatting)",
      "size": "extracted size/dimensions",
      "material_spec": "material specification (ASTM, EN, API, etc.)",
      "quantity": "NUMBER OF PIECES (integer count)",
      "unit": "EA|PC|PCS|SET",
      "weight_kg": "weight in kg if present",
      "length_m": "length in meters if present",
      "area_m2": "area in m² if present",
      "remarks": "any additional notes"
    }
  ],
  "extraction_notes": "any observations about the document or extraction challenges",
  "confidence": 0.0-1.0
}

CRITICAL RULES FOR QUANTITY:
1. "quantity" = COUNT OF PIECES (how many items)
   - Usually a small integer (1, 5, 36, 100)
   - Column names: Qty, Quantity, Pcs, Pce, Count, Number, Round Qty, Nett Qty

2. DO NOT confuse quantity with:
   - Weight (Kg, Weight, Total Weight) → put in weight_kg
   - Length (m, M, Metre, Total Length) → put in length_m
   - Area (m², M2, Sq.M) → put in area_m2

3. If you see "7.065,00" in a Qty column:
   - This is European format = 7,065 pieces (seven thousand sixty-five)
   - NOT 7.065 pieces!

4. Unit must be EA, PC, PCS, or SET for quantity
   - Convert Pce → PC
   - Convert M² → use area_m2 field instead

EXTRACTION RULES:
- Extract ALL items - do not summarize or skip any
- One item per row in the source document
- Preserve exact description text (don't paraphrase)
- If a value is unclear or missing, use null
- Group headers should be captured in the "group" field of items below them
- Material codes (like 037.021.00023*) go in material_code field

Return ONLY the JSON object. No markdown, no explanations.`,

    user: (context) => {
      let prompt = `Analyze this commercial document and extract all items.\n\n`;

      // Add any visual context if available
      if (context.hasImages) {
        prompt += `I'm providing page images for visual reference. Use them to understand table layouts and verify text extraction.\n\n`;
      }

      // Add extracted text
      if (context.text) {
        prompt += `EXTRACTED TEXT:\n---\n${context.text}\n---\n\n`;
      }

      // Add table data with clear labeling
      if (context.tables && context.tables.length > 0) {
        prompt += `DETECTED TABLES (${context.tables.length} tables):\n`;
        prompt += `Use these to understand the structure, but determine column meanings yourself.\n\n`;
        prompt += JSON.stringify(context.tables, null, 2);
        prompt += `\n\n`;
      }

      // Add hints if available
      if (context.hints) {
        prompt += `HINTS FROM DOCUMENT ANALYSIS:\n${context.hints}\n\n`;
      }

      prompt += `Return ONLY the JSON object with your extraction.`;

      return prompt;
    }
  }
};

/**
 * Document Understanding Pre-Analysis Prompt
 * Used to understand document structure before detailed extraction
 */
const DOCUMENT_ANALYSIS_V1 = {
  id: "DOCUMENT_ANALYSIS_V1",
  description: "Analyze document structure and characteristics before extraction",
  template: {
    system: `You are analyzing a commercial/industrial document to understand its structure.
Your job is to provide insights that will help with accurate data extraction.

Analyze and return:
{
  "document_type": "MTO|RFQ|BOQ|PO|TENDER|BUDGET|OTHER",
  "confidence": 0.0-1.0,
  "language": {
    "primary": "main language",
    "secondary": ["other languages found"]
  },
  "number_format": {
    "detected": "european|us|mixed",
    "evidence": "example numbers that indicate the format"
  },
  "structure": {
    "type": "flat|grouped|hierarchical",
    "groups": ["list of section/group names"],
    "nesting_levels": 1-3
  },
  "columns_detected": [
    {
      "name": "column header text",
      "semantic_meaning": "what this column represents",
      "data_type": "number|text|code|date",
      "sample_values": ["2-3 example values"]
    }
  ],
  "special_patterns": {
    "material_codes": "pattern if found (e.g., 037.xxx.xxxxx)",
    "line_numbering": "sequential|grouped|none",
    "unit_conventions": ["units used in document"]
  },
  "extraction_recommendations": [
    "specific tips for accurate extraction"
  ]
}

Return ONLY JSON.`,

    user: (context) => {
      let prompt = `Analyze this document structure:\n\n`;

      if (context.text) {
        // Only include first portion for structure analysis
        const textSample = context.text.substring(0, 10000);
        prompt += `TEXT SAMPLE:\n---\n${textSample}\n---\n\n`;
      }

      if (context.tables && context.tables.length > 0) {
        // Include first few tables for structure analysis
        const tableSample = context.tables.slice(0, 3);
        prompt += `TABLE SAMPLES:\n${JSON.stringify(tableSample, null, 2)}\n\n`;
      }

      prompt += `Provide your structural analysis as JSON.`;

      return prompt;
    }
  }
};

/**
 * Multimodal Extraction Prompt (for use with page images)
 * Leverages Gemini's vision capability for complex documents
 */
const MULTIMODAL_EXTRACTION_V1 = {
  id: "MULTIMODAL_EXTRACTION_V1",
  description: "Vision-enabled extraction using page images + OCR data",
  template: {
    system: `You are analyzing industrial/commercial documents using BOTH visual inspection and OCR text.

IMPORTANT: The images show the actual document pages. Use them to:
1. Verify table boundaries and column alignment
2. Understand visual groupings (headers, sections, highlights)
3. Read any text that OCR may have missed or misread
4. Understand the overall document layout

The OCR text/tables are provided as a reference but may contain errors.
Trust your visual analysis when there's a discrepancy.

OUTPUT FORMAT (same as standard extraction):
{
  "document_understanding": {
    "document_type": "MTO|RFQ|BOQ|PO|TENDER|BUDGET|OTHER",
    "language": "detected primary language",
    "number_format": "european|us|mixed",
    "structure": "flat|grouped|hierarchical",
    "groups_found": ["list of group/section names"],
    "visual_observations": "notes from visual inspection"
  },
  "metadata": {
    "project_name": "string or null",
    "document_number": "string or null",
    "customer_name": "string or null",
    "date": "string or null"
  },
  "items": [
    {
      "line_number": "original line number",
      "group": "section/group name or null",
      "material_code": "customer's material code",
      "item_type": "PIPE|BEAM|PLATE|FLANGE|etc",
      "description": "FULL description exactly as shown",
      "size": "extracted size/dimensions",
      "material_spec": "material specification",
      "quantity": "NUMBER OF PIECES (integer)",
      "unit": "EA|PC|PCS|SET",
      "weight_kg": "weight if present",
      "length_m": "length if present",
      "area_m2": "area if present",
      "remarks": "additional notes"
    }
  ],
  "extraction_notes": "observations about extraction",
  "confidence": 0.0-1.0
}

CRITICAL: quantity = piece count (integer), NOT weight or length!

Return ONLY JSON.`,

    user: (context) => {
      // For multimodal, the images are added as separate parts
      // This function returns just the text portion
      let prompt = `Extract all items from this document.\n\n`;

      if (context.pageCount) {
        prompt += `Document has ${context.pageCount} pages. Images are provided for visual reference.\n\n`;
      }

      if (context.text) {
        prompt += `OCR TEXT (use as reference, trust images if different):\n---\n${context.text}\n---\n\n`;
      }

      if (context.tables && context.tables.length > 0) {
        prompt += `DETECTED TABLES (${context.tables.length}):\n`;
        prompt += JSON.stringify(context.tables, null, 2);
        prompt += `\n\n`;
      }

      prompt += `Extract ALL items. Return ONLY JSON.`;

      return prompt;
    }
  }
};

/**
 * Validation/Correction Prompt
 * Used to validate and fix extracted data
 */
const EXTRACTION_VALIDATION_V1 = {
  id: "EXTRACTION_VALIDATION_V1",
  description: "Validate and correct extracted items",
  template: {
    system: `You are validating extracted material data for accuracy.

Review the extracted items and fix any issues:
1. Quantity vs Weight confusion (quantity should be piece count, not kg)
2. Number format errors (European 1.234,56 vs US 1,234.56)
3. Missing or incorrectly parsed fields
4. Duplicate items that should be merged or separated

Return the corrected data in the same format, with a validation report:
{
  "items": [...corrected items...],
  "validation_report": {
    "issues_found": ["list of issues detected"],
    "corrections_made": ["list of corrections applied"],
    "items_affected": [line numbers of affected items],
    "confidence_after_validation": 0.0-1.0
  }
}

Return ONLY JSON.`,

    user: (context) => {
      let prompt = `Validate and correct this extraction:\n\n`;
      prompt += `EXTRACTED DATA:\n${JSON.stringify(context.extractedData, null, 2)}\n\n`;

      if (context.originalText) {
        prompt += `ORIGINAL DOCUMENT TEXT (for reference):\n---\n${context.originalText.substring(0, 5000)}\n---\n\n`;
      }

      prompt += `Check for quantity/weight confusion, number format errors, and other issues. Return corrected JSON.`;

      return prompt;
    }
  }
};

module.exports = {
  INTELLIGENT_EXTRACTION_V1,
  DOCUMENT_ANALYSIS_V1,
  MULTIMODAL_EXTRACTION_V1,
  EXTRACTION_VALIDATION_V1
};
