import { CheckCircle, XCircle, Clock, DollarSign } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { PendingApproval } from '../../services/approvalsApi';
import { formatCurrency, formatDate, toTitleCase } from '../../lib/formatters';

interface ApprovalCardProps {
  approval: PendingApproval;
  onApprove: (pricingRunId: string) => void;
  onReject: (pricingRunId: string) => void;
  onView: (pricingRunId: string) => void;
  loading?: boolean;
}

export function ApprovalCard({ approval, onApprove, onReject, onView, loading }: ApprovalCardProps) {

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h3 className="text-lg font-semibold text-slate-900">{approval.rfq_title}</h3>
            <Badge variant="outline" className="bg-amber-50 text-amber-700">
              Pending
            </Badge>
          </div>
          <p className="text-slate-600 text-sm mb-3">{toTitleCase(approval.client_name)}</p>
          
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <div className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              <span className="font-medium text-slate-900">{formatCurrency(approval.total_price)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Submitted {formatDate(approval.submitted_at)}</span>
            </div>
            {approval.days_pending > 0 && (
              <Badge variant="outline" className="bg-rose-50 text-rose-700">
                {approval.days_pending} day{approval.days_pending !== 1 ? 's' : ''} pending
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Simplified: No AI Insights, just simple approve/reject */}
      <div className="flex items-center gap-2 pt-4 mt-4 border-t border-slate-200">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onView(approval.pricing_run_id)}
          disabled={loading}
        >
          View Details
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => onReject(approval.pricing_run_id)}
          disabled={loading}
          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-2"
        >
          <XCircle className="w-4 h-4" />
          Reject
        </Button>
        <Button
          size="sm"
          onClick={() => onApprove(approval.pricing_run_id)}
          disabled={loading}
          className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          Approve
        </Button>
      </div>
    </div>
  );
}

