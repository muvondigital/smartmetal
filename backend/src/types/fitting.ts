/**
 * Fitting Type Definition
 */

export interface Fitting {
  id?: string;
  fitting_type: string;
  angle?: string | null;
  configuration?: string | null;
  nps_inch: number;
  nps_inch_2?: number | null;
  schedule?: string | null;
  standard: string;
  material_spec: string | null;
  sku?: string;
  created_at?: Date;
  updated_at?: Date;
}
