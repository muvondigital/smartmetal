import { useEffect, useState } from 'react';
import { Search, RefreshCw, Eye, FileText, Package, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import {
  searchRfqs,
  getAdminRfqDetail,
  reExtractRfq,
  rePriceRfq,
  getAdminPricingRunDetail,
  getAdminAgreementDetail,
  AdminRfq,
  AdminRfqDetail,
  AdminRfqSearchParams,
} from '../services/adminApi';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet';
import { toast } from 'sonner';

export default function AdminPage() {
  const [tenantCode, setTenantCode] = useState('NSC');
  const [searchParams, setSearchParams] = useState<AdminRfqSearchParams>({});
  const [rfqs, setRfqs] = useState<AdminRfq[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRfq, setSelectedRfq] = useState<AdminRfqDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleSearch = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { ...searchParams, tenantCode };
      const result = await searchRfqs(params);
      setRfqs(result.rfqs);
    } catch (err) {
      console.error('Search failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to search RFQs');
      toast.error('Search failed', {
        description: err instanceof Error ? err.message : 'Failed to search RFQs',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (rfqId: string) => {
    try {
      setDetailLoading(true);
      setError(null);
      const detail = await getAdminRfqDetail(rfqId, tenantCode);
      setSelectedRfq(detail);
      setDetailSheetOpen(true);
    } catch (err) {
      console.error('Failed to load RFQ details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load RFQ details');
      toast.error('Failed to load details', {
        description: err instanceof Error ? err.message : 'Failed to load RFQ details',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReExtract = async (rfqId: string) => {
    try {
      setActionLoading(`reextract-${rfqId}`);
      const result = await reExtractRfq(rfqId, tenantCode);
      toast.success('Re-extraction completed', {
        description: `Updated ${result.items_updated} of ${result.items_processed} items`,
      });
      // Refresh details if this RFQ is currently selected
      if (selectedRfq && selectedRfq.id === rfqId) {
        const detail = await getAdminRfqDetail(rfqId, tenantCode);
        setSelectedRfq(detail);
      }
    } catch (err) {
      console.error('Re-extraction failed:', err);
      toast.error('Re-extraction failed', {
        description: err instanceof Error ? err.message : 'Failed to re-extract RFQ',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRePrice = async (rfqId: string) => {
    try {
      setActionLoading(`reprice-${rfqId}`);
      const result = await rePriceRfq(rfqId, tenantCode);
      toast.success('Re-pricing completed', {
        description: `Created new pricing run: ${result.pricing_run.id.slice(0, 8)}`,
      });
      // Refresh details if this RFQ is currently selected
      if (selectedRfq && selectedRfq.id === rfqId) {
        const detail = await getAdminRfqDetail(rfqId, tenantCode);
        setSelectedRfq(detail);
      }
    } catch (err) {
      console.error('Re-pricing failed:', err);
      toast.error('Re-pricing failed', {
        description: err instanceof Error ? err.message : 'Failed to re-price RFQ',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      draft: { label: 'Draft', variant: 'secondary' },
      in_pricing: { label: 'In Pricing', variant: 'default' },
      pending: { label: 'Pending', variant: 'outline' },
      approved: { label: 'Approved', variant: 'default' },
      sent: { label: 'Sent', variant: 'default' },
      rejected: { label: 'Rejected', variant: 'destructive' },
    };
    const statusInfo = statusMap[status.toLowerCase()] || { label: status, variant: 'secondary' as const };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Admin Banner */}
      <Alert className="border-red-500 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertTitle className="text-red-800 font-bold">INTERNAL ADMIN TOOL – NOT FOR TENANTS</AlertTitle>
        <AlertDescription className="text-red-700">
          This is an internal debugging and support tool. Do not share with tenants.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Control Panel</h1>
          <p className="text-muted-foreground mt-1">Search and inspect RFQs, pricing runs, approvals, and agreements</p>
        </div>
      </div>

      {/* Search Panel */}
      <Card>
        <CardHeader>
          <CardTitle>RFQ Search</CardTitle>
          <CardDescription>Search RFQs by various criteria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tenantCode">Tenant Code</Label>
              <Input
                id="tenantCode"
                value={tenantCode}
                onChange={(e) => setTenantCode(e.target.value)}
                placeholder="NSC"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientName">Client Name</Label>
              <Input
                id="clientName"
                value={searchParams.clientName || ''}
                onChange={(e) => setSearchParams({ ...searchParams, clientName: e.target.value || undefined })}
                placeholder="Filter by client name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rfqId">RFQ ID</Label>
              <Input
                id="rfqId"
                value={searchParams.rfqId || ''}
                onChange={(e) => setSearchParams({ ...searchParams, rfqId: e.target.value || undefined })}
                placeholder="Filter by RFQ ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={searchParams.status || 'all'}
                onValueChange={(value) => setSearchParams({ ...searchParams, status: value === 'all' ? undefined : value })}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="in_pricing">In Pricing</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={searchParams.dateFrom || ''}
                onChange={(e) => setSearchParams({ ...searchParams, dateFrom: e.target.value || undefined })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={searchParams.dateTo || ''}
                onChange={(e) => setSearchParams({ ...searchParams, dateTo: e.target.value || undefined })}
              />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleSearch} disabled={loading} className="w-full md:w-auto">
              <Search className="mr-2 h-4 w-4" />
              {loading ? 'Searching...' : 'Search RFQs'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results List */}
      <Card>
        <CardHeader>
          <CardTitle>RFQ Results ({rfqs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : rfqs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No RFQs found. Use the search panel above to find RFQs.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RFQ ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rfqs.map((rfq) => (
                  <TableRow key={rfq.id}>
                    <TableCell className="font-mono text-xs">{rfq.id.slice(0, 8)}...</TableCell>
                    <TableCell>{rfq.client_name}</TableCell>
                    <TableCell>{rfq.title || 'Untitled'}</TableCell>
                    <TableCell>{getStatusBadge(rfq.status)}</TableCell>
                    <TableCell>{rfq.total_items}</TableCell>
                    <TableCell>{new Date(rfq.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(rfq.id)}
                          disabled={detailLoading}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReExtract(rfq.id)}
                          disabled={actionLoading === `reextract-${rfq.id}`}
                        >
                          <RefreshCw className={`h-4 w-4 ${actionLoading === `reextract-${rfq.id}` ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRePrice(rfq.id)}
                          disabled={actionLoading === `reprice-${rfq.id}`}
                        >
                          <Package className={`h-4 w-4 ${actionLoading === `reprice-${rfq.id}` ? 'animate-pulse' : ''}`} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>RFQ Details</SheetTitle>
            <SheetDescription>Complete information for RFQ {selectedRfq?.id.slice(0, 8)}</SheetDescription>
          </SheetHeader>
          {detailLoading ? (
            <div className="space-y-4 mt-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : selectedRfq ? (
            <div className="mt-6 space-y-6">
              {/* RFQ Header */}
              <Card>
                <CardHeader>
                  <CardTitle>RFQ Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">ID</Label>
                      <p className="font-mono text-xs">{selectedRfq.id}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <div>{getStatusBadge(selectedRfq.status)}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Client</Label>
                      <p>{selectedRfq.client_name}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Project</Label>
                      <p>{selectedRfq.project_name}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Created</Label>
                      <p>{new Date(selectedRfq.created_at).toLocaleString()}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Updated</Label>
                      <p>{new Date(selectedRfq.updated_at).toLocaleString()}</p>
                    </div>
                  </div>
                  {selectedRfq.description && (
                    <div>
                      <Label className="text-muted-foreground">Description</Label>
                      <p>{selectedRfq.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Items */}
              <Card>
                <CardHeader>
                  <CardTitle>Items ({selectedRfq.items.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Material</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedRfq.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.line_number || '-'}</TableCell>
                          <TableCell className="max-w-xs truncate">{item.description}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell className="font-mono text-xs">{item.material_code || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Pricing Runs */}
              <Card>
                <CardHeader>
                  <CardTitle>Pricing Runs ({selectedRfq.pricing_runs.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedRfq.pricing_runs.length === 0 ? (
                    <p className="text-muted-foreground">No pricing runs</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedRfq.pricing_runs.map((run) => (
                        <div key={run.id} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <p className="font-mono text-xs">{run.id.slice(0, 8)}...</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(run.created_at).toLocaleString()} • {getStatusBadge(run.status)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">${run.total_price?.toFixed(2) || '0.00'}</p>
                            <p className="text-xs text-muted-foreground">{run.approval_status || 'N/A'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Approvals */}
              {selectedRfq.approvals.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Approvals ({selectedRfq.approvals.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedRfq.approvals.map((approval, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <p className="text-sm">{approval.action || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">
                              {approval.approver_email || 'N/A'} • {new Date(approval.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            {approval.action === 'approved' ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                            ) : approval.action === 'rejected' ? (
                              <XCircle className="h-5 w-5 text-red-600" />
                            ) : (
                              <AlertCircle className="h-5 w-5 text-yellow-600" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Agreements */}
              {selectedRfq.agreements.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Price Agreements ({selectedRfq.agreements.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedRfq.agreements.map((agreement) => (
                        <div key={agreement.id} className="p-2 border rounded">
                          <p className="font-mono text-xs">{agreement.agreement_code || agreement.id.slice(0, 8)}</p>
                          <p className="text-sm text-muted-foreground">
                            {agreement.status} • Valid: {new Date(agreement.valid_from).toLocaleDateString()} - {new Date(agreement.valid_until).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Extraction Metadata */}
              {selectedRfq.extraction_metadata && (
                <Card>
                  <CardHeader>
                    <CardTitle>Extraction Metadata</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <Label className="text-muted-foreground">File</Label>
                      <p>{selectedRfq.extraction_metadata.file_name}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Method</Label>
                      <p>{selectedRfq.extraction_metadata.extraction_method}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Confidence</Label>
                      <p>{(selectedRfq.extraction_metadata.confidence_score * 100).toFixed(1)}%</p>
                    </div>
                    {selectedRfq.extraction_metadata.needs_review && (
                      <Badge variant="destructive">Needs Review</Badge>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

