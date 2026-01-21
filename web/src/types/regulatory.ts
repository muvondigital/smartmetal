/**
 * Regulatory Types
 * 
 * Type definitions for HS codes and regulatory data
 */

export type HsMatchSource = 'RULE' | 'MAPPING' | 'DIRECT_HS' | 'MANUAL' | 'NONE' | null;

export interface HsCodeSearchResult {
  hs_code: string;
  category: string;
  description: string;
  import_duty: number;
  sub_category?: string | null;
  id?: string;
}

export interface HsCodeMappingResult {
  hsCode: string | null;
  matchSource: HsMatchSource;
  confidence: number | null;
  importDutyRate?: number | null;
}

