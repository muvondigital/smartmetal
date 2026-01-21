/**
 * Extraction Preview Types
 *
 * Types for the industry-grade AI extraction preview system.
 * Supports document metadata, section grouping, column mapping,
 * confidence indicators, and validation states.
 */

// Document types supported by SmartMetal
export type DocumentType = 'RFQ' | 'PO' | 'MTO' | 'BOQ' | 'Budget' | 'Tender' | 'Change Order' | 'Re-quote';

// Confidence levels for extraction
export type ConfidenceLevel = 'high' | 'medium' | 'low';

// Validation status for extracted items
export type ValidationStatus = 'valid' | 'warning' | 'error';

// Field mapping options for columns
export type FieldMappingType =
  | 'item_no'
  | 'description'
  | 'quantity'
  | 'unit'
  | 'size'
  | 'size1'
  | 'size2'
  | 'material'
  | 'grade'
  | 'schedule'
  | 'standard'
  | 'notes'
  | 'unit_price'
  | 'total_price'
  | 'unmapped';

// Document metadata detected from extraction
export interface ExtractedDocumentInfo {
  customer?: string | null;
  customerConfidence?: ConfidenceLevel;
  project?: string | null;
  projectConfidence?: ConfidenceLevel;
  documentType: DocumentType;
  documentTypeConfidence?: ConfidenceLevel;
  referenceNumber?: string | null;
  referenceConfidence?: ConfidenceLevel;
  documentDate?: string | null;
  pagesProcessed: number;
  totalPages: number;
  originalFilename?: string;
}

// Section/category grouping for MTO documents
export interface ExtractionSection {
  id: string;
  name: string;
  itemCount: number;
  pageRange?: string;
  icon?: string;
}

// Column definition with mapping and confidence
export interface ExtractionColumn {
  id: string;
  originalHeader: string;
  mappedField: FieldMappingType;
  confidence: number; // 0-100
  confidenceLevel: ConfidenceLevel;
  isEditable?: boolean;
  width?: string;
}

// Individual field validation
export interface FieldValidation {
  isValid: boolean;
  status: ValidationStatus;
  message?: string;
  suggestedValue?: string;
}

// Extracted item row
export interface ExtractedItem {
  id: string;
  rowNumber: number;
  sectionId?: string;
  selected: boolean;
  validationStatus: ValidationStatus;
  fields: Record<string, ExtractedFieldValue>;
  rawRow?: string[];
  confidence?: number;
}

// Individual field value with validation
export interface ExtractedFieldValue {
  value: string | number | null;
  displayValue: string;
  isEdited?: boolean;
  validation?: FieldValidation;
  confidence?: number;
}

// Extraction summary statistics
export interface ExtractionStats {
  totalItems: number;
  totalSections: number;
  tablesFound: number;
  overallConfidence: number;
  validItems: number;
  warningItems: number;
  errorItems: number;
}

// Complete extraction preview state
export interface ExtractionPreviewState {
  // Document info
  documentInfo: ExtractedDocumentInfo;

  // Sections/categories
  sections: ExtractionSection[];
  activeSection: string | null;

  // Column mappings
  columns: ExtractionColumn[];

  // Extracted items
  items: ExtractedItem[];

  // Stats
  stats: ExtractionStats;

  // UI state
  loading: boolean;
  error: string | null;
  selectedItems: Set<string>;
  searchQuery: string;
  filterStatus: ValidationStatus | 'all';
}

// Column mapping change event
export interface ColumnMappingChange {
  columnId: string;
  newMapping: FieldMappingType;
}

// Item edit event
export interface ItemEditChange {
  itemId: string;
  fieldKey: string;
  newValue: string | number;
}

// Action bar actions
export interface ExtractionActions {
  onSaveDraft: () => void;
  onApplyMapping: () => void;
  onContinue: () => void;
  onReExtract: () => void;
  onDownloadCsv: () => void;
}

// Field mapping label and description
export interface FieldMappingOption {
  value: FieldMappingType;
  label: string;
  description: string;
  icon?: string;
}

// Available field mapping options
export const FIELD_MAPPING_OPTIONS: FieldMappingOption[] = [
  { value: 'item_no', label: 'Item No.', description: 'Line item number or code' },
  { value: 'description', label: 'Description', description: 'Item description text' },
  { value: 'quantity', label: 'Quantity', description: 'Numeric quantity value' },
  { value: 'unit', label: 'Unit', description: 'Unit of measure (PCS, MTR, etc.)' },
  { value: 'size', label: 'Size', description: 'Combined size value' },
  { value: 'size1', label: 'Size 1', description: 'Primary size dimension' },
  { value: 'size2', label: 'Size 2', description: 'Secondary size dimension' },
  { value: 'material', label: 'Material', description: 'Material grade or type' },
  { value: 'grade', label: 'Grade', description: 'Material grade specification' },
  { value: 'schedule', label: 'Schedule', description: 'Pipe schedule (SCH 40, etc.)' },
  { value: 'standard', label: 'Standard', description: 'Industry standard (ASTM, etc.)' },
  { value: 'notes', label: 'Notes', description: 'Additional notes or remarks' },
  { value: 'unit_price', label: 'Unit Price', description: 'Price per unit' },
  { value: 'total_price', label: 'Total Price', description: 'Line total price' },
  { value: 'unmapped', label: 'Unmapped', description: 'Ignore this column' },
];

// Helper to get confidence level from numeric value
export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 90) return 'high';
  if (confidence >= 70) return 'medium';
  return 'low';
}

// Helper to get validation status color class
export function getValidationStatusClass(status: ValidationStatus): string {
  switch (status) {
    case 'valid': return 'bg-green-50 text-green-700 border-green-200';
    case 'warning': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'error': return 'bg-red-50 text-red-700 border-red-200';
    default: return '';
  }
}

// Helper to get confidence color class
export function getConfidenceColorClass(level: ConfidenceLevel): string {
  switch (level) {
    case 'high': return 'text-green-600';
    case 'medium': return 'text-amber-600';
    case 'low': return 'text-red-600';
    default: return 'text-slate-600';
  }
}
