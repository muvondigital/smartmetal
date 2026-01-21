import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, FileText, Plus, ArrowUpFromLine, ChevronDown, MoreVertical, Trash2 } from 'lucide-react';
import { getRfqs, deleteRfq } from '../api/client';
import { Rfq } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { formatRelativeTime, getDisplayRfqCode, getDisplayRfqTitle } from '../lib/rfqUtils';
import { isAuthError } from '../lib/errorUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getShortSystemId(id: string): string {
  if (!id) return '';
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
}

/**
 * Map backend status to display-friendly status with appropriate badge variant
 */
function getStatusDisplay(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  const normalizedStatus = status?.toLowerCase() || 'draft';

  switch (normalizedStatus) {
    case 'draft':
      return { label: 'Draft', variant: 'secondary' };
    case 'in_pricing':
    case 'pricing':
      return { label: 'In Pricing', variant: 'default' };
    case 'pending':
    case 'submitted':
      return { label: 'Pending Approval', variant: 'outline' };
    case 'approved':
      return { label: 'Approved', variant: 'default' };
    case 'sent':
      return { label: 'Sent', variant: 'default' };
    case 'archived':
      return { label: 'Archived', variant: 'outline' };
    case 'rejected':
      return { label: 'Rejected', variant: 'destructive' };
    default:
      return { label: status.charAt(0).toUpperCase() + status.slice(1), variant: 'secondary' };
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RfqList() {
  const navigate = useNavigate();
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [rfqToDelete, setRfqToDelete] = useState<Rfq | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    loadRfqs();
  }, []);

  const loadRfqs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRfqs();
      setRfqs(data);
    } catch (err) {
      console.error('Failed to load RFQs:', err);
      if (isAuthError(err)) {
        navigate('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load commercial requests');
    } finally {
      setLoading(false);
    }
  };

  // Filter RFQs based on search and status
  const filteredRfqs = useMemo(() => {
    return rfqs.filter((rfq) => {
      // Search filter - search by display ID, customer name, or status
      const searchLower = searchTerm.toLowerCase();
      const displayCode = getDisplayRfqCode(rfq).toLowerCase();
      const displayTitle = getDisplayRfqTitle(rfq).toLowerCase();
      const originalFilename = (rfq.original_filename || '').toLowerCase();
      const systemId = (rfq.id || '').toString().toLowerCase();

      const searchMatch =
        !searchTerm ||
        displayCode.includes(searchLower) ||
        systemId.includes(searchLower) ||
        rfq.customer_name?.toLowerCase().includes(searchLower) ||
        rfq.client_name?.toLowerCase().includes(searchLower) ||
        rfq.project_name?.toLowerCase().includes(searchLower) ||
        originalFilename.includes(searchLower) ||
        displayTitle.includes(searchLower) ||
        rfq.status?.toLowerCase().includes(searchLower);

      // Status filter
      // TODO: When implementing server-side filtering, move this to API query params
      const statusMatch =
        statusFilter === 'all' || rfq.status?.toLowerCase() === statusFilter.toLowerCase();

      return searchMatch && statusMatch;
    });
  }, [rfqs, searchTerm, statusFilter]);

  // Calculate stats
  const activeRfqsCount = rfqs.filter(
    (r) => r.status !== 'rejected' && r.status !== 'archived'
  ).length;

  const needAttentionCount = rfqs.filter(
    (r) => r.status === 'pending' || r.status === 'submitted'
  ).length;

  // Handle row click navigation
  const handleRowClick = (rfqId: number | string, event: React.MouseEvent) => {
    // Don't navigate if clicking on a button or link
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) {
      return;
    }
    navigate(`/rfqs/${rfqId}`);
  };

  // Handle delete action
  const handleDeleteClick = async (rfq: Rfq, event?: React.MouseEvent | Event) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    try {
      // Delete immediately without confirmation
      await deleteRfq(rfq.id);

      // Optimistically remove from list
      setRfqs((prev) => prev.filter((r) => r.id !== rfq.id));
    } catch (err) {
      console.error('Failed to delete RFQ:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete commercial request';
      setError(errorMessage);

      // Reload the list to ensure consistency
      loadRfqs();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!rfqToDelete) return;

    try {
      setDeleting(true);
      setDeleteError(null);
      await deleteRfq(rfqToDelete.id);
      
      // Optimistically remove from list
      setRfqs((prev) => prev.filter((r) => r.id !== rfqToDelete.id));
      
      // Close dialog and reset state
      setDeleteDialogOpen(false);
      setRfqToDelete(null);
      setDeleteError(null);
    } catch (err) {
      console.error('Failed to delete RFQ:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete commercial request';
      setDeleteError(errorMessage);
      // Keep dialog open so user can see the error
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setRfqToDelete(null);
    setDeleteError(null);
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      {/* ========================================
          PAGE HEADER
          ======================================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Commercial Requests</h1>
            {!loading && (
              <Badge variant="secondary" className="text-xs font-medium">
                {activeRfqsCount} active
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-600">
            Manage all commercial requests (RFQs, RFPs, Tenders, MTOs, BOMs) created from imported documents or manual entry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="default" title="Import a document (RFQ, RFP, MTO, BOM) using AI">
            <Link to="/rfqs/import">
              <ArrowUpFromLine className="h-4 w-4 mr-2" />
              Import Document
            </Link>
          </Button>
          <Button asChild size="default" title="Create a request manually without uploading a document">
            <Link to="/rfqs/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Commercial Request
            </Link>
          </Button>
        </div>
      </div>

      {/* ========================================
          SUMMARY STRIP (CARDS)
          ======================================== */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Active Requests
            </CardDescription>
            <CardTitle className="text-4xl font-bold tabular-nums">
              {loading ? <Skeleton className="h-10 w-16" /> : activeRfqsCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">All non-archived commercial requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Need Attention
            </CardDescription>
            <CardTitle className="text-4xl font-bold tabular-nums">
              {loading ? <Skeleton className="h-10 w-16" /> : needAttentionCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">Pending approval or review</p>
          </CardContent>
        </Card>

        {/* Optional third card - Won/Lost stats */}
        <Card className="hidden lg:block">
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Total Requests
            </CardDescription>
            <CardTitle className="text-4xl font-bold tabular-nums">
              {loading ? <Skeleton className="h-10 w-16" /> : rfqs.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">All time requests</p>
          </CardContent>
        </Card>
      </div>

      {/* ========================================
          ERROR ALERT
          ======================================== */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error Loading Commercial Requests</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadRfqs}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ========================================
          FILTER + SEARCH BAR
          ======================================== */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by request ID, title, customer, or status…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex h-10 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-sm shadow-sm transition-colors hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-[200px]"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="pricing">In Pricing</option>
              <option value="pending">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="sent">Sent</option>
              <option value="archived">Archived</option>
              <option value="rejected">Rejected</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>

          {/* TODO: Add Customer filter when customer data is available */}
          {/* TODO: Add Date range filter (optional) */}
        </div>
      </div>

      {/* ========================================
          RFQ TABLE (MAIN CONTENT)
          ======================================== */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Request ID</TableHead>
                <TableHead className="min-w-[200px]">Title / Description</TableHead>
                <TableHead className="w-[180px]">Customer</TableHead>
                <TableHead className="w-[140px]">Status</TableHead>
                <TableHead className="w-[120px]">Created</TableHead>
                <TableHead className="w-[120px]">Owner</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                // Loading state
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredRfqs.length === 0 ? (
                // Empty state
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <FileText className="mb-4 h-12 w-12 text-slate-400" />
                      <h3 className="mb-1 text-lg font-semibold text-slate-900">
                        No commercial requests found
                      </h3>
                      <p className="mb-4 text-sm text-slate-600">
                        {searchTerm || statusFilter !== 'all'
                          ? 'Try adjusting your filters to see more results'
                          : 'Get started by importing a document or creating a request manually'}
                      </p>
                      {!searchTerm && statusFilter === 'all' && (
                        <div className="flex gap-2">
                          <Button asChild variant="default">
                            <Link to="/rfqs/import">
                              <ArrowUpFromLine className="mr-2 h-4 w-4" />
                              Import Document
                            </Link>
                          </Button>
                          <Button asChild variant="outline">
                            <Link to="/rfqs/new">
                              <Plus className="mr-2 h-4 w-4" />
                              Create Request
                            </Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                // Data rows
                filteredRfqs.map((rfq) => {
                  const displayCode = getDisplayRfqCode(rfq);
                  const displayTitle = getDisplayRfqTitle(rfq);
                  const shortSystemId = getShortSystemId(rfq.id);
                  const statusDisplay = getStatusDisplay(rfq.status);

                  return (
                    <TableRow
                      key={rfq.id}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                      onClick={(e) => handleRowClick(rfq.id, e)}
                    >
                      {/* RFQ ID Column */}
                      <TableCell>
                        <Link
                          to={`/rfqs/${rfq.id}`}
                          className="flex flex-col gap-0.5 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="font-semibold text-slate-900">{displayTitle}</span>
                          <span className="text-xs text-slate-500">
                            {displayCode}
                            {shortSystemId ? ` · System ID: ${shortSystemId}` : ''}
                          </span>
                        </Link>
                      </TableCell>

                      {/* Title / Description Column */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-900">
                            {rfq.project_name || rfq.customer_name || '—'}
                          </span>
                          {/* TODO: Add description subtext when available from backend */}
                        </div>
                      </TableCell>

                      {/* Customer Column */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-900">
                            {rfq.customer_name || '—'}
                          </span>
                          {/* TODO: Add "New customer" / "Existing customer" badge when customer metadata available */}
                        </div>
                      </TableCell>

                      {/* Status Column */}
                      <TableCell>
                        <Badge variant={statusDisplay.variant} className="font-medium">
                          {statusDisplay.label}
                        </Badge>
                      </TableCell>

                      {/* Created Column */}
                      <TableCell>
                        <span className="text-sm text-slate-600">
                          {rfq.created_at ? formatRelativeTime(rfq.created_at) : '—'}
                        </span>
                      </TableCell>

                      {/* Owner Column */}
                      <TableCell>
                        <span className="text-sm text-slate-600">
                          {/* TODO: Add owner/salesperson when available from backend */}
                          —
                        </span>
                      </TableCell>

                      {/* Actions Column */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link to={`/rfqs/${rfq.id}`}>
                              Open
                            </Link>
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleDeleteClick(rfq, e);
                            }}
                            title="Delete commercial request"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ========================================
          RESULTS SUMMARY
          ======================================== */}
      {!loading && filteredRfqs.length > 0 && (
        <div className="flex items-center justify-center">
          <p className="text-sm text-slate-600">
            Showing <span className="font-medium">{filteredRfqs.length}</span> of{' '}
            <span className="font-medium">{rfqs.length}</span> request{rfqs.length !== 1 ? 's' : ''}
            {(searchTerm || statusFilter !== 'all') && (
              <span>
                {' '}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              </span>
            )}
          </p>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Commercial Request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>
                {rfqToDelete ? getDisplayRfqTitle(rfqToDelete) : ''}
              </strong>{' '}
              ({rfqToDelete ? getDisplayRfqCode(rfqToDelete) : ''})?
              This action cannot be undone. All associated items, pricing runs, and data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="px-6 py-3">
              <Alert variant="destructive">
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel} disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              variant="destructive"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
