/**
 * Flange Type Definition
 */

export interface Flange {
  id?: string;
  nps_inch: number;
  flange_type: string;
  pressure_rating: number | string;
  standard: string;
  material_spec: string | null;
  face_type?: string;
  sku?: string;
  created_at?: Date;
  updated_at?: Date;
}
