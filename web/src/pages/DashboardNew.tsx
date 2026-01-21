/**
 * SmartMetal Dashboard (Phase 7 - Widget Framework)
 *
 * Main dashboard page with tenant-configurable widget layout.
 * Features:
 * - No vertical scroll at page level (only internal widget scrolling)
 * - Config-driven widget rendering from tenant settings
 * - Modular, reusable widget components
 * - Preserves existing Vendavo-style design
 *
 * LAYOUT STRUCTURE:
 * - Root container: fills viewport height minus navbar
 * - Rows: defined by dashboard config (auto, chart, tables heights)
 * - Widgets: dynamically rendered from widgetRegistry
 * - Tables: use internal ScrollArea for overflow
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { DashboardLayoutConfig, DashboardRowConfig, DEFAULT_DASHBOARD_LAYOUT } from '../dashboard/types';
import { widgetRegistry } from '../dashboard/widgetRegistry';
import { getPendingApprovals } from '../services/approvalsApi';

export default function Dashboard() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<DashboardLayoutConfig>(DEFAULT_DASHBOARD_LAYOUT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  useEffect(() => {
    loadDashboardConfig();
    loadPendingApprovals();
  }, []);

  const loadDashboardConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      // TODO: Fetch from /api/dashboard/config when backend is ready
      // For now, use default layout
      setConfig(DEFAULT_DASHBOARD_LAYOUT);
    } catch (err) {
      console.error('Failed to load dashboard config:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard configuration');
      // Fall back to default on error
      setConfig(DEFAULT_DASHBOARD_LAYOUT);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingApprovals = async () => {
    try {
      const data = await getPendingApprovals();
      setPendingApprovalsCount(data.length || 0);
    } catch (err) {
      console.error('Failed to load pending approvals:', err);
    }
  };

  const getRowClassName = (height: string, widgetCount: number): string => {
    const baseClasses = 'grid gap-4 overflow-hidden';

    // Column layout based on widget count
    let colsClass = 'grid-cols-1';
    if (widgetCount === 2) colsClass = 'grid-cols-2';
    if (widgetCount === 3) colsClass = 'grid-cols-3';
    if (widgetCount === 4) colsClass = 'grid-cols-4';

    return `${baseClasses} ${colsClass}`;
  };

  const getRowHeightClass = (height: string): string => {
    if (height === 'auto') return 'h-auto';
    if (height === 'chart') return 'h-[320px]';
    if (height === 'tables') return 'flex-1 min-h-0';
    return 'h-auto';
  };

  const renderWidget = (widgetId: string) => {
    const WidgetComponent = widgetRegistry[widgetId as keyof typeof widgetRegistry];

    if (!WidgetComponent) {
      return (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <p className="text-sm text-rose-700">Widget not found: {widgetId}</p>
        </div>
      );
    }

    return <WidgetComponent key={widgetId} />;
  };

  const renderRow = (row: DashboardRowConfig) => {
    const rowClassName = getRowClassName(row.height, row.widgets.length);
    const rowHeightClass = getRowHeightClass(row.height);

    return (
      <div key={row.id} className={`${rowClassName} ${rowHeightClass}`}>
        {row.widgets.map((widget) => renderWidget(widget.id))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="text-slate-600">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 max-w-md">
          <h3 className="text-rose-900 font-semibold mb-2">Error Loading Dashboard</h3>
          <p className="text-rose-700 text-sm mb-4">{error}</p>
          <button
            onClick={loadDashboardConfig}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden">
      {/* Page Header */}
      <div className="flex-none px-6 pt-6 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-1">Overview of your pricing activity and pending tasks</p>
      </div>

      {/* Pending Approvals Alert */}
      {pendingApprovalsCount > 0 && (
        <div className="flex-none px-6 pb-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-amber-900 font-semibold">
                  {pendingApprovalsCount} Pricing Run{pendingApprovalsCount !== 1 ? 's' : ''} Pending Approval
                </p>
                <p className="text-amber-700 text-sm">Review and approve pricing runs in the approval queue</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => navigate('/approvals')}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              View Approval Queue
            </Button>
          </div>
        </div>
      )}

      {/* Dashboard Grid - Config-Driven */}
      <div className="flex-1 px-6 pb-6 overflow-hidden">
        <div className="flex flex-col gap-4 h-full">
          {config.rows.map((row) => renderRow(row))}
        </div>
      </div>
    </div>
  );
}
