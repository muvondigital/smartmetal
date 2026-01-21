/**
 * Pricing Run Detail Page
 *
 * Displays detailed information for a single pricing run/quote.
 * Accessible via /pricing-runs/:id route from dashboard tables.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Download, Send, Edit, CheckCircle, Clock, FileText } from 'lucide-react';
import { getQuoteById, API_BASE_URL, getAuthHeaders } from '../api/client';
import { Quote } from '../components/dashboard/DataTable';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { getStatusBadgeClass, getStatusLabel } from '../lib/statusHelpers';
import { formatCurrency, formatDate } from '../lib/formatters';
import { ApprovalHistory } from '../components/approvals/ApprovalHistory';
import { submitForApproval, getApprovalHistory, ApprovalHistoryItem } from '../services/approvalsApi';
import { TaxBreakdown } from '../components/pricing/TaxBreakdown';
import { getPricingRunById, PricingRun, PricingRunItem } from '../services/pricingRunsApi';
import { DualPricingDisplay, DualPricingData, OriginSelectionData } from '../components/pricing/DualPricingDisplay';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export default function PricingRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pricingRun, setPricingRun] = useState<PricingRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Helper function to safely convert percentage values to display format
  const formatPercentage = (value: number | string | null | undefined, decimals: number = 1): string => {
    const numValue = typeof value === 'number' 
      ? value 
      : value != null 
        ? Number(value) 
        : 0;
    return isNaN(numValue) ? '0.0' : numValue.toFixed(decimals);
  };

  useEffect(() => {
    if (id) {
      loadQuote(id);
      loadPricingRun(id);
    }
  }, [id]);

  const loadQuote = async (quoteId: string) => {
    try {
      const data = await getQuoteById(quoteId);
      setQuote(data);
    } catch (err) {
      console.error('Failed to load quote:', err);
    }
  };

  const loadPricingRun = async (pricingRunId: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPricingRunById(pricingRunId);
      setPricingRun(data);
      
      // Load approval history
      try {
        const history = await getApprovalHistory(pricingRunId);
        setApprovalHistory(history);
      } catch (err) {
        console.error('Failed to load approval history:', err);
      }
    } catch (err) {
      console.error('Failed to load pricing run:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pricing run details');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!id) return;

    const submittedBy = prompt('Enter your name:');
    const submittedByEmail = prompt('Enter your email:');
    const notes = prompt('Notes (optional):');

    if (!submittedBy) {
      alert('Name is required');
      return;
    }

    try {
      setSubmitting(true);
      await submitForApproval(id, {
        submitted_by: submittedBy,
        submitted_by_email: submittedByEmail || undefined,
        notes: notes || undefined,
      });
      
      // Show success message
      toast.success('Pricing run submitted for approval', {
        description: 'Redirecting to approval queue...',
        duration: 2000,
      });
      
      // Redirect to approval queue after a brief delay so user sees the success message
      setTimeout(() => {
        navigate('/approvals');
      }, 500);
    } catch (err) {
      console.error('Failed to submit for approval:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit for approval';
      toast.error('Submission failed', {
        description: errorMessage,
        duration: 4000,
      });
      setSubmitting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!id) return;

    try {
      setExportingPdf(true);

      // Call the PDF export endpoint
      const response = await fetch(`${API_BASE_URL}/pdf/pricing-runs/${id}?download=true`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to generate PDF' }));
        throw new Error(errorData.error || 'Failed to generate PDF');
      }

      // Get the PDF blob
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NSC_Quote_${id.slice(0, 8).toUpperCase()}_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert(err instanceof Error ? err.message : 'Failed to export PDF');
    } finally {
      setExportingPdf(false);
    }
  };


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="text-slate-600">Loading quote details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 max-w-md">
          <h3 className="text-rose-900 font-semibold mb-2">Error Loading Quote</h3>
          <p className="text-rose-700 text-sm mb-4">{error}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/dashboard')}
            >
              Back to Dashboard
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => id && loadQuote(id)}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 max-w-md text-center">
          <h3 className="text-slate-900 font-semibold mb-2">Quote Not Found</h3>
          <p className="text-slate-600 text-sm mb-4">
            The requested quote could not be found.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header Section */}
      <section className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="border-l border-slate-200 h-8" />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">{quote.name}</h1>
              <Badge 
                variant="outline" 
                className={getStatusBadgeClass(
                  pricingRun?.approval_status 
                    ? (pricingRun.approval_status === 'pending_approval' ? 'pending' : pricingRun.approval_status)
                    : (quote.status || 'draft')
                )}
              >
                {getStatusLabel(
                  pricingRun?.approval_status 
                    ? (pricingRun.approval_status === 'pending_approval' ? 'pending' : pricingRun.approval_status)
                    : (quote.status || 'draft')
                )}
              </Badge>
            </div>
            <p className="text-slate-600 text-sm mt-1">
              {quote.customer} • {quote.revision} • Created {quote.createdOn ? formatDate(quote.createdOn) : 'N/A'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Edit className="w-4 h-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExportPdf}
            disabled={exportingPdf}
          >
            <Download className="w-4 h-4" />
            {exportingPdf ? 'Generating...' : 'Export PDF'}
          </Button>
          {/* Only show Submit button if pricing run is in draft status (not yet submitted) */}
          {pricingRun && (pricingRun.approval_status === 'draft' || pricingRun.approval_status === null) && (
            <Button 
              size="sm" 
              className="gap-2 bg-teal-600 hover:bg-teal-700 text-white"
              onClick={handleSubmitForApproval}
              disabled={submitting}
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </Button>
          )}
          
          {/* Show approval status info if already submitted */}
          {pricingRun && pricingRun.approval_status === 'pending_approval' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-amber-900 font-medium">Pending Approval</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/approvals')}
                className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
              >
                View in Queue
              </Button>
            </div>
          )}
          
          {/* Show approved status if already approved */}
          {pricingRun && pricingRun.approval_status === 'approved' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="text-sm text-emerald-900 font-medium">
                Approved{pricingRun.approved_by ? ` by ${pricingRun.approved_by}` : ''}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-slate-600 text-sm">Total Value</p>
              <p className="text-slate-900 text-2xl font-semibold">{formatCurrency(quote.total || 0)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-slate-600 text-sm">Next Action</p>
              <p className="text-slate-900 text-lg font-semibold">{quote.nextAction || 'Review'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-slate-600 text-sm">Status</p>
              <p className="text-slate-900 text-lg font-semibold">
                {getStatusLabel(
                  pricingRun?.approval_status 
                    ? (pricingRun.approval_status === 'pending_approval' ? 'pending' : pricingRun.approval_status)
                    : (quote.status || 'draft')
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quote Details Section */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-slate-900 font-semibold">Quote Details</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm text-slate-600 block mb-1">Customer</label>
              <p className="text-slate-900">{quote.customer}</p>
            </div>
            <div>
              <label className="text-sm text-slate-600 block mb-1">Revision</label>
              <p className="text-slate-900">{quote.revision}</p>
            </div>
            <div>
              <label className="text-sm text-slate-600 block mb-1">Created On</label>
              <p className="text-slate-900">{quote.createdOn ? formatDate(quote.createdOn) : 'N/A'}</p>
            </div>
            {quote.approvedOn && (
              <div>
                <label className="text-sm text-slate-600 block mb-1">Approved On</label>
                <p className="text-slate-900">{formatDate(quote.approvedOn)}</p>
              </div>
            )}
            <div>
              <label className="text-sm text-slate-600 block mb-1">Total Value</label>
              <p className="text-slate-900 text-lg font-semibold">{formatCurrency(quote.total || 0)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Summary Section - Phase 9: Enhanced Landed Cost Breakdown */}
      {pricingRun && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-slate-900 font-semibold">Pricing Summary</h3>
          </div>
          <div className="p-6 space-y-6">
            {/* Base Pricing */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3">Base Pricing</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm text-slate-600 block mb-1">Subtotal</label>
                  <p className="text-slate-900 text-lg font-semibold">
                    {formatCurrency(pricingRun.total_price, pricingRun.currency)}
                  </p>
                </div>
              </div>
            </div>

            {/* Import Duties */}
            {(pricingRun.total_import_duty !== null && pricingRun.total_import_duty !== undefined) ||
             (pricingRun.total_final_import_duty !== null && pricingRun.total_final_import_duty !== undefined) ? (
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-3">Import Duties</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {pricingRun.total_import_duty !== null && pricingRun.total_import_duty !== undefined && (
                    <div>
                      <label className="text-sm text-slate-600 block mb-1">Total Import Duty</label>
                      <p className="text-slate-900 text-lg font-semibold">
                        {formatCurrency(pricingRun.total_import_duty, pricingRun.currency)}
                      </p>
                    </div>
                  )}
                  {pricingRun.total_final_import_duty !== null && pricingRun.total_final_import_duty !== undefined && (
                    <div>
                      <label className="text-sm text-slate-600 block mb-1">Final Import Duty</label>
                      <p className="text-slate-900 text-lg font-semibold">
                        {formatCurrency(pricingRun.total_final_import_duty, pricingRun.currency)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Phase 9: Logistics Cost Breakdown */}
            {(pricingRun.total_freight_cost !== null && pricingRun.total_freight_cost !== undefined) ||
             (pricingRun.total_insurance_cost !== null && pricingRun.total_insurance_cost !== undefined) ||
             (pricingRun.total_handling_cost !== null && pricingRun.total_handling_cost !== undefined) ||
             (pricingRun.total_local_charges !== null && pricingRun.total_local_charges !== undefined) ? (
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-3">Logistics Costs</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {pricingRun.total_freight_cost !== null && pricingRun.total_freight_cost !== undefined && (
                    <div>
                      <label className="text-sm text-slate-600 block mb-1">Total Freight</label>
                      <p className="text-slate-900 text-lg font-semibold">
                        {formatCurrency(pricingRun.total_freight_cost, pricingRun.currency)}
                      </p>
                    </div>
                  )}
                  {pricingRun.total_insurance_cost !== null && pricingRun.total_insurance_cost !== undefined && (
                    <div>
                      <label className="text-sm text-slate-600 block mb-1">Total Insurance</label>
                      <p className="text-slate-900 text-lg font-semibold">
                        {formatCurrency(pricingRun.total_insurance_cost, pricingRun.currency)}
                      </p>
                    </div>
                  )}
                  {pricingRun.total_handling_cost !== null && pricingRun.total_handling_cost !== undefined && (
                    <div>
                      <label className="text-sm text-slate-600 block mb-1">Total Handling</label>
                      <p className="text-slate-900 text-lg font-semibold">
                        {formatCurrency(pricingRun.total_handling_cost, pricingRun.currency)}
                      </p>
                    </div>
                  )}
                  {pricingRun.total_local_charges !== null && pricingRun.total_local_charges !== undefined && (
                    <div>
                      <label className="text-sm text-slate-600 block mb-1">Total Local Charges</label>
                      <p className="text-slate-900 text-lg font-semibold">
                        {formatCurrency(pricingRun.total_local_charges, pricingRun.currency)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Legacy freight/other charges (Phase 5) - shown if Phase 9 data not available */}
            {!(pricingRun.total_freight_cost !== null && pricingRun.total_freight_cost !== undefined) &&
             ((pricingRun.freight_cost !== null && pricingRun.freight_cost !== undefined) ||
              (pricingRun.other_charges !== null && pricingRun.other_charges !== undefined)) ? (
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-3">Other Costs</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {pricingRun.freight_cost !== null && pricingRun.freight_cost !== undefined && (
                    <div>
                      <label className="text-sm text-slate-600 block mb-1">Freight Cost</label>
                      <p className="text-slate-900 text-lg font-semibold">
                        {formatCurrency(pricingRun.freight_cost, pricingRun.currency)}
                      </p>
                    </div>
                  )}
                  {pricingRun.other_charges !== null && pricingRun.other_charges !== undefined && (
                    <div>
                      <label className="text-sm text-slate-600 block mb-1">Other Charges</label>
                      <p className="text-slate-900 text-lg font-semibold">
                        {formatCurrency(pricingRun.other_charges, pricingRun.currency)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Total Landed Cost */}
            {(pricingRun.total_landed_cost !== null && pricingRun.total_landed_cost !== undefined) ? (
              <div className="border-t-2 border-slate-300 pt-4">
                <div className="flex justify-between items-center">
                  <label className="text-base font-semibold text-slate-700">Total Landed Cost</label>
                  <p className="text-slate-900 text-2xl font-bold">
                    {formatCurrency(pricingRun.total_landed_cost, pricingRun.currency)}
                  </p>
                </div>
              </div>
            ) : (
              /* Fallback to legacy calculation if Phase 9 total not available */
              (pricingRun.total_final_import_duty !== null || pricingRun.freight_cost !== null || pricingRun.other_charges !== null) && (
                <div className="border-t-2 border-slate-300 pt-4">
                  <div className="flex justify-between items-center">
                    <label className="text-base font-semibold text-slate-700">Final Landed Cost Total</label>
                    <p className="text-slate-900 text-2xl font-bold">
                      {formatCurrency(
                        pricingRun.total_price +
                          (pricingRun.total_final_import_duty || 0) +
                          (pricingRun.freight_cost || 0) +
                          (pricingRun.other_charges || 0),
                        pricingRun.currency
                      )}
                    </p>
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* Line Items Section */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-slate-900 font-semibold">Line Items</h3>
        </div>
        <div className="p-6">
          {pricingRun?.items && pricingRun.items.length > 0 ? (
            <div className="space-y-6">
              {pricingRun.items.map((item: PricingRunItem) => {
                // Parse dual pricing data if available
                let dualPricingData: DualPricingData | null = null;
                let originSelectionData: OriginSelectionData | null = null;

                try {
                  if (item.dual_pricing_data) {
                    dualPricingData = typeof item.dual_pricing_data === 'string' 
                      ? JSON.parse(item.dual_pricing_data)
                      : item.dual_pricing_data;
                  }
                  if (item.origin_selection_data) {
                    originSelectionData = typeof item.origin_selection_data === 'string'
                      ? JSON.parse(item.origin_selection_data)
                      : item.origin_selection_data;
                  }
                } catch (err) {
                  console.warn('Failed to parse dual pricing data:', err);
                }

                return (
                  <div key={item.id} className="border border-slate-200 rounded-lg p-4 space-y-4">
                    {/* Item Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">
                          {item.rfq_item_description || item.description || 'Line Item'}
                        </h4>
                        <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                          <span>Qty: {item.rfq_item_quantity || item.quantity} {item.rfq_item_unit || item.unit}</span>
                          {item.material_code && (
                            <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                              {item.material_code}
                            </span>
                          )}
                          {item.hs_code && (
                            <span className="font-mono text-xs bg-blue-100 px-2 py-0.5 rounded">
                              HS: {item.hs_code}
                            </span>
                          )}
                          {item.origin_country && (
                            <Badge variant="outline">Origin: {item.origin_country}</Badge>
                          )}
                          {item.origin_type && (
                            <Badge variant="outline">{item.origin_type}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-600">Unit Price</div>
                        <div className="text-lg font-semibold text-slate-900">
                          {formatCurrency(item.unit_price, item.currency)}
                        </div>
                        <div className="text-sm text-slate-600">Total</div>
                        <div className="text-xl font-bold text-slate-900">
                          {formatCurrency(item.total_price, item.currency)}
                        </div>
                      </div>
                    </div>

                    {/* Dual Pricing Display - Always show */}
                    <div className="border-t border-slate-200 pt-4">
                      <h5 className="text-sm font-semibold text-slate-900 mb-3">Dual-Origin Pricing Options</h5>
                      <DualPricingDisplay
                        dualPricingData={dualPricingData}
                        originSelectionData={originSelectionData}
                        quantity={item.rfq_item_quantity || item.quantity}
                        currency={item.currency}
                        itemDescription={item.rfq_item_description || item.description}
                        fallbackItemData={!dualPricingData ? {
                          origin_type: item.origin_type,
                          unit_price: item.unit_price,
                          total_price: item.total_price,
                          base_cost: item.base_cost,
                          markup_pct: item.markup_pct,
                          logistics_cost: item.logistics_cost,
                          risk_pct: item.risk_pct,
                        } : undefined}
                      />
                    </div>

                    {/* Pricing Breakdown */}
                    <div className="border-t border-slate-200 pt-4">
                      <div className="grid grid-cols-6 gap-4 text-sm">
                        <div>
                          <span className="text-slate-600">Base Cost</span>
                          <div className="font-medium text-slate-900">
                            {formatCurrency(item.base_cost, item.currency)}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-600">Markup</span>
                          <div className="font-medium text-slate-900">
                            {formatPercentage(item.markup_pct)}%
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-600">Logistics</span>
                          <div className="font-medium text-slate-900">
                            {formatCurrency(item.logistics_cost, item.currency)}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-600">Duty Amount</span>
                          <div className="font-medium text-slate-900">
                            {item.import_duty_amount !== null && item.import_duty_amount !== undefined
                              ? formatCurrency(item.import_duty_amount, item.currency)
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-600">Final Duty</span>
                          <div className="font-medium text-slate-900">
                            {item.final_import_duty_amount !== null && item.final_import_duty_amount !== undefined
                              ? formatCurrency(item.final_import_duty_amount, item.currency)
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-600">Risk Buffer</span>
                          <div className="font-medium text-slate-900">
                            {formatPercentage(item.risk_pct)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Phase 9: Logistics Cost Breakdown - per item */}
                    {(item.freight_cost !== null || item.insurance_cost !== null || 
                      item.handling_cost !== null || item.local_charges !== null) && (
                      <div className="border-t border-slate-200 pt-4">
                        <h5 className="text-sm font-semibold text-slate-700 mb-3">Logistics Cost Breakdown</h5>
                        <div className="grid grid-cols-5 gap-4 text-sm">
                          <div>
                            <span className="text-slate-600">Freight</span>
                            <div className="font-medium text-slate-900">
                              {item.freight_cost !== null && item.freight_cost !== undefined
                                ? formatCurrency(item.freight_cost, item.currency)
                                : '—'}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-600">Insurance</span>
                            <div className="font-medium text-slate-900">
                              {item.insurance_cost !== null && item.insurance_cost !== undefined
                                ? formatCurrency(item.insurance_cost, item.currency)
                                : '—'}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-600">Handling</span>
                            <div className="font-medium text-slate-900">
                              {item.handling_cost !== null && item.handling_cost !== undefined
                                ? formatCurrency(item.handling_cost, item.currency)
                                : '—'}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-600">Local Charges</span>
                            <div className="font-medium text-slate-900">
                              {item.local_charges !== null && item.local_charges !== undefined
                                ? formatCurrency(item.local_charges, item.currency)
                                : '—'}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-600 font-semibold">Item Landed Cost</span>
                            <div className="font-bold text-slate-900">
                              {item.item_landed_cost !== null && item.item_landed_cost !== undefined
                                ? formatCurrency(item.item_landed_cost, item.currency)
                                : '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              No line items found
            </div>
          )}
        </div>
      </section>

      {/* Approval History */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-slate-900 font-semibold">Approval History</h3>
        </div>
        <div className="p-6">
          <ApprovalHistory history={approvalHistory} />
        </div>
      </section>
    </div>
  );
}
