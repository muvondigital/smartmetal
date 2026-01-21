/**
 * Pipe Type Definition
 *
 * Represents a pipe record from the pipes catalogue table.
 * Used for type safety in TypeScript services and utilities.
 */

export interface Pipe {
  id: string;

  // Standards and specifications
  standard: string;
  material_spec: string | null;
  manufacturing_method: string | null;

  // Size specifications
  nps_inch: number;
  dn_mm: number | null;

  // Diameter measurements
  outside_diameter_in: number | null;
  outside_diameter_mm: number | null;

  // Schedule and wall thickness
  schedule: string | null;
  wall_thickness_in: number | null;
  wall_thickness_mm: number | null;

  // Weight specifications
  weight_lb_per_ft: number | null;
  weight_kg_per_m: number | null;
  shipping_weight_m3: number | null;

  // Additional attributes
  end_type: string | null;
  is_stainless: boolean;
  is_preferred: boolean;

  notes: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Pipe creation payload (subset of Pipe without auto-generated fields)
 */
export interface CreatePipePayload {
  standard: string;
  material_spec?: string | null;
  manufacturing_method?: string | null;

  nps_inch: number;
  dn_mm?: number | null;

  outside_diameter_in?: number | null;
  outside_diameter_mm?: number | null;

  schedule?: string | null;
  wall_thickness_in?: number | null;
  wall_thickness_mm?: number | null;

  weight_lb_per_ft?: number | null;
  weight_kg_per_m?: number | null;
  shipping_weight_m3?: number | null;

  end_type?: string | null;
  is_stainless?: boolean;
  is_preferred?: boolean;

  notes?: string | null;
}

/**
 * Pipe update payload (all fields optional except where business logic requires)
 */
export interface UpdatePipePayload extends Partial<CreatePipePayload> {}
