/**
 * SmartMetal Dashboard Widget Registry
 *
 * Maps widget IDs to their React component implementations.
 * This registry enables dynamic dashboard composition based on tenant configuration.
 */

import { DashboardWidgetId } from './types';

// Import all widget components
import { AiTodayWidget } from './widgets/AiTodayWidget';
import { KpiTotalQuotesWidget } from './widgets/KpiTotalQuotesWidget';
import { KpiPendingApprovalWidget } from './widgets/KpiPendingApprovalWidget';
import { KpiApprovedQuotesWidget } from './widgets/KpiApprovedQuotesWidget';
import { KpiQuoteRevenueWidget } from './widgets/KpiQuoteRevenueWidget';
import { PriceChangesWidget } from './widgets/PriceChangesWidget';
import { QuoteRevenueTrendWidget } from './widgets/QuoteRevenueTrendWidget';
import { SubmittedForApprovalTableWidget } from './widgets/SubmittedForApprovalTableWidget';
import { ReadyForNextStepsTableWidget } from './widgets/ReadyForNextStepsTableWidget';
import { RecentQuotesTableWidget } from './widgets/RecentQuotesTableWidget';

/**
 * Widget Registry
 *
 * Maps each DashboardWidgetId to its corresponding React component.
 * Used by the dashboard renderer to dynamically instantiate widgets.
 */
export const widgetRegistry: Record<DashboardWidgetId, React.ComponentType> = {
  ai_today: AiTodayWidget,
  kpi_total_rfq: KpiTotalQuotesWidget,
  kpi_pending_approval: KpiPendingApprovalWidget,
  kpi_approved_quotes: KpiApprovedQuotesWidget,
  kpi_quote_revenue: KpiQuoteRevenueWidget,
  price_changes: PriceChangesWidget,
  quote_revenue_trend: QuoteRevenueTrendWidget,
  table_submitted_for_approval: SubmittedForApprovalTableWidget,
  table_ready_next_steps: ReadyForNextStepsTableWidget,
  table_recent_quotes: RecentQuotesTableWidget,
};

/**
 * Get widget component by ID
 *
 * @param widgetId - The widget ID to look up
 * @returns The widget component, or null if not found
 */
export function getWidgetComponent(widgetId: DashboardWidgetId): React.ComponentType | null {
  return widgetRegistry[widgetId] || null;
}
