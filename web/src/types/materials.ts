/**
 * Material Types
 *
 * Type definitions for materials catalog and SKU system.
 */

export interface Material {
  id: string;
  material_code: string;
  category: string;
  spec_standard?: string | null;
  grade?: string | null;
  material_type?: string | null;
  origin_type?: string | null;
  size_description?: string | null;
  base_cost?: number | null;
  currency?: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MaterialFilters {
  search: string;
  category: string;
  materialType: string;
  standard: string;
  origin: string;
}

export type CategoryType = 'FLANGES' | 'PIPES' | 'FITTINGS' | 'FASTENERS' | 'GRATING' | string;
export type OriginType = 'CHINA' | 'NON_CHINA' | string;
