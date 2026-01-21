/**
 * Material Matching Types
 * 
 * Shared types for the material matching UX components.
 */

export type MaterialMatchSummary = {
  rfqLineId: string;
  lineNumber: number;
  shortCategory: string; // e.g. "FLANGE", "PIPE"
  description: string; // RFQ line description
  selectedMaterialCode?: string;
  selectedMaterialName?: string;
  confidencePct?: number | null;
  confidenceLabel?: string; // e.g. "Very Low", "Medium", "High"
  hasCandidates: boolean;
  isAutoSelected: boolean;
};

export type MaterialCandidate = {
  id: string;
  materialCode: string;
  materialName: string;
  category: string;
  specStandard?: string;
  grade?: string;
  originType?: string;
  sizeDescription?: string;
  confidencePct: number;
  confidenceLabel: string;
  rationale?: string; // e.g. "Fallback match: flange (category + size match)"
};

export type MaterialMatchStatusFilter = 
  | 'all' 
  | 'no_match' 
  | 'low_confidence' 
  | 'auto_selected' 
  | 'manual';

