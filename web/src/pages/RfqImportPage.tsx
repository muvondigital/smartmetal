/**
 * RfqImportPage - Document Import Workflow
 *
 * Three-step workflow for importing commercial request documents:
 * 1. Upload Document - Drag/drop or browse files
 * 2. AI Extraction - Industry-grade preview with column mapping
 * 3. Review & Create - Final review and RFQ creation
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Upload, FileText, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { uploadOcrFile, postAiParseRfq, createRfq, addRfqItem } from '../api/client';
import type { StructuredOcr, AiParseResponse, RfqMetadata, LineItem, LineItemView } from '../types';
import type { ExtractedItem, ExtractionColumn } from '../types/extraction';
import { ExtractionPreview, ExtractionProgressSteps } from '../components/extraction';
import { RfqMaterialMatcher } from '../components/matching/RfqMaterialMatcher';
import { LineItemsGrid } from '../components/rfq/LineItemsGrid';
import { LineItemInspector } from '../components/rfq/LineItemInspector';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';

type Step = 1 | 2 | 3;

// Feature flag for new extraction preview (can be toggled)
const USE_NEW_EXTRACTION_PREVIEW = true;

export default function RfqImportPage() {
  const navigate = useNavigate();

  // File & OCR state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrStructured, setOcrStructured] = useState<StructuredOcr | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // AI state
  const [aiResult, setAiResult] = useState<AiParseResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Options
  const [autoCreateRfq, setAutoCreateRfq] = useState(true);
  const [attachMaterials, setAttachMaterials] = useState(true);

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Editable state
  const [editMetadata, setEditMetadata] = useState<RfqMetadata | null>(null);
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);

  // Inspector state
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Track if we've shown the toast for this RFQ
  const toastShownRef = useRef<string | null>(null);

  // Show toast when RFQ is auto-created (only once per RFQ)
  useEffect(() => {
    if (currentStep === 3 && aiResult?.created.rfq_id) {
      const rfqId = aiResult.created.rfq_id;
      if (toastShownRef.current !== rfqId) {
        toastShownRef.current = rfqId;
        toast.success('Commercial request created', {
          description: `ID: ${rfqId} — ${aiResult.created.rfq_item_count} items.`,
          duration: 4000,
        });
      }
    }
  }, [currentStep, aiResult]);

  // File handling
  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setOcrError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  // Step 1: OCR Upload
  const handleRunOcr = async () => {
    if (!selectedFile) return;

    setOcrLoading(true);
    setOcrError(null);

    try {
      const result = await uploadOcrFile(selectedFile);
      setOcrStructured(result.structured);

      // With new preview, go directly to AI extraction
      if (USE_NEW_EXTRACTION_PREVIEW) {
        // Run AI extraction immediately
        await handleRunAiWithOcr(result.structured);
      } else {
        setCurrentStep(2);
      }
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : 'Failed to run OCR');
    } finally {
      setOcrLoading(false);
    }
  };

  // Step 2: AI Parse (called after OCR or manually)
  const handleRunAiWithOcr = async (ocrData: StructuredOcr) => {
    setAiLoading(true);
    setAiError(null);

    try {
      const result = await postAiParseRfq(ocrData, {
        autoCreateRfq: false, // Don't auto-create in new flow, let user review first
        attachMaterials,
        originalFilename: selectedFile?.name,
      });
      setAiResult(result);
      setEditMetadata(result.rfq_metadata);
      setEditLineItems(result.line_items);
      setCurrentStep(2); // Go to extraction preview
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Failed to run AI extraction');
      setCurrentStep(2); // Still go to step 2 to show error
    } finally {
      setAiLoading(false);
    }
  };

  // Legacy AI Parse (for old flow)
  const handleRunAi = async () => {
    if (!ocrStructured) return;
    await handleRunAiWithOcr(ocrStructured);
  };

  // Handle continue from extraction preview
  const handleExtractionContinue = (items: ExtractedItem[], columns: ExtractionColumn[]) => {
    // Convert extracted items back to line items
    const lineItems: LineItem[] = items.map((item) => ({
      line_number: item.fields.item_no?.displayValue || null,
      description: item.fields.description?.displayValue || '',
      quantity: parseFloat(item.fields.quantity?.displayValue) || null,
      unit: item.fields.unit?.displayValue || null,
      size: item.fields.size?.displayValue || null,
      size1: null,
      size2: null,
      schedule: null,
      standard: null,
      grade: item.fields.material?.displayValue || null,
      raw_row: item.rawRow || null,
      matched_materials: [],
    }));

    setEditLineItems(lineItems);
    setCurrentStep(3);
  };

  // Handle re-extract from preview
  const handleReExtract = async () => {
    if (!ocrStructured) return;
    await handleRunAiWithOcr(ocrStructured);
  };

  // Step 3: Save RFQ (if not auto-created)
  const handleSaveRfq = async () => {
    if (!editMetadata || !editLineItems.length) return;

    try {
      // Use client_name from metadata
      const rfq = await createRfq({
        customer_name: editMetadata.client_name || 'Unknown Client',
      });

      // Add line items to RFQ
      console.log(`[Import] Adding ${editLineItems.length} items to RFQ ${rfq.id}`);
      let successCount = 0;
      for (const item of editLineItems) {
        try {
          // Get best matched material code if available
          const materialCode =
            item.matched_materials && item.matched_materials.length > 0
              ? item.matched_materials[0].material_code
              : null;

          // Build size_display from size1 and size2
          const sizeDisplay = item.size2 ? `${item.size1} × ${item.size2}` : item.size1 || item.size || null;

          await addRfqItem(rfq.id.toString(), {
            description: item.description || '',
            quantity: item.quantity || 0,
            unit: item.unit || 'PCS',
            material_code: materialCode,
            line_number: item.line_number ? parseInt(String(item.line_number), 10) : null,
            size_display: sizeDisplay,
            size1_raw: item.size1 || null,
            size2_raw: item.size2 || null,
          });
          successCount++;
        } catch (error) {
          console.error(`[Import] Error adding item to RFQ:`, error);
          // Continue with other items
        }
      }

      console.log(`[Import] Successfully added ${successCount} of ${editLineItems.length} items`);
      toast.success('Commercial request created', {
        description: `ID: ${rfq.id} — ${successCount} items.`,
        duration: 4000,
      });
      navigate(`/rfqs/${rfq.id}`);
    } catch (error) {
      alert(`Failed to create commercial request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle line item changes from grid or inspector
  const handleLineItemChange = (index: number, changes: Partial<LineItem>) => {
    const updated = [...editLineItems];
    updated[index] = { ...updated[index], ...changes };
    setEditLineItems(updated);
  };

  // Handle line item selection
  const handleLineItemSelect = (index: number) => {
    setSelectedItemIndex(index);
    setInspectorOpen(true);
  };

  // Get selected item for inspector
  const selectedItemView: LineItemView | null =
    selectedItemIndex !== null && editLineItems[selectedItemIndex]
      ? {
          ...editLineItems[selectedItemIndex],
          id: `line-${selectedItemIndex}`,
          index: selectedItemIndex,
          matchStatus:
            editLineItems[selectedItemIndex].matched_materials &&
            editLineItems[selectedItemIndex].matched_materials.length > 0
              ? editLineItems[selectedItemIndex].matched_materials[0].score >= 0.8
                ? 'matched'
                : 'partial'
              : 'unmatched',
          category: editLineItems[selectedItemIndex].description?.toLowerCase().includes('pipe')
            ? 'PIPE'
            : editLineItems[selectedItemIndex].description?.toLowerCase().includes('flange')
            ? 'FLANGE'
            : 'OTHER',
        }
      : null;

  return (
    <div className={cn(
      "mx-auto px-6 py-8",
      // Use full width for extraction preview (step 2), constrained width for other steps
      currentStep === 2 ? "max-w-[1600px]" : "max-w-7xl"
    )}>
      {/* Page Header - Hidden during extraction preview as it has its own header */}
      {currentStep !== 2 && (
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Import Document</h1>
          <p className="text-sm text-slate-600">
            Upload a document (RFQ, RFP, MTO, BOM, PDF, or image) and let Pricer extract line items to create a
            commercial request.
          </p>
        </div>
      )}

      {/* Step 1: Upload */}
      {currentStep === 1 && (
        <div className="space-y-6">
          {/* Progress Steps */}
          <ExtractionProgressSteps currentStep={1} />

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Upload Document</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={cn(
                  'border-2 border-dashed rounded-xl p-12 text-center transition-all',
                  selectedFile
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                )}
              >
                {selectedFile ? (
                  <div className="space-y-3">
                    <div className="w-16 h-16 mx-auto rounded-xl bg-teal-100 flex items-center justify-center">
                      <FileText className="w-8 h-8 text-teal-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{selectedFile.name}</p>
                      <p className="text-sm text-slate-500 mt-1">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)} className="text-slate-600">
                      Remove file
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-xl bg-slate-100 flex items-center justify-center">
                      <Upload className="w-8 h-8 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-slate-600 mb-1">Drag and drop your document here</p>
                      <p className="text-sm text-slate-500">or</p>
                    </div>
                    <label className="cursor-pointer">
                      <Button asChild>
                        <span>Browse Files</span>
                      </Button>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.txt,.html"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(file);
                        }}
                      />
                    </label>
                    <p className="text-xs text-slate-500">Supported: RFQ, RFP, MTO, BOM, PDF, Images, Office documents</p>
                  </div>
                )}
              </div>

              {/* Options */}
              <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                <h3 className="text-sm font-medium text-slate-700">Options</h3>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="attachMaterials"
                    checked={attachMaterials}
                    onCheckedChange={(checked) => setAttachMaterials(!!checked)}
                  />
                  <Label htmlFor="attachMaterials" className="text-sm text-slate-600 cursor-pointer">
                    Match materials for each extracted item
                  </Label>
                </div>
              </div>

              {ocrError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-sm">{ocrError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end">
                <Button onClick={handleRunOcr} disabled={!selectedFile || ocrLoading} className="gap-2">
                  {ocrLoading ? (
                    <>Processing...</>
                  ) : (
                    <>
                      Extract Document
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: New Extraction Preview */}
      {currentStep === 2 && USE_NEW_EXTRACTION_PREVIEW && ocrStructured && (
        <ExtractionPreview
          ocrData={ocrStructured}
          aiResult={aiResult}
          originalFilename={selectedFile?.name}
          onContinue={handleExtractionContinue}
          onReExtract={handleReExtract}
          onBack={() => setCurrentStep(1)}
          isLoading={aiLoading}
        />
      )}

      {/* Step 3: Review & Save */}
      {currentStep === 3 && editMetadata && editLineItems.length > 0 && (
        <div className="space-y-6">
          {/* Progress Steps */}
          <ExtractionProgressSteps currentStep={3} />

          {aiResult?.confidence && (
            <div
              className={cn(
                'rounded-xl border p-4',
                aiResult.confidence.extraction >= 0.8
                  ? 'bg-green-50 border-green-200'
                  : aiResult.confidence.extraction >= 0.6
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-orange-50 border-orange-200'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    Extraction Confidence: {Math.round(aiResult.confidence.extraction * 100)}%
                  </span>
                  {aiResult.confidence.warnings_count > 0 && (
                    <span className="text-xs text-slate-600">
                      ({aiResult.confidence.warnings_count} warning{aiResult.confidence.warnings_count !== 1 ? 's' : ''})
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Main content: Metadata + Line Items */}
          <div className="grid grid-cols-[320px_1fr] gap-6">
            {/* Request Metadata */}
            <Card className="shadow-sm h-fit">
              <CardHeader>
                <CardTitle className="text-base">Request Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-slate-500 uppercase">Client Name</Label>
                  <input
                    type="text"
                    value={editMetadata.client_name || ''}
                    onChange={(e) => setEditMetadata({ ...editMetadata, client_name: e.target.value || null })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500 uppercase">Reference</Label>
                  <input
                    type="text"
                    value={editMetadata.rfq_reference || ''}
                    onChange={(e) => setEditMetadata({ ...editMetadata, rfq_reference: e.target.value || null })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500 uppercase">Date</Label>
                  <input
                    type="text"
                    value={editMetadata.rfq_date || ''}
                    onChange={(e) => setEditMetadata({ ...editMetadata, rfq_date: e.target.value || null })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500 uppercase">Payment Terms</Label>
                  <input
                    type="text"
                    value={editMetadata.payment_terms || ''}
                    onChange={(e) => setEditMetadata({ ...editMetadata, payment_terms: e.target.value || null })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500 uppercase">Delivery Terms</Label>
                  <input
                    type="text"
                    value={editMetadata.delivery_terms || ''}
                    onChange={(e) => setEditMetadata({ ...editMetadata, delivery_terms: e.target.value || null })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-500 uppercase">Remarks</Label>
                  <textarea
                    value={editMetadata.remarks || ''}
                    onChange={(e) => setEditMetadata({ ...editMetadata, remarks: e.target.value || null })}
                    rows={3}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Line Items Grid */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Line Items ({editLineItems.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <LineItemsGrid items={editLineItems} onItemChange={handleLineItemChange} onItemSelect={handleLineItemSelect} />
              </CardContent>
            </Card>
          </div>

          {/* Line Item Inspector Panel */}
          <LineItemInspector
            item={selectedItemView}
            open={inspectorOpen}
            onOpenChange={(open) => {
              setInspectorOpen(open);
              if (!open) {
                setSelectedItemIndex(null);
              }
            }}
            onItemChange={handleLineItemChange}
          />

          {/* Material Matches Panel */}
          {editLineItems.some((item) => item.matched_materials && item.matched_materials.length > 0) && (
            <RfqMaterialMatcher
              rfqId={aiResult?.created.rfq_id || 'import-preview'}
              rfqLineItems={editLineItems.map((item, idx) => ({
                id: `import-${idx}`,
                line_number: item.line_number ? parseInt(String(item.line_number), 10) : idx + 1,
                description: item.description || '',
                quantity: item.quantity || 0,
                unit: item.unit || 'PCS',
                material_code: item.matched_materials?.[0]?.material_code || null,
                matched_materials: item.matched_materials || [],
              }))}
            />
          )}

          {/* Action Buttons */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(2)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Extraction
            </Button>
            <div className="flex gap-3">
              {!aiResult?.created.rfq_id && (
                <Button
                  onClick={handleSaveRfq}
                  className="gap-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700"
                >
                  <Check className="w-4 h-4" />
                  Create Commercial Request
                </Button>
              )}
              {aiResult?.created.rfq_id && (
                <Button onClick={() => navigate(`/rfqs/${aiResult.created.rfq_id}`)} className="gap-2 bg-green-600 hover:bg-green-700">
                  <Check className="w-4 h-4" />
                  View Request
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
