import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Play,
  Plus,
  MoreVertical,
  Package,
  Paperclip,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  TrendingUp,
  Target,
  Upload,
  Edit2,
  Trash2,
  Download,
  Eye,
  ChevronLeft,
} from 'lucide-react';
import { getRfq, getRfqItems, getRfqItemsWithPricing, RfqItemWithPricing, deleteRfq, updateRfq, deleteRfqItem } from '../api/client';
import { formatRelativeTime, getDisplayRfqCode, getDisplayRfqTitle, getDocumentTypeLabel } from '../lib/rfqUtils';
import { toast } from 'sonner';
import {
  getPricingRunsByRfqId,
  createPricingRun,
  PricingRun
} from '../services/pricingRunsApi';
import { getApprovalHistory, ApprovalHistoryItem } from '../services/approvalsApi';
import { RfqItemModal } from '../components/rfq/RfqItemModal';

// Shadcn UI Components
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Separator } from '../components/ui/separator';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface RfqLineItem {
  id: string;
  line_number: number;
  description: string;
  quantity: number;
  unit: string;
  material_code?: string | null;
  origin?: 'china' | 'non_china' | null;
  status: 'matched' | 'unmatched' | 'needs_review';
  size?: string | null;
  has_pricing?: boolean;
  // HS Code fields (Phase 4)
  hs_code?: string | null;
  import_duty_rate?: number | null;
  import_duty_amount?: number | null;
  hs_match_source?: 'RULE' | 'MAPPING' | 'DIRECT_HS' | 'MANUAL' | 'NONE' | null;
  hs_confidence?: number | null;
  // Origin and final duty fields (Phase 5)
  origin_country?: string | null;
  trade_agreement?: string | null;
  final_import_duty_rate?: number | null;
  final_import_duty_amount?: number | null;
  pricing?: {
    base_cost: number;
    unit_price: number;
    total_price: number;
    markup_pct: number;
    logistics_cost: number;
    risk_pct: number;
    risk_cost: number;
    pricing_method: 'agreement' | 'rule_based';
    currency: string;
    price_agreement: {
      id: string;
      agreement_code: string;
      valid_from: string;
      valid_to: string;
    } | null;
  } | null;
}

interface PricingRunSummary {
  id: string;
  version: number;
  status: string;
  total_price?: number;
  margin_percent?: number;
  created_at: string;
  outcome?: 'won' | 'lost' | 'pending' | null;
}

interface AttachmentSummary {
  id: string;
  filename: string;
  file_type: string;
  uploaded_by: string;
  uploaded_at: string;
}

interface ApprovalHistoryEntry {
  id: string;
  date: string;
  approver: string;
  status: 'approved' | 'rejected' | 'pending';
  comment?: string;
}

interface RfqDetailData {
  id: string;
  rfq_code?: string | null;
  displayCode?: string;
  title?: string;
  status: 'draft' | 'in_pricing' | 'pending_approval' | 'approved' | 'sent' | 'archived';
  customer_name?: string | null;
  client_name?: string | null;
  project_name?: string | null;
  original_filename?: string | null;
  document_type?: string | null;
  created_at: string;
  updated_at: string;
  owner_name?: string;
  terms?: {
    incoterm?: string;
    payment_term?: string;
    validity_days?: number;
    currency?: string;
  };
  // Extended data
  lineItems?: RfqLineItem[];
  pricingRuns?: PricingRunSummary[];
  attachments?: AttachmentSummary[];
  approvalHistory?: ApprovalHistoryEntry[];
  aiInsights?: {
    winProbability?: number;
    recommendedMargin?: number;
    currentMargin?: number;
    riskScore?: number;
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getShortSystemId(id: string): string {
  if (!id) return '';
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
}

/**
 * Map status to Badge variant and color
 */
function getStatusBadgeConfig(status: string): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
} {
  const normalizedStatus = status?.toLowerCase() || 'draft';

  switch (normalizedStatus) {
    case 'draft':
      return { variant: 'secondary', className: 'bg-gray-100 text-gray-800' };
    case 'in_pricing':
      return { variant: 'default', className: 'bg-blue-100 text-blue-800' };
    case 'pending_approval':
      return { variant: 'outline', className: 'bg-amber-100 text-amber-800 border-amber-300' };
    case 'approved':
      return { variant: 'default', className: 'bg-green-100 text-green-800' };
    case 'sent':
      return { variant: 'default', className: 'bg-violet-100 text-violet-800' };
    case 'archived':
      return { variant: 'outline' };
    default:
      return { variant: 'secondary' };
  }
}

/**
 * Format status text
 */
function formatStatusText(status: string): string {
  if (!status) return 'Draft';
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Format currency
 */
function formatCurrency(amount: number | undefined, currency = 'USD'): string {
  if (amount === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format percentage
 */
function formatPercent(value: number | undefined): string {
  if (value === undefined) return '—';
  return `${value.toFixed(1)}%`;
}

/**
 * Format HS code match source badge
 */
function getHsMatchBadge(
  matchSource: 'RULE' | 'MAPPING' | 'DIRECT_HS' | 'MANUAL' | 'NONE' | null | undefined,
  confidence: number | null | undefined
): { label: string; variant: 'default' | 'secondary' | 'outline'; className?: string } {
  if (!matchSource || matchSource === 'NONE') {
    return { label: 'NONE', variant: 'outline', className: 'text-slate-500' };
  }

  if (matchSource === 'MANUAL') {
    return { label: 'MANUAL', variant: 'default', className: 'bg-blue-100 text-blue-800' };
  }

  // AUTO badge for RULE, MAPPING, DIRECT_HS
  const label = confidence !== null && confidence !== undefined
    ? `AUTO (${confidence.toFixed(2)})`
    : 'AUTO';

  return { label, variant: 'default', className: 'bg-green-100 text-green-800' };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RfqDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [rfq, setRfq] = useState<RfqDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [pricingRuns, setPricingRuns] = useState<PricingRun[]>([]);
  const [creatingPricing, setCreatingPricing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approvalHistories, setApprovalHistories] = useState<Record<string, ApprovalHistoryItem[]>>({});
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [editingItem, setEditingItem] = useState<RfqLineItem | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<RfqLineItem | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [suppliers, setSuppliers] = useState<Array<{id: string; name: string; code: string; origin_type: string}>>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [applyingSupplier, setApplyingSupplier] = useState(false);
  const [deleteItemDialogOpen, setDeleteItemDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);

  useEffect(() => {
    if (id) {
      loadRfq();
    }
  }, [id]);

  const loadRfq = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRfq(id!);

      const mapPlainItem = (item: any): RfqLineItem => ({
        id: item.id,
        line_number: item.line_number || 0,
        description: item.description || '',
        quantity: item.quantity || 0,
        unit: item.unit || '',
        material_code: item.material_code || null,
        origin: null,
        status: item.material_code ? 'matched' : 'unmatched',
        size: item.size_display || null,
        pricing: null,
        has_pricing: false,
      });

      // Fetch line items with pricing for this RFQ; if empty or failing, fall back to basic items
      let lineItems: RfqLineItem[] = [];
      try {
        const itemsWithPricing = await getRfqItemsWithPricing(id!);
        if (Array.isArray(itemsWithPricing) && itemsWithPricing.length > 0) {
          lineItems = itemsWithPricing.map((item: RfqItemWithPricing) => ({
            id: item.id,
            line_number: item.line_number || 0,
            description: item.description || '',
            quantity: item.quantity || 0,
            unit: item.unit || '',
            material_code: item.material_code || null,
            origin: null, // TODO: Add origin field if needed
            status: item.material_code ? 'matched' : 'unmatched',
            size: item.size_display || null,
            pricing: item.pricing,
            has_pricing: item.has_pricing
          }));
        } else {
          const fallbackItems = await getRfqItems(id!);
          lineItems = (fallbackItems || []).map(mapPlainItem);
        }
      } catch (itemsError) {
        console.warn('RFQ items with pricing unavailable:', itemsError instanceof Error ? itemsError.message : 'Unknown error');
        try {
          const fallbackItems = await getRfqItems(id!);
          lineItems = (fallbackItems || []).map(mapPlainItem);
        } catch (fallbackError) {
          console.warn('RFQ items unavailable:', fallbackError instanceof Error ? fallbackError.message : 'Unknown error');
        }
      }

      // Fetch pricing runs for this RFQ
      let pricingRunsData: PricingRun[] = [];
      try {
        pricingRunsData = await getPricingRunsByRfqId(id!);
        setPricingRuns(pricingRunsData);
        
        // Load approval history for each pricing run
        const histories: Record<string, ApprovalHistoryItem[]> = {};
        await Promise.all(
          pricingRunsData.map(async (run) => {
            try {
              const history = await getApprovalHistory(run.id);
              if (history && history.length > 0) {
                histories[run.id] = history;
              }
            } catch (err) {
              // No approval history is okay
              console.debug(`No approval history for pricing run ${run.id}`);
            }
          })
        );
        setApprovalHistories(histories);
      } catch (pricingError) {
        console.error('Failed to load pricing runs:', pricingError);
        // Continue without pricing runs - don't fail the whole page
      }

      // Transform backend data to our RfqDetailData structure
      const transformedData: RfqDetailData = {
        id: data.id.toString(),
        displayCode: undefined, // TODO: Get from backend
        title: data.title || undefined,
        status: (data.status as any) || 'draft',
        customer_name: data.customer_name || data.client_name || null,
        client_name: data.client_name || data.customer_name || null,
        project_name: data.project_name || null,
        created_at: data.created_at,
        updated_at: data.updated_at || data.created_at,
        owner_name: undefined, // TODO: Get from backend
        terms: {
          // TODO: Get from backend
          incoterm: undefined,
          payment_term: undefined,
          validity_days: 14,
          currency: 'USD',
        },
        lineItems,
        pricingRuns: pricingRunsData.map((run) => ({
          id: run.id,
          version: run.version_number,
          status: run.status,
          total_price: run.total_price,
          margin_percent: undefined, // TODO: Calculate from items if needed
          created_at: run.created_at,
          outcome: run.outcome as any,
        })),
        attachments: [],
        approvalHistory: [],
        aiInsights: undefined,
      };

      setRfq(transformedData);
      setTitleValue(data.title || ''); // Set initial title value for editing
    } catch (err) {
      console.error('Failed to load RFQ:', err);
      setError(err instanceof Error ? err.message : 'Failed to load commercial request');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // ACTION HANDLERS
  // ============================================================================

  // Handle delete action
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!rfq || !id) return;

    try {
      setDeleting(true);
      await deleteRfq(id);
      // Navigate back to RFQ list after successful deletion
      navigate('/rfqs');
    } catch (err) {
      console.error('Failed to delete RFQ:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete commercial request');
      setDeleteDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  const handleTitleEdit = () => {
    setIsEditingTitle(true);
    setTitleValue(rfq?.title || '');
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
    setTitleValue(rfq?.title || '');
  };

  const handleTitleSave = async () => {
    if (!id || !rfq) return;

    try {
      setSavingTitle(true);
      const updatedRfq = await updateRfq(id, { title: titleValue.trim() });
      
      // Update local state
      setRfq({
        ...rfq,
        title: updatedRfq.title || undefined,
      });
      setIsEditingTitle(false);
    } catch (err) {
      console.error('Failed to update RFQ title:', err);
      setError(err instanceof Error ? err.message : 'Failed to update title');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleRunPricing = async (supersededReason?: string) => {
    // Frontend validation: Ensure rfqId is present and valid UUID format
    if (!id || typeof id !== 'string' || id.trim() === '') {
      toast.error('RFQ ID is missing. Please refresh the page and try again.');
      return;
    }

    // Validate UUID format (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const trimmedId = id.trim();
    if (!uuidRegex.test(trimmedId)) {
      toast.error('Invalid RFQ ID format. Please refresh the page and try again.');
      return;
    }

    // First, open supplier selection modal
    await loadSuppliers();
    setSupplierModalOpen(true);
  };

  const loadSuppliers = async () => {
    try {
      setLoadingSuppliers(true);
      const apiModule = await import('../api/client');
      const { request } = apiModule;
      const suppliersData = await request<Array<{id: string; name: string; code: string; origin_type: string}>>('/v1/suppliers');
      setSuppliers(suppliersData);
    } catch (error) {
      console.error('Error loading suppliers:', error);
      toast.error('Failed to load suppliers');
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const handleSupplierSelected = async () => {
    if (!selectedSupplierId) {
      toast.error('Please select a supplier');
      return;
    }

    if (!id) return;

    try {
      setApplyingSupplier(true);
      const apiModule = await import('../api/client');
      const { request } = apiModule;

      // Bulk update all items with selected supplier
      await request(`/v1/rfqs/${id}/items/bulk-supplier-selection`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: selectedSupplierId }),
      });

      toast.success('Supplier assigned to all items');
      setSupplierModalOpen(false);

      // Now proceed with pricing
      await proceedWithPricing();
    } catch (error: any) {
      console.error('Error applying supplier selection:', error);
      toast.error(error.message || 'Failed to assign supplier');
    } finally {
      setApplyingSupplier(false);
    }
  };

  const proceedWithPricing = async (supersededReason?: string) => {
    if (!id) return;

    try {
      setCreatingPricing(true);
      console.log('[RfqDetail] Starting pricing run creation for RFQ:', id);
      
      // Use the API client utility to ensure proper auth headers and error handling
      const apiModule = await import('../api/client');
      const { request } = apiModule;
      
      // Call API with optional reason (for creating new version when current is approved)
      const body = supersededReason
        ? {
            superseded_reason: supersededReason,
            has_reprice_permission: true,
          }
        : undefined;

      // Temporary debug log to verify outbound payload shape
      console.log('[RfqDetail] Run Pricing request payload debug', {
        rfqId: id,
        bodyKeys: body ? Object.keys(body) : [],
        hasSupersededReason: !!supersededReason,
      });

      const newPricingRun = await request<PricingRun>(`/v1/pricing-runs/rfq/${id}`, {
        method: 'POST',
        ...(body && {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }),
      });
      
      console.log('[RfqDetail] Pricing run created successfully:', newPricingRun?.id || 'unknown');

      // Reload RFQ data to get updated pricing runs
      await loadRfq();

      // Switch to pricing tab and navigate to the new pricing run
      setActiveTab('pricing');

      // Optional: Navigate to pricing run detail page
      setTimeout(() => {
        if (newPricingRun?.id) {
          navigate(`/pricing-runs/${newPricingRun.id}`);
        }
      }, 500);
    } catch (error: any) {
      console.error('[RfqDetail] Failed to create pricing run:', {
        message: error?.message,
        code: error?.code,
        status: error?.response?.status,
      });

      // Handle structured error responses from the API client / Axios
      const apiError = error?.response?.data?.error || error?.error || null;

      if (apiError?.code === 'INVALID_RFQ_ID' || error?.code === 'INVALID_RFQ_ID') {
        toast.error('Invalid RFQ ID. Please refresh the page and try again.');
      } else if (apiError?.code === 'PRICING_PREFLIGHT_FAILED' || error?.code === 'PRICING_PREFLIGHT_FAILED') {
        const details = apiError?.details || error?.details || {};
        const missing = details.missing || [];
        const validationErrors = details.validationErrors || [];
        const issues = [...validationErrors, ...missing.map((m: string) => `Missing: ${m}`)];
        toast.error(`Cannot run pricing: ${issues.join(', ')}`);
      } else {
        // Extract error message safely without stringifying the full error object
        const errorMessage =
          apiError?.message ||
          error?.response?.data?.details ||
          error?.message ||
          'Failed to create pricing run';
        toast.error(`Failed to create pricing run: ${errorMessage}`);
      }
    } finally {
      setCreatingPricing(false);
    }
  };


  const handleAddLineItem = () => {
    setEditingItem(null); // null = create new item
    setItemModalOpen(true);
  };

  const handleRemoveLineItemClick = (item: RfqLineItem) => {
    setItemToDelete(item);
    setDeleteItemDialogOpen(true);
  };

  const handleRemoveLineItemConfirm = async () => {
    if (!itemToDelete || !id) return;

    try {
      setDeletingItem(true);
      await deleteRfqItem(id, itemToDelete.id);
      toast.success('Line item deleted successfully');
      
      // Reload RFQ data to refresh line items
      await loadRfq();
      
      setDeleteItemDialogOpen(false);
      setItemToDelete(null);
    } catch (err) {
      console.error('Failed to delete line item:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete line item');
    } finally {
      setDeletingItem(false);
    }
  };

  const handleRemoveLineItemCancel = () => {
    setDeleteItemDialogOpen(false);
    setItemToDelete(null);
  };

  const handleImportDocument = () => {
    // TODO: Navigate to import flow
    navigate('/rfqs/import', { state: { rfqId: id } });
  };

  const handleUploadCSV = () => {
    // TODO: Implement CSV upload
    alert('CSV Upload feature coming soon!');
  };

  // ============================================================================
  // LOADING & ERROR STATES
  // ============================================================================

  if (loading) {
    return (
      <div className="flex flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        {/* Header skeleton */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
        {/* Content skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Commercial Request</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/rfqs')}>
                Back to Requests
              </Button>
              <Button variant="default" size="sm" onClick={loadRfq}>
                Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="mb-4 h-12 w-12 text-slate-400" />
        <h3 className="mb-2 text-lg font-semibold text-slate-900">Commercial Request not found</h3>
        <p className="mb-4 text-sm text-slate-600">The requested commercial request could not be found.</p>
        <Button onClick={() => navigate('/rfqs')}>Back to Requests</Button>
      </div>
    );
  }

  const displayCode = getDisplayRfqCode(rfq);
  const displayTitle = getDisplayRfqTitle(rfq);
  const shortSystemId = getShortSystemId(rfq.id);
  
  // Find current pricing run
  const currentPricingRun = pricingRuns.find(pr => pr.is_current === true);
  const currentRunIsApproved = currentPricingRun?.approval_status === 'approved';
  
  // Determine RFQ status: if current approved run exists, status should be 'quoted'
  const effectiveStatus = currentRunIsApproved && rfq.status !== 'archived' ? 'quoted' : rfq.status;
  const statusConfig = getStatusBadgeConfig(effectiveStatus);
  
  const hasLineItems = (rfq.lineItems?.length ?? 0) > 0;
  const canRunPricing = hasLineItems && rfq.status !== 'archived';

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      {/* ========================================
          HEADER STRIP
          ======================================== */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        {/* Left side - RFQ Identity */}
        <div className="flex-1 space-y-2">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Link to="/rfqs" className="hover:text-slate-900 hover:underline">
              Commercial Requests
            </Link>
            <span>/</span>
            <span className="font-medium text-slate-900">{displayCode}</span>
          </div>

          {/* Main RFQ label */}
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{displayTitle}</h1>
            <p className="text-sm text-slate-600">
              {displayCode}
              {shortSystemId ? ` · System ID: ${shortSystemId}` : ''}
            </p>
            {rfq.original_filename && (
              <p className="text-xs text-slate-500">Uploaded file: {rfq.original_filename}</p>
            )}
          </div>

          {/* Status + Document Type + Last Updated */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge {...statusConfig}>{formatStatusText(effectiveStatus)}</Badge>
            {rfq.document_type && rfq.document_type !== 'RFQ' && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                {getDocumentTypeLabel(rfq.document_type)}
              </Badge>
            )}
            {currentRunIsApproved && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                Quote Approved
              </Badge>
            )}
            <span className="text-sm text-slate-600">
              Last updated: {formatRelativeTime(rfq.updated_at)}
            </span>
          </div>
        </div>

        {/* Right side - Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* State machine logic for pricing run buttons */}
          {!currentPricingRun ? (
            // No pricing runs: show "Run Pricing" enabled
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="default"
                    size="default"
                    onClick={() => handleRunPricing()}
                    disabled={!canRunPricing || creatingPricing}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {creatingPricing ? 'Creating...' : 'Run Pricing'}
                  </Button>
                </span>
              </TooltipTrigger>
              {!hasLineItems && (
                <TooltipContent>
                  <p>Add at least 1 line item to run pricing.</p>
                </TooltipContent>
              )}
            </Tooltip>
          ) : (
            // Current run exists
            <>
              {/* Show "View Current Pricing Run / Quote" button */}
              <Button
                variant="default"
                size="default"
                onClick={() => navigate(`/pricing-runs/${currentPricingRun.id}`)}
              >
                <Eye className="mr-2 h-4 w-4" />
                View Current {currentRunIsApproved ? 'Quote' : 'Pricing Run'}
              </Button>
              
              {/* If approved: show Generate PDF and optionally Create New Version */}
              {currentRunIsApproved ? (
                <>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => {
                      window.open(`/api/pdf/pricing-runs/${currentPricingRun.id}?download=true`, '_blank');
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Generate Quote PDF
                  </Button>
                  {/* TODO: Add permission check and reason modal for Create New Version */}
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => {
                      const reason = prompt('Please provide a reason for creating a new version:');
                      if (reason && reason.trim()) {
                        handleRunPricing(reason.trim());
                      }
                    }}
                    disabled={creatingPricing}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Create New Version
                  </Button>
                </>
              ) : (
                // If not approved: show "Run Pricing" (creates new version)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="default"
                        size="default"
                        onClick={() => handleRunPricing()}
                        disabled={!canRunPricing || creatingPricing}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        {creatingPricing ? 'Creating...' : 'Run Pricing'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!hasLineItems && (
                    <TooltipContent>
                      <p>Add at least 1 line item to run pricing.</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              )}
            </>
          )}

          <Button variant="outline" size="default" onClick={handleAddLineItem}>
            <Plus className="mr-2 h-4 w-4" />
            Add Line Item
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => alert('Duplicate request coming soon!')}>
                Duplicate Request
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => alert('Export coming soon!')}>
                Export to PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => alert('Archive coming soon!')}>
                Archive Request
              </DropdownMenuItem>
              {rfq.status === 'draft' && (
                <DropdownMenuItem
                  onClick={handleDeleteClick}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Request
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ========================================
          TABS (MAIN CONTENT)
          ======================================== */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="line-items">
            Line Items
            {hasLineItems && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {rfq.lineItems?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pricing">
            Pricing
            {(rfq.pricingRuns?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {rfq.pricingRuns?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="attachments">
            Attachments
            {(rfq.attachments?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {rfq.attachments?.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ========================================
            TAB: OVERVIEW
            ======================================== */}
        <TabsContent value="overview" className="space-y-4">
          {/* Empty State Banner - Show when no line items */}
          {!hasLineItems && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-900">No line items yet</AlertTitle>
              <AlertDescription className="text-amber-800">
                We could not detect BOQ line items from this document. Upload a BOQ or add a line item manually.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left Column - RFQ Info */}
            <Card>
              <CardHeader>
                <CardTitle>{getDocumentTypeLabel(rfq.document_type)} Information</CardTitle>
                <CardDescription>Basic details about this request</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Request Code</Label>
                    <p className="font-medium text-slate-900">{displayCode}</p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Status</Label>
                    <div>
                      <Badge {...statusConfig}>{formatStatusText(rfq.status)}</Badge>
                    </div>
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="title" className="text-xs text-slate-600">
                      Title
                    </Label>
                    <div className="flex items-center gap-2">
                      {isEditingTitle ? (
                        <>
                          <Input
                            id="title"
                            value={titleValue}
                            onChange={(e) => setTitleValue(e.target.value)}
                            placeholder="Enter request title"
                            disabled={savingTitle}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleTitleSave();
                              } else if (e.key === 'Escape') {
                                handleTitleCancel();
                              }
                            }}
                            className="flex-1"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleTitleSave}
                            disabled={savingTitle}
                          >
                            {savingTitle ? 'Saving...' : 'Save'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleTitleCancel}
                            disabled={savingTitle}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Input
                            id="title"
                            value={rfq.title || ''}
                            placeholder="Untitled Request"
                            readOnly
                            className="flex-1"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleTitleEdit}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-slate-600">Customer</Label>
                    <div className="flex items-center gap-2">
                      <p className="flex-1 font-medium text-slate-900">
                        {rfq.customer_name || '—'}
                      </p>
                      <Button variant="ghost" size="sm">
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-slate-600">Project</Label>
                    <p className="font-medium text-slate-900">{rfq.project_name || '—'}</p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Owner</Label>
                    <p className="font-medium text-slate-900">{rfq.owner_name || '—'}</p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Created</Label>
                    <p className="text-sm text-slate-700">
                      {formatRelativeTime(rfq.created_at)}
                    </p>
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-slate-600">Last Updated</Label>
                    <p className="text-sm text-slate-700">
                      {formatRelativeTime(rfq.updated_at)}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="projectType" className="text-xs text-slate-600">
                      Project Type
                    </Label>
                    <Select 
                      value={(rfq as any).project_type || ''} 
                      disabled
                    >
                      <SelectTrigger id="projectType" className="h-8">
                        <SelectValue placeholder="Not set" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="rush">Rush</SelectItem>
                        <SelectItem value="ltpa">LTPA (Long-Term Purchase Agreement)</SelectItem>
                        <SelectItem value="spot">Spot</SelectItem>
                      </SelectContent>
                    </Select>
                    {(rfq as any).project_type && (
                      <p className="text-xs text-slate-500 mt-1">
                        {(rfq as any).project_type === 'rush' && 'Rush projects may prefer China origin for faster delivery'}
                        {(rfq as any).project_type === 'ltpa' && 'LTPA projects prefer Non-China origin for long-term stability'}
                        {(rfq as any).project_type === 'standard' && 'Standard project with flexible origin options'}
                        {(rfq as any).project_type === 'spot' && 'Spot purchase with standard pricing rules'}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Right Column - Commercial Terms */}
            <Card>
              <CardHeader>
                <CardTitle>Commercial Terms</CardTitle>
                <CardDescription>Pricing and delivery conditions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="incoterm" className="text-xs text-slate-600">
                      Incoterm
                    </Label>
                    <Select value={rfq.terms?.incoterm || ''} disabled>
                      <SelectTrigger id="incoterm">
                        <SelectValue placeholder="Select Incoterm" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EXW">EXW</SelectItem>
                        <SelectItem value="FOB">FOB</SelectItem>
                        <SelectItem value="CIF">CIF</SelectItem>
                        <SelectItem value="DDP">DDP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="payment-term" className="text-xs text-slate-600">
                      Payment Term
                    </Label>
                    <Select value={rfq.terms?.payment_term || ''} disabled>
                      <SelectTrigger id="payment-term">
                        <SelectValue placeholder="Select Payment Term" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Net 30">Net 30</SelectItem>
                        <SelectItem value="Net 60">Net 60</SelectItem>
                        <SelectItem value="Net 90">Net 90</SelectItem>
                        <SelectItem value="Prepayment">Prepayment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="validity" className="text-xs text-slate-600">
                      Quote Validity
                    </Label>
                    <Input
                      id="validity"
                      value={
                        rfq.terms?.validity_days
                          ? `${rfq.terms.validity_days} days`
                          : '—'
                      }
                      readOnly
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="currency" className="text-xs text-slate-600">
                      Currency
                    </Label>
                    <Input id="currency" value={rfq.terms?.currency || 'USD'} readOnly />
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-900">Summary Metrics</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-600">Line Items</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {rfq.lineItems?.length || 0}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-600">Pricing Runs</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {rfq.pricingRuns?.length || 0}
                      </p>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <p className="text-xs text-slate-600">Last Pricing Run</p>
                      <p className="text-sm text-slate-700">
                        {rfq.pricingRuns?.[0]?.created_at
                          ? formatRelativeTime(rfq.pricingRuns[0].created_at)
                          : 'Not yet priced'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Optional: Customer Summary Card */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Customer Summary</CardTitle>
                <CardDescription>Historical data for {rfq.customer_name || 'this customer'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-600">Lifetime Requests</p>
                    <p className="text-2xl font-bold text-slate-900">—</p>
                    <p className="text-xs text-slate-500">TODO: Backend integration</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-600">Win Rate</p>
                    <p className="text-2xl font-bold text-slate-900">—</p>
                    <p className="text-xs text-slate-500">TODO: Backend integration</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-600">Active Agreements</p>
                    <p className="text-2xl font-bold text-slate-900">—</p>
                    <p className="text-xs text-slate-500">TODO: Backend integration</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ========================================
            TAB: LINE ITEMS
            ======================================== */}
        <TabsContent value="line-items" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Line Items</CardTitle>
                <CardDescription>
                  Manage items in this request
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Import
                      <ChevronLeft className="ml-1 h-3 w-3 rotate-180" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleImportDocument}>
                      Import Document (OCR)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleUploadCSV}>
                      Upload CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="default" size="sm" onClick={handleAddLineItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Line Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!hasLineItems ? (
                // Empty State
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Package className="mb-4 h-12 w-12 text-slate-400" />
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">
                    No line items yet
                  </h3>
                  <p className="mb-6 max-w-md text-sm text-slate-600">
                    We could not detect BOQ line items from this document. Upload a BOQ or add a line item manually.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="default" onClick={handleAddLineItem}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Line Item
                    </Button>
                    <Button variant="outline" onClick={handleImportDocument}>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload BOQ
                    </Button>
                    <Button variant="outline" onClick={handleUploadCSV}>
                      <FileText className="mr-2 h-4 w-4" />
                      Import
                    </Button>
                  </div>
                </div>
              ) : (
                // Line Items Table
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead className="min-w-[250px]">Description</TableHead>
                        <TableHead className="w-24">Qty</TableHead>
                        <TableHead className="w-20">Unit</TableHead>
                        <TableHead className="w-40">Material</TableHead>
                        <TableHead className="w-32">HS Code</TableHead>
                        <TableHead className="w-24">Origin</TableHead>
                        <TableHead className="w-24">Duty Rate</TableHead>
                        <TableHead className="w-28">Duty Amount</TableHead>
                        <TableHead className="w-24">Final Rate</TableHead>
                        <TableHead className="w-28">Final Amount</TableHead>
                        <TableHead className="w-32">Match</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead className="w-32 text-right">Unit Price</TableHead>
                        <TableHead className="w-40">Pricing Method</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rfq.lineItems?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.line_number}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div>{item.description}</div>
                              {item.has_pricing && item.pricing && (
                                <div className="text-xs text-slate-500">
                                  Total: {formatCurrency(item.pricing.total_price, item.pricing.currency)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell>
                            {item.material_code ? (
                              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                                {item.material_code}
                              </code>
                            ) : (
                              <span className="text-sm italic text-slate-500">Unmatched</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.hs_code ? (
                              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">
                                {item.hs_code}
                              </code>
                            ) : (
                              <span className="text-sm italic text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.origin_country ? (
                              <Badge variant="outline">{item.origin_country}</Badge>
                            ) : (
                              <span className="text-sm italic text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.import_duty_rate !== null && item.import_duty_rate !== undefined
                              ? `${item.import_duty_rate}%`
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {item.import_duty_amount !== null && item.import_duty_amount !== undefined
                              ? formatCurrency(item.import_duty_amount)
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {item.final_import_duty_rate !== null && item.final_import_duty_rate !== undefined
                              ? `${item.final_import_duty_rate}%`
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {item.final_import_duty_amount !== null && item.final_import_duty_amount !== undefined
                              ? formatCurrency(item.final_import_duty_amount)
                              : '—'}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const badge = getHsMatchBadge(item.hs_match_source, item.hs_confidence);
                              return (
                                <Badge variant={badge.variant} className={badge.className}>
                                  {badge.label}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            {item.status === 'matched' ? (
                              <Badge variant="default" className="bg-green-100 text-green-800">
                                Matched
                              </Badge>
                            ) : item.status === 'needs_review' ? (
                              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                                Needs Review
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Unmatched</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.has_pricing && item.pricing ? (
                              <div className="space-y-1">
                                <div className="font-mono text-sm font-semibold text-slate-900">
                                  {formatCurrency(item.pricing.unit_price, item.pricing.currency)}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Base: {formatCurrency(item.pricing.base_cost, item.pricing.currency)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm italic text-slate-400">Not priced</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.has_pricing && item.pricing ? (
                              <div className="space-y-1">
                                {item.pricing.pricing_method === 'agreement' ? (
                                  <>
                                    <Badge variant="default" className="bg-blue-100 text-blue-800">
                                      Agreement
                                    </Badge>
                                    {item.pricing.price_agreement && (
                                      <div className="text-xs">
                                        <Link
                                          to={`/price-agreements/${item.pricing.price_agreement.id}`}
                                          className="text-blue-600 hover:underline"
                                        >
                                          {item.pricing.price_agreement.agreement_code}
                                        </Link>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <Badge variant="outline" className="bg-slate-50 text-slate-700">
                                    Rule-based
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm italic text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingItem(item);
                                  setItemModalOpen(true);
                                }}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveLineItemClick(item)}
                              >
                                <Trash2 className="h-3 w-3 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================
            TAB: PRICING
            ======================================== */}
        <TabsContent value="pricing" className="space-y-4">
          {(rfq.pricingRuns?.length ?? 0) === 0 ? (
            // Empty State
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <TrendingUp className="mb-4 h-12 w-12 text-slate-400" />
                <h3 className="mb-2 text-lg font-semibold text-slate-900">
                  No pricing runs yet
                </h3>
                <p className="mb-6 max-w-md text-sm text-slate-600">
                  Run pricing to generate a price proposal for this commercial request.
                </p>
                <Button
                  variant="default"
                  onClick={handleRunPricing}
                  disabled={!canRunPricing}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Run Pricing
                </Button>
                {!hasLineItems && (
                  <p className="mt-2 text-xs text-slate-500">
                    Add line items first before running pricing
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Current Pricing Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Current Pricing</CardTitle>
                  <CardDescription>Most recent pricing run results</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-600">Total Price</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {formatCurrency(rfq.pricingRuns?.[0]?.total_price)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-600">Margin</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {formatPercent(rfq.pricingRuns?.[0]?.margin_percent)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-600">Items Priced</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {rfq.lineItems?.length || 0}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-600">Pricing Method</p>
                      <p className="text-sm text-slate-700">Rule-based</p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    asChild
                    className="w-full"
                  >
                    <Link to={`/pricing-runs/${rfq.pricingRuns?.[0]?.id}`}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Detailed Pricing
                    </Link>
                  </Button>
                </CardFooter>
              </Card>

              {/* Pricing History Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Pricing History</CardTitle>
                  <CardDescription>All pricing runs for this request</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Version</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Total Price</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Outcome</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rfq.pricingRuns?.map((run) => (
                          <TableRow key={run.id}>
                            <TableCell className="font-medium">v{run.version}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{run.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(run.total_price)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatPercent(run.margin_percent)}
                            </TableCell>
                            <TableCell className="text-sm text-slate-600">
                              {formatRelativeTime(run.created_at)}
                            </TableCell>
                            <TableCell>
                              {run.outcome === 'won' ? (
                                <Badge variant="default" className="bg-green-100 text-green-800">
                                  Won
                                </Badge>
                              ) : run.outcome === 'lost' ? (
                                <Badge variant="destructive">Lost</Badge>
                              ) : (
                                <Badge variant="outline">Pending</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" asChild>
                                <Link to={`/pricing-runs/${run.id}`}>Open</Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ========================================
            TAB: APPROVALS
            ======================================== */}
        <TabsContent value="approvals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pricing Run Approvals</CardTitle>
              <CardDescription>
                Approval status and history for all pricing runs. Approvals are managed at the pricing run level.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pricingRuns.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-slate-600">No pricing runs yet. Run pricing to create a pricing run.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Dedupe by id, sort newest first, show version numbers */}
                  {Array.from(new Map(pricingRuns.map(run => [run.id, run])).values())
                    .sort((a, b) => {
                      // Sort by version_number DESC, then created_at DESC
                      const versionDiff = (b.version_number || 0) - (a.version_number || 0);
                      if (versionDiff !== 0) return versionDiff;
                      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                    })
                    .map((run) => {
                    const history = approvalHistories[run.id] || [];
                    const approvalStatus = run.approval_status || 'draft';
                    const isCurrent = run.is_current === true;
                    const versionLabel = `Run v${run.version_number || 1}`;
                    
                    return (
                      <div
                        key={run.id}
                        className={`rounded-lg border p-4 space-y-3 ${isCurrent ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <h4 className="font-semibold text-slate-900">
                              {versionLabel}
                              {isCurrent && (
                                <Badge variant="default" className="ml-2 bg-blue-600">
                                  Current
                                </Badge>
                              )}
                            </h4>
                            <p className="text-sm text-slate-600">
                              Created {formatRelativeTime(run.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {approvalStatus === 'approved' ? (
                              <Badge className="bg-green-100 text-green-800">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Approved
                              </Badge>
                            ) : approvalStatus === 'pending_approval' ? (
                              <Badge className="bg-amber-100 text-amber-800">
                                <Clock className="mr-1 h-3 w-3" />
                                Pending Approval
                              </Badge>
                            ) : approvalStatus === 'rejected' ? (
                              <Badge className="bg-red-100 text-red-800">
                                <XCircle className="mr-1 h-3 w-3" />
                                Rejected
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Clock className="mr-1 h-3 w-3" />
                                Draft
                              </Badge>
                            )}
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`/pricing-runs/${run.id}`}>View Pricing Run</Link>
                            </Button>
                          </div>
                        </div>

                        {history.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                            <p className="text-xs font-medium text-slate-700">Approval History:</p>
                            {history.map((entry, idx) => (
                              <div
                                key={idx}
                                className="flex items-start gap-2 text-sm"
                              >
                                <div className="mt-0.5">
                                  {entry.action === 'approved' || entry.new_status === 'approved' ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  ) : entry.action === 'rejected' || entry.new_status === 'rejected' ? (
                                    <XCircle className="h-4 w-4 text-red-600" />
                                  ) : (
                                    <Clock className="h-4 w-4 text-amber-600" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-900">
                                      {entry.actor_name || 'System'}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      {formatRelativeTime(entry.created_at)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-600">
                                    {entry.action === 'approved' 
                                      ? 'Approved' 
                                      : entry.action === 'rejected' 
                                      ? 'Rejected' 
                                      : entry.action === 'submitted'
                                      ? 'Submitted for Approval'
                                      : entry.action || 'Status Changed'}
                                    {entry.notes && (
                                      <span className="italic"> - {entry.notes}</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {history.length === 0 && approvalStatus === 'draft' && (
                          <p className="text-sm text-slate-500 italic">
                            No approval history. Go to the pricing run to submit for approval.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================
            TAB: AI INSIGHTS
            ======================================== */}
        {/* ========================================
            TAB: ATTACHMENTS
            ======================================== */}
        <TabsContent value="attachments" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Attachments</CardTitle>
                <CardDescription>Files and documents attached to this commercial request</CardDescription>
              </div>
              <Button variant="default" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                Upload Files
              </Button>
            </CardHeader>
            <CardContent>
              {(rfq.attachments?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Paperclip className="mb-4 h-12 w-12 text-slate-400" />
                  <h3 className="mb-2 text-lg font-semibold text-slate-900">
                    No files attached yet
                  </h3>
                  <p className="mb-6 max-w-md text-sm text-slate-600">
                    Upload documents, images, or other files related to this commercial request.
                  </p>
                  <Button variant="default">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Files
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Filename</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Uploaded By</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rfq.attachments?.map((attachment) => (
                        <TableRow key={attachment.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-500" />
                              {attachment.filename}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{attachment.file_type}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {attachment.uploaded_by}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {formatRelativeTime(attachment.uploaded_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm">
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm">
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-3 w-3 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* RFQ Item Modal */}
      {id && (
        <RfqItemModal
          open={itemModalOpen}
          onClose={() => {
            setItemModalOpen(false);
            setEditingItem(null);
          }}
          item={editingItem}
          rfqId={id}
          onSave={() => {
            loadRfq();
          }}
        />
      )}

      {/* Delete RFQ Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Commercial Request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>{rfq ? getDisplayRfqTitle(rfq) : ''}</strong>{' '}
              ({rfq ? getDisplayRfqCode(rfq) : ''})?
              This action cannot be undone. All associated items, pricing runs, and data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel} disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              variant="destructive"
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Supplier Selection Modal */}
      <AlertDialog open={supplierModalOpen} onOpenChange={setSupplierModalOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Select Supplier for Pricing</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a supplier to assign to all {rfq?.lineItems?.length || 0} items before running pricing.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            {loadingSuppliers ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-slate-500">Loading suppliers...</div>
              </div>
            ) : suppliers.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-slate-500">No suppliers available</div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="supplier-select">Supplier</Label>
                <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                  <SelectTrigger id="supplier-select">
                    <SelectValue placeholder="Select a supplier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{supplier.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {supplier.origin_type === 'BOTH' ? 'China + Non-China' :
                             supplier.origin_type === 'CHINA' ? 'China' : 'Non-China'}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyingSupplier}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSupplierSelected}
              disabled={!selectedSupplierId || applyingSupplier || loadingSuppliers}
            >
              {applyingSupplier ? 'Applying...' : 'Continue to Pricing'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Line Item Confirmation Dialog */}
      <AlertDialog open={deleteItemDialogOpen} onOpenChange={setDeleteItemDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Line Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete line item #{itemToDelete?.line_number}:{' '}
              <strong>{itemToDelete?.description}</strong>?
              <br />
              This action cannot be undone. Any pricing data associated with this item will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleRemoveLineItemCancel} disabled={deletingItem}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveLineItemConfirm}
              disabled={deletingItem}
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
            >
              {deletingItem ? 'Deleting...' : 'Delete Item'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
