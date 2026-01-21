/**
 * Tariff Type Definitions
 *
 * Types for tariff keyword groups and HS code mapping
 * Used for Malaysian PDK 2025 customs classification
 */

export interface TariffKeywordGroup {
  id?: string;
  keyword: string;
  schedule_code: string;
  country: string;
  hs_chapters: string[];
  example_hs_codes: string[];
  source: string;
  notes?: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface TariffKeywordSeed {
  keyword: string;
  schedule_code: string;
  country: string;
  hs_chapters: string[];
  example_hs_codes: string[];
  source: string;
  notes?: string;
  is_active: boolean;
}
