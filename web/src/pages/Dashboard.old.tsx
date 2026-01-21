/**
 * Dashboard Page Component
 * 
 * Main dashboard for SmartMetal CPQ application.
 * 
 * LAYOUT STRUCTURE:
 * ==================
 * 1. KPI Metrics Row (4 cards - responsive grid)
 * 2. Top Grid Row:
 *    - Left (2/3): Submitted for Approval table
 *    - Right (1/3): Quote Revenue chart
 * 3. Bottom Section:
 *    - Ready for Next Steps table (full width)
 *    - Recently Started table (full width)
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle, Clock, DollarSign, AlertCircle } from 'lucide-react';
import { KpiCard } from '../components/dashboard/KpiCard';
import { SubmittedApprovalTable } from '../components/dashboard/SubmittedApprovalTable';
import { NextStepsTable } from '../components/dashboard/NextStepsTable';
import { RecentTable } from '../components/dashboard/RecentTable';
import { RevenueChart, ChartDataPoint } from '../components/dashboard/RevenueChart';
import { PriceChangeNotifications } from '../components/dashboard/PriceChangeNotifications';
import { getRfqs } from '../api/client';
import { Quote } from '../components/dashboard/DataTable';
import { getPendingApprovals } from '../services/approvalsApi';
import { Button } from '../components/ui/button';

export default function Dashboard() {
  const navigate = useNavigate();
  const [rfqs, setRfqs] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  useEffect(() => {
    loadRfqs();
    loadPendingApprovals();
  }, []);

  const loadPendingApprovals = async () => {
    try {
      const data = await getPendingApprovals();
      setPendingApprovalsCount(data.length || 0);
    } catch (err) {
      console.error('Failed to load pending approvals:', err);
    }
  };

  const loadRfqs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRfqs();
      // Transform RFQ data to Quote format
      const transformedData: Quote[] = data.map((rfq: any) => ({
        id: rfq.id,
        name: rfq.title || rfq.customer_name || `RFQ #${rfq.id}`,
        revision: 'v1.0',
        customer: rfq.customer_name || 'N/A',
        customer_name: rfq.customer_name,
        total: rfq.total || 0,
        status: (rfq.status || 'draft').toLowerCase(),
        createdOn: rfq.created_at || new Date().toISOString(),
        created_at: rfq.created_at,
      }));
      setRfqs(transformedData);
    } catch (err) {
      console.error('Failed to load RFQs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics from real data
  const totalQuotes = rfqs.length;
  const pendingApproval = rfqs.filter(r => r.status === 'pending' || r.status === 'submitted').length;
  const approvedQuotes = rfqs.filter(r => r.status === 'approved').length;
  const quoteRevenue = rfqs.reduce((sum, r) => sum + (r.total || 0), 0);

  // Filter data for tables
  const submittedForApproval = rfqs
    .filter(r => r.status === 'pending' || r.status === 'submitted')
    .slice(0, 5);

  const readyForNextSteps = rfqs
    .filter(r => r.status === 'approved')
    .map(r => ({
      ...r,
      approvedOn: r.createdOn, // TODO: Use actual approved date when available
      nextAction: 'Review',
    }))
    .slice(0, 5);

  const recentlyStarted = rfqs
    .filter(r => r.status === 'draft')
    .sort((a, b) => {
      const dateA = a.createdOn ? new Date(a.createdOn).getTime() : 0;
      const dateB = b.createdOn ? new Date(b.createdOn).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 5);

  // Generate revenue chart data (mock for now - TODO: replace with real revenue API)
  const revenueData: ChartDataPoint[] = [
    { month: 'May', revenue: 3200000 },
    { month: 'Jun', revenue: 3600000 },
    { month: 'Jul', revenue: 3400000 },
    { month: 'Aug', revenue: 3900000 },
    { month: 'Sep', revenue: 4100000 },
    { month: 'Oct', revenue: 3800000 },
    { month: 'Nov', revenue: quoteRevenue || 4250000 },
  ];

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="text-center py-8 text-slate-600">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 max-w-md mx-auto">
          <h3 className="text-rose-900 font-semibold mb-2">Error Loading Dashboard</h3>
          <p className="text-rose-700 text-sm mb-4">{error}</p>
          <button
            onClick={loadRfqs}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div className="mb-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-1">Overview of your pricing activity and pending tasks</p>
      </div>

      {/* SECTION 1: KPI METRICS ROW */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            label="Total Quotes"
            value={totalQuotes}
            helperText="All RFQs"
            icon={FileText}
            trend="neutral"
          />
          <KpiCard
            label="Pending Approval"
            value={pendingApproval}
            helperText="Requires attention"
            icon={Clock}
            trend="neutral"
          />
          <KpiCard
            label="Approved Quotes"
            value={approvedQuotes}
            helperText="Ready for next steps"
            icon={CheckCircle}
            trend="up"
          />
          <KpiCard
            label="Quote Revenue (This Month)"
            value={`$${(quoteRevenue / 1000000).toFixed(2)}M`}
            helperText="Total revenue"
            icon={DollarSign}
            trend="up"
          />
        </div>
      </section>

      {/* Pending Approvals Widget */}
      {pendingApprovalsCount > 0 && (
        <section>
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
        </section>
      )}

      {/* SECTION 2: PRICE CHANGE NOTIFICATIONS */}
      <section>
        <PriceChangeNotifications />
      </section>

      {/* SECTION 3: QUOTE REVENUE CHART */}
      <section>
        <RevenueChart data={revenueData} />
      </section>

      {/* SECTION 4: SUBMITTED FOR APPROVAL TABLE */}
      <section>
        <SubmittedApprovalTable data={submittedForApproval} />
      </section>

      {/* SECTION 5: READY FOR NEXT STEPS TABLE */}
      <section>
        <NextStepsTable data={readyForNextSteps} />
      </section>

      {/* SECTION 6: RECENTLY STARTED TABLE */}
      <section>
        <RecentTable data={recentlyStarted} />
      </section>
    </div>
  );
}

