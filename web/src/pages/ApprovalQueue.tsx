import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { ApprovalCard } from '../components/approvals/ApprovalCard';
import {
  getPendingApprovals,
  approvePricingRun,
  rejectPricingRun,
  PendingApproval,
} from '../services/approvalsApi';
import { Button } from '../components/ui/button';
import { getErrorMessage } from '../lib/errorUtils';

export default function ApprovalQueue() {
  const navigate = useNavigate();
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadApprovals();
  }, []);

  const loadApprovals = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPendingApprovals();
      console.log('Loaded approvals:', data);
      setApprovals(data);
    } catch (err) {
      console.error('Failed to load approvals:', err);
      const errorMessage = getErrorMessage(err);
      console.error('Error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (pricingRunId: string) => {
    // Auto-approve without prompts
    const approverName = 'Admin';
    const approverEmail = 'admin@smartmetal.com';
    const notes = undefined;

    try {
      setProcessingId(pricingRunId);
      await approvePricingRun(pricingRunId, {
        approver_name: approverName,
        approver_email: approverEmail,
        notes: notes || undefined,
      });
      await loadApprovals();
      alert('Pricing run approved successfully');
    } catch (err) {
      console.error('Failed to approve:', err);
      const errorMessage = getErrorMessage(err);
      alert(errorMessage);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (pricingRunId: string) => {
    // Auto-reject without prompts
    const approverName = 'Admin';
    const approverEmail = 'admin@smartmetal.com';
    const rejectionReason = 'Rejected';

    try {
      setProcessingId(pricingRunId);
      await rejectPricingRun(pricingRunId, {
        approver_name: approverName,
        approver_email: approverEmail,
        rejection_reason: rejectionReason,
      });
      await loadApprovals();
      alert('Pricing run rejected');
    } catch (err) {
      console.error('Failed to reject:', err);
      const errorMessage = getErrorMessage(err);
      alert(errorMessage);
    } finally {
      setProcessingId(null);
    }
  };

  const handleView = (pricingRunId: string) => {
    navigate(`/pricing-runs/${pricingRunId}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="text-slate-600">Loading approval queue...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 max-w-md">
          <h3 className="text-rose-900 font-semibold mb-2">Error Loading Approvals</h3>
          <p className="text-rose-700 text-sm mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={loadApprovals}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Approval Queue</h1>
          <p className="text-slate-600 text-sm mt-1">
            Review and approve pending pricing runs
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadApprovals}>
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {approvals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-slate-600 text-sm">Pending</p>
                <p className="text-slate-900 text-2xl font-semibold">{approvals.length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approvals List */}
      {approvals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <CheckCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-slate-900 font-semibold mb-2">No Pending Approvals</h3>
          <p className="text-slate-600 text-sm">
            All pricing runs have been reviewed. Great job!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {approvals.map((approval) => (
            <ApprovalCard
              key={approval.pricing_run_id}
              approval={approval}
              onApprove={handleApprove}
              onReject={handleReject}
              onView={handleView}
              loading={processingId === approval.pricing_run_id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

