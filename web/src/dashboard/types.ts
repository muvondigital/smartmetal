/**
 * SmartMetal Dashboard Framework - Type Definitions
 *
 * Defines the structure for tenant-configurable dashboard layouts.
 *
 * Widget IDs map to specific dashboard components (KPIs, charts, tables).
 * Layout config defines which widgets appear in which rows and spans.
 */

export type DashboardWidgetId =
  | "ai_today"
  | "kpi_total_rfq"
  | "kpi_pending_approval"
  | "kpi_approved_quotes"
  | "kpi_quote_revenue"
  | "price_changes"
  | "quote_revenue_trend"
  | "table_submitted_for_approval"
  | "table_ready_next_steps"
  | "table_recent_quotes";

export interface DashboardWidgetConfig {
  id: DashboardWidgetId;
  span: number; // number of grid columns this widget occupies
}

export type RowHeight = "auto" | "chart" | "tables";

export interface DashboardRowConfig {
  id: string;
  height: RowHeight;
  widgets: DashboardWidgetConfig[];
}

export interface DashboardLayoutConfig {
  rows: DashboardRowConfig[];
}

/**
 * Default Vendavo-style dashboard layout
 */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutConfig = {
  rows: [
    {
      id: "kpi-row",
      height: "auto",
      widgets: [
        { id: "kpi_total_rfq", span: 1 },
        { id: "kpi_pending_approval", span: 1 },
        { id: "kpi_approved_quotes", span: 1 },
        { id: "kpi_quote_revenue", span: 1 },
      ],
    },
    {
      id: "chart-row",
      height: "chart",
      widgets: [
        { id: "quote_revenue_trend", span: 1 },
      ],
    },
  ],
};
