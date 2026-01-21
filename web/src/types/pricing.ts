/**
 * Pricing Types
 * 
 * Extended type definitions for pricing runs with duty support
 */

export interface PricingRunItem {
  id: string;
  pricing_run_id: string;
  rfq_item_id: string;
  material_id: string | null;
  material_code: string | null;
  description: string;
  quantity: number;
  unit: string;
  base_cost: number;
  markup_pct: number;
  logistics_cost: number;
  risk_pct: number;
  unit_price: number;
  total_price: number;
  currency: string;
  origin_type: string | null;
  pricing_method: string | null;
  price_agreement_id: string | null;
  agreement_reference?: string;
  created_at: string;
  // HS Code duty fields (Phase 4)
  import_duty_amount?: number | null;
  hs_code?: string | null;
  // Final duty fields (Phase 5)
  final_import_duty_amount?: number | null;
  origin_country?: string | null;
  // Phase 9: Landed Cost Engine V2 - Logistics cost breakdown
  freight_cost?: number | null;
  insurance_cost?: number | null;
  handling_cost?: number | null;
  local_charges?: number | null;
  item_landed_cost?: number | null;
}

export interface PricingSummary {
  total_price: number;
  currency: string;
  // Duty fields (Phase 4)
  total_import_duty?: number | null;
  freight_cost?: number | null;
  other_charges?: number | null;
  // Final duty fields (Phase 5)
  total_final_import_duty?: number | null;
  // Phase 9: Landed Cost Engine V2 - Logistics cost aggregates
  total_freight_cost?: number | null;
  total_insurance_cost?: number | null;
  total_handling_cost?: number | null;
  total_local_charges?: number | null;
  total_landed_cost?: number | null;
  // Computed (deprecated - use total_landed_cost)
  landed_cost_total?: number | null;
}

