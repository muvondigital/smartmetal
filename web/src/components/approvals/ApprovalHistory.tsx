import { CheckCircle, XCircle, Send, Clock } from 'lucide-react';
import { ApprovalHistoryItem } from '../../services/approvalsApi';
import { formatDate } from '../../lib/formatters';
import { Badge } from '../ui/badge';

interface ApprovalHistoryProps {
  history: ApprovalHistoryItem[];
}

export function ApprovalHistory({ history }: ApprovalHistoryProps) {
  const getActionIcon = (action: string) => {
    switch (action) {
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-teal-600" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-rose-600" />;
      case 'submitted':
        return <Send className="w-5 h-5 text-blue-600" />;
      default:
        return <Clock className="w-5 h-5 text-slate-600" />;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'approved':
        return <Badge variant="outline" className="bg-teal-50 text-teal-700">Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-rose-50 text-rose-700">Rejected</Badge>;
      case 'submitted':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700">Submitted</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No approval history available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {history.map((item, index) => (
        <div key={item.id} className="flex gap-4">
          {/* Timeline line */}
          {index < history.length - 1 && (
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 flex items-center justify-center">
                {getActionIcon(item.action)}
              </div>
              <div className="w-0.5 h-full bg-slate-200 mt-2" />
            </div>
          )}
          {index === history.length - 1 && (
            <div className="w-10 h-10 flex items-center justify-center">
              {getActionIcon(item.action)}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 pb-4">
            <div className="flex items-center gap-2 mb-1">
              {getActionBadge(item.action)}
              <span className="text-sm text-slate-600">{formatDate(item.created_at)}</span>
            </div>
            <p className="text-slate-900 font-medium mb-1">
              {item.actor_name}
              {item.actor_email && (
                <span className="text-slate-500 text-sm ml-2">{item.actor_email}</span>
              )}
            </p>
            {item.notes && (
              <p className="text-slate-600 text-sm mt-1">{item.notes}</p>
            )}
            {item.previous_status && item.new_status && (
              <p className="text-xs text-slate-500 mt-1">
                Status changed from <span className="font-medium">{item.previous_status}</span> to{' '}
                <span className="font-medium">{item.new_status}</span>
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

