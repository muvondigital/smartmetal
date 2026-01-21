export interface Rfq {
  id: string
  rfq_code?: string | null
  title?: string
  description?: string
  status: string
  created_at: string
  updated_at?: string
  project_id?: string | number
  project_name?: string
  client_id?: string | number
  client_name?: string
  customer_name?: string // Alias for client_name
  original_filename?: string | null
  project_type?: 'standard' | 'rush' | 'ltpa' | 'spot' | null
  document_type?: 'RFQ' | 'PO' | 'MTO' | 'BOQ' | 'Budget' | 'Tender' | 'Change Order' | 'Re-quote' | null
}

export interface RfqItem {
  id: number | string
  rfq_id: number | string
  part_number?: string
  quantity: number
  description?: string
  unit?: string
  material_code?: string | null
  line_number?: number
  size_display?: string | null
  size1_raw?: string | null
  size2_raw?: string | null
  // HS Code fields (Phase 4)
  hs_code?: string | null
  import_duty_rate?: number | null
  import_duty_amount?: number | null
  hs_match_source?: 'RULE' | 'MAPPING' | 'DIRECT_HS' | 'MANUAL' | 'NONE' | null
  hs_confidence?: number | null
  // Origin and final duty fields (Phase 5)
  origin_country?: string | null
  trade_agreement?: string | null
  final_import_duty_rate?: number | null
  final_import_duty_amount?: number | null
  // Audit flags (extraction)
  needs_review?: boolean
  quantity_source?: 'explicit' | 'inferred_price_line' | 'default_1' | null
  confidence?: 'low' | 'medium' | 'high' | null
  // Supplier selection
  supplier_options?: any
  supplier_selected_option?: 'A' | 'B' | 'C' | null
  supplier_selected_at?: string | null
}

export interface PriceRun {
  id: number
  rfq_id: number
  status: string
  created_at: string
}

export interface Agreement {
  id: number
  rfq_id: number
  content: string
  created_at: string
}

// OCR types
export interface StructuredOcr {
  rawPages: number
  text: string
  tables: {
    rowCount: number
    columnCount: number
    rows: string[][]
  }[]
}

export interface OcrExtractResponse {
  provider: string
  structured: StructuredOcr
  azureRaw?: any
}

// AI parsing types
export interface RfqMetadata {
  client_name: string | null
  rfq_reference: string | null
  rfq_date: string | null
  payment_terms: string | null
  delivery_terms: string | null
  remarks: string | null
}

export interface MatchedMaterial {
  material_id: string | null
  material_code: string | null
  score: number
  reason: string | null
}

export interface FieldConfidence {
  line_number: number
  description: number
  quantity: number
  unit: number
  spec: number
  size1: number
  size2: number
  notes: number
  revision: number
}

export interface ItemConfidence {
  overall: number
  fields: FieldConfidence
  warnings: string[]
}

export interface LineItem {
  line_number: string | null
  description: string
  quantity: number | null
  unit: string | null
  size: string | null // Display size (computed from size1/size2 or size_display)
  size1?: string | null // Primary size (e.g., "6\"")
  size2?: string | null // Secondary size (e.g., "2\"")
  size_display?: string | null // Combined size display from DB (e.g., "6\" × 2\"")
  schedule: string | null
  standard: string | null
  grade: string | null
  raw_row: string[] | null
  matched_materials: MatchedMaterial[]
  confidence?: ItemConfidence | null // Confidence scoring for this item
}

export interface ExtractionConfidence {
  extraction: number // Overall extraction confidence (0.0 - 1.0)
  table_detection: number | null // Table detection confidence
  validation_warnings: string[] // Array of validation warning messages
  item_count: number // Total number of items extracted
  warnings_count: number // Total number of warnings
}

export interface AiParseResponse {
  rfq_metadata: RfqMetadata
  line_items: LineItem[]
  created: {
    rfq_id: string | null
    rfq_item_count: number
  }
  confidence?: ExtractionConfidence // Confidence scoring for the extraction
  debug: {
    azure_openai_model: string | null
    prompt_tokens: number | null
    completion_tokens: number | null
  }
}

// Line Item View Model (for UI grid/table)
export interface LineItemView extends LineItem {
  id: string | number
  index: number
  matchStatus: 'matched' | 'partial' | 'unmatched'
  category?: string
}

