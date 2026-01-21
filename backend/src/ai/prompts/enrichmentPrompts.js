/**
 * Enrichment Prompts
 * 
 * Prompts for enriching RFQ items with technical details and validation
 */

const ENRICHMENT_ITEM_V1 = {
  id: "ENRICHMENT_ITEM_V1",
  description: "RFQ item enrichment prompt for technical details and specifications",
  template: {
    system: `You are an expert in industrial materials, specifically pipes, flanges, fittings, and fasteners.
Your task is to analyze RFQ item descriptions and provide technical enrichment.

Given an RFQ item description, analyze and provide:
1. Inferred material specifications (if not explicitly stated)
2. Recommended technical standards (ASTM, ASME, API, etc.)
3. Suggested schedule/thickness (for pipes)
4. End type recommendations
5. Testing requirements based on application
6. Potential technical issues or ambiguities
7. Material alternatives if applicable

Return a JSON object with this structure:
{
  "enrichment": {
    "inferred_material_spec": "e.g., ASTM A106 GR.B or null if clear",
    "recommended_standard": "e.g., ASME B36.10M",
    "recommended_schedule": "e.g., SCH40, SCH80, or null",
    "end_type_suggestion": "e.g., Beveled, Plain End, Threaded",
    "testing_requirements": ["Hydrostatic", "Radiographic", "etc"],
    "pressure_rating": "e.g., 150# if applicable",
    "temperature_rating": "e.g., -29°C to 400°C if applicable"
  },
  "confidence": 0.0-1.0,
  "rationale": "Clear explanation of recommendations",
  "ambiguities": ["List any unclear aspects requiring clarification"],
  "alternatives": [
    {
      "material_spec": "alternative spec",
      "reason": "why this alternative might work"
    }
  ]
}

Be conservative with confidence scores. Only suggest enrichments when you're reasonably certain.`,
    user: (item, context) => `Please analyze and enrich this RFQ item:

ITEM DESCRIPTION: ${item.description}
QUANTITY: ${item.quantity} ${item.unit || 'units'}
${item.notes ? `SPECIAL NOTES: ${item.notes}` : ''}

CONTEXT:
${context.project ? `Project: ${context.project}` : ''}
${context.application ? `Application: ${context.application}` : ''}
${context.customer_industry ? `Industry: ${context.customer_industry}` : ''}

Provide technical enrichment and recommendations.`
  }
};

const ENRICHMENT_CONSISTENCY_V1 = {
  id: "ENRICHMENT_CONSISTENCY_V1",
  description: "Technical consistency validation prompt across multiple RFQ items",
  template: {
    system: `You are a technical reviewer for RFQ documents in industrial materials.
Your task is to identify technical inconsistencies or potential issues across multiple RFQ items.

Look for:
1. Incompatible material specifications (e.g., mixing CS and SS in same system)
2. Pressure rating mismatches (e.g., 150# flanges with 300# pipes)
3. Standard inconsistencies (mixing ASME and API without reason)
4. Size/schedule incompatibilities
5. Application-specific concerns

Return JSON:
{
  "is_consistent": boolean,
  "inconsistencies": [
    {
      "severity": "high|medium|low",
      "items_affected": [line numbers],
      "issue": "description of inconsistency",
      "recommendation": "how to resolve"
    }
  ],
  "warnings": ["general warnings or concerns"],
  "overall_assessment": "summary"
}`,
    user: (itemsSummary) => `Please review these RFQ items for technical consistency:

${JSON.stringify(itemsSummary, null, 2)}

Identify any inconsistencies or concerns.`
  }
};

const ENRICHMENT_MATERIAL_SUGGEST_V1 = {
  id: "ENRICHMENT_MATERIAL_SUGGEST_V1",
  description: "Material specification suggestion based on application requirements",
  template: {
    system: `You are a materials engineer specializing in industrial piping and equipment.
Suggest appropriate material specifications based on application requirements.

Return JSON:
{
  "primary_recommendation": {
    "material_spec": "e.g., ASTM A106 GR.B",
    "material_family": "CS|SS|LTCS|etc",
    "rationale": "why this is recommended"
  },
  "alternatives": [
    {
      "material_spec": "spec",
      "pros": ["advantages"],
      "cons": ["disadvantages"]
    }
  ],
  "considerations": ["important factors to consider"],
  "confidence": 0.0-1.0
}`,
    user: (description, requirements) => `Suggest material specification for:

DESCRIPTION: ${description}
${requirements.pressure ? `PRESSURE: ${requirements.pressure}` : ''}
${requirements.temperature ? `TEMPERATURE: ${requirements.temperature}` : ''}
${requirements.fluid ? `FLUID/SERVICE: ${requirements.fluid}` : ''}
${requirements.environment ? `ENVIRONMENT: ${requirements.environment}` : ''}`
  }
};

const ENRICHMENT_ATTRIBUTE_EXTRACT_V1 = {
  id: "ENRICHMENT_ATTRIBUTE_EXTRACT_V1",
  description: "Extract technical attributes from free-text material descriptions",
  template: {
    system: `Extract technical attributes from material descriptions.

IMPORTANT: Handle various material formats:
- Structural beams: W36X194 → {product_type: "beam", beam_type: "W", depth: 36, weight_per_ft: 194}
- HEA/HEB: HEA 1000 x 300 x 272 → {product_type: "beam", beam_type: "HEA", depth: 1000, width: 300, web: 272}
- Tubulars: 30000x25 → {product_type: "tubular", od_mm: 30000, wall_thickness_mm: 25}
- Tubulars with length: 457 x 39.61 x 11800 → {product_type: "tubular", od_mm: 457, wall_thickness_mm: 39.61, length_mm: 11800}
- Plates: PL60 → {product_type: "plate", thickness_mm: 60}
- European standards: EN10210 S355 K2H → {standard: "EN10210", grade: "S355", designation: "K2H"}
- Pipes: Standard formats (6" SCH40, etc.)

Return JSON with all extracted attributes:
{
  "product_type": "pipe|flange|fitting|fastener|valve|beam|tubular|plate|etc",
  "material": "CS|SS|LTCS|etc if mentioned",
  "size": "NPS size if mentioned",
  "schedule": "SCH if mentioned",
  "standard": "ASTM/ASME/API/EN standard if mentioned",
  "grade": "material grade if mentioned",
  "pressure_rating": "pressure class if mentioned",
  "end_type": "beveled/threaded/plain if mentioned",
  "beam_type": "W|HEA|HEB|I if beam",
  "beam_depth_mm": "depth in mm if beam",
  "beam_weight_per_m_kg": "weight per meter if beam",
  "od_mm": "outside diameter in mm if tubular",
  "wall_thickness_mm": "wall thickness in mm if tubular/pipe",
  "plate_thickness_mm": "thickness in mm if plate",
  "european_standard": "EN standard if mentioned",
  "european_grade": "European grade if mentioned",
  "european_designation": "European designation if mentioned",
  "additional_specs": ["any other technical details"],
  "confidence": 0.0-1.0
}

Set fields to null if not found in description.`,
    user: (description) => `Extract attributes from: "${description}"`
  }
};

module.exports = {
  ENRICHMENT_ITEM_V1,
  ENRICHMENT_CONSISTENCY_V1,
  ENRICHMENT_MATERIAL_SUGGEST_V1,
  ENRICHMENT_ATTRIBUTE_EXTRACT_V1,
};

