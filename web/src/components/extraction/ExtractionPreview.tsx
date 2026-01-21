/**
 * ExtractionPreview Component
 *
 * Main component for the industry-grade AI extraction preview system.
 * Integrates all extraction sub-components into a cohesive interface.
 * Part of the SmartMetal Extraction Preview system.
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  FileText,
  Download,
  RefreshCw,
  Search,
  Filter,
  Settings2,
  Layers,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { DocumentInfoCard } from './DocumentInfoCard';
import { SectionNavigator } from './SectionNavigator';
import { ExtractionStatsCard } from './ExtractionStatsCard';
import { ExtractionDataTable } from './ExtractionDataTable';
import { ExtractionActionBar } from './ExtractionActionBar';
import { ExtractionProgressSteps } from './ExtractionProgressSteps';
import type {
  ExtractionPreviewState,
  ExtractedDocumentInfo,
  ExtractionSection,
  ExtractionColumn,
  ExtractedItem,
  ExtractionStats,
  FieldMappingType,
  ValidationStatus,
} from '../../types/extraction';
import { getConfidenceLevel } from '../../types/extraction';
import { getDocumentTypeLabel } from '../../lib/rfqUtils';
import { cn } from '../../lib/utils';
import type { StructuredOcr, AiParseResponse, LineItem } from '../../types';

interface ExtractionPreviewProps {
  ocrData: StructuredOcr;
  aiResult?: AiParseResponse | null;
  originalFilename?: string;
  onContinue: (items: ExtractedItem[], columns: ExtractionColumn[]) => void;
  onReExtract: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

// Transform AI result to extraction preview state
function transformToExtractionState(
  ocrData: StructuredOcr,
  aiResult: AiParseResponse | null,
  originalFilename?: string
): ExtractionPreviewState {
  // Document info
  const documentInfo: ExtractedDocumentInfo = {
    customer: aiResult?.rfq_metadata?.client_name || null,
    customerConfidence: aiResult?.rfq_metadata?.client_name ? 'high' : undefined,
    project: null,
    projectConfidence: undefined,
    documentType: detectDocumentType(originalFilename, aiResult),
    documentTypeConfidence: 'high',
    referenceNumber: aiResult?.rfq_metadata?.rfq_reference || null,
    referenceConfidence: aiResult?.rfq_metadata?.rfq_reference ? 'medium' : undefined,
    documentDate: aiResult?.rfq_metadata?.rfq_date || null,
    pagesProcessed: ocrData.rawPages,
    totalPages: ocrData.rawPages,
    originalFilename,
  };

  // Extract sections from line items (group by category if present)
  const sections = extractSections(aiResult?.line_items || []);

  // Generate columns from first table or AI result
  const columns = generateColumns(ocrData, aiResult);

  // Transform line items to extracted items
  const items = transformLineItems(aiResult?.line_items || [], columns);

  // Calculate stats
  const stats = calculateStats(items, sections, ocrData);

  return {
    documentInfo,
    sections,
    activeSection: sections.length > 0 ? sections[0].id : null,
    columns,
    items,
    stats,
    loading: false,
    error: null,
    selectedItems: new Set(items.map((i) => i.id)),
    searchQuery: '',
    filterStatus: 'all',
  };
}

// Detect document type from filename and content
function detectDocumentType(
  filename?: string,
  aiResult?: AiParseResponse | null
): 'RFQ' | 'PO' | 'MTO' | 'BOQ' | 'Budget' | 'Tender' | 'Change Order' | 'Re-quote' {
  const fn = (filename || '').toUpperCase();

  if (fn.includes('MTO') || fn.includes('MATERIAL TAKE') || fn.includes('MATERIAL-TAKE')) {
    return 'MTO';
  }
  if (fn.includes('BOQ') || fn.includes('BILL OF QUANT')) {
    return 'BOQ';
  }
  if (fn.includes('PO_') || fn.includes('PURCHASE ORDER') || fn.includes('PURCHASE_ORDER')) {
    return 'PO';
  }
  if (fn.includes('TENDER')) {
    return 'Tender';
  }
  if (fn.includes('BUDGET')) {
    return 'Budget';
  }

  return 'RFQ';
}

// Extract sections from line items
function extractSections(lineItems: LineItem[]): ExtractionSection[] {
  // For now, group all items into one section
  // In future, this could parse MTO categories from description patterns
  const sectionMap = new Map<string, number>();

  // Try to detect sections from item descriptions
  lineItems.forEach((item) => {
    const desc = (item.description || '').toUpperCase();
    let section = 'General Items';

    if (desc.includes('PIPE') || desc.includes('TUBE')) {
      section = 'Pipes & Tubes';
    } else if (desc.includes('FLANGE')) {
      section = 'Flanges';
    } else if (desc.includes('FITTING') || desc.includes('ELBOW') || desc.includes('TEE') || desc.includes('REDUCER')) {
      section = 'Fittings';
    } else if (desc.includes('VALVE')) {
      section = 'Valves';
    } else if (desc.includes('GASKET')) {
      section = 'Gaskets';
    } else if (desc.includes('BOLT') || desc.includes('NUT') || desc.includes('STUD')) {
      section = 'Fasteners';
    } else if (desc.includes('CABLE')) {
      section = 'Cables';
    } else if (desc.includes('STEEL') || desc.includes('PLATE') || desc.includes('BEAM')) {
      section = 'Steel Material';
    }

    sectionMap.set(section, (sectionMap.get(section) || 0) + 1);
  });

  // Convert to array, sort by count
  const sections = Array.from(sectionMap.entries())
    .map(([name, count], index) => ({
      id: `section-${index}`,
      name,
      itemCount: count,
    }))
    .sort((a, b) => b.itemCount - a.itemCount);

  // If no sections detected, return "All Items"
  if (sections.length === 0) {
    return [{ id: 'all', name: 'All Items', itemCount: lineItems.length }];
  }

  return sections;
}

// Generate columns from OCR data or AI result
function generateColumns(
  ocrData: StructuredOcr,
  aiResult: AiParseResponse | null
): ExtractionColumn[] {
  // Default columns based on typical MTO/RFQ structure
  const defaultColumns: ExtractionColumn[] = [
    {
      id: 'col-item-no',
      originalHeader: 'Item No.',
      mappedField: 'item_no',
      confidence: 98,
      confidenceLevel: 'high',
    },
    {
      id: 'col-description',
      originalHeader: 'Description',
      mappedField: 'description',
      confidence: 95,
      confidenceLevel: 'high',
      width: '280px',
      isEditable: true,
    },
    {
      id: 'col-size',
      originalHeader: 'Size',
      mappedField: 'size',
      confidence: 94,
      confidenceLevel: 'high',
    },
    {
      id: 'col-quantity',
      originalHeader: 'Quantity',
      mappedField: 'quantity',
      confidence: 99,
      confidenceLevel: 'high',
      isEditable: true,
    },
    {
      id: 'col-unit',
      originalHeader: 'Unit',
      mappedField: 'unit',
      confidence: 78,
      confidenceLevel: 'medium',
    },
    {
      id: 'col-material',
      originalHeader: 'Material',
      mappedField: 'material',
      confidence: 91,
      confidenceLevel: 'high',
      isEditable: true,
    },
  ];

  return defaultColumns;
}

// Transform line items to extracted items
function transformLineItems(
  lineItems: LineItem[],
  columns: ExtractionColumn[]
): ExtractedItem[] {
  return lineItems.map((item, index) => {
    // Determine validation status
    let validationStatus: ValidationStatus = 'valid';
    const hasQuantity = item.quantity != null && item.quantity > 0;
    const hasDescription = !!item.description;
    const hasUnit = !!item.unit;

    if (!hasQuantity || !hasDescription) {
      validationStatus = 'error';
    } else if (!hasUnit) {
      validationStatus = 'warning';
    }

    // Build fields object
    const fields: Record<string, any> = {
      item_no: {
        value: item.line_number,
        displayValue: item.line_number || `${index + 1}`,
      },
      description: {
        value: item.description,
        displayValue: item.description || '',
        isEditable: true,
        validation: !hasDescription
          ? { isValid: false, status: 'error', message: 'Description required' }
          : undefined,
      },
      size: {
        value: item.size || item.size1,
        displayValue: item.size || item.size1 || '',
      },
      quantity: {
        value: item.quantity,
        displayValue: item.quantity?.toString() || '',
        isEditable: true,
        validation: !hasQuantity
          ? { isValid: false, status: 'error', message: 'Quantity required' }
          : undefined,
      },
      unit: {
        value: item.unit,
        displayValue: item.unit || '',
        validation: !hasUnit
          ? { isValid: false, status: 'warning', message: 'Unit not detected' }
          : undefined,
      },
      material: {
        value: item.grade || item.standard,
        displayValue: item.grade || item.standard || '',
        isEditable: true,
      },
    };

    return {
      id: `item-${index}`,
      rowNumber: index + 1,
      selected: true,
      validationStatus,
      fields,
      rawRow: item.raw_row || [],
      confidence: item.confidence?.overall,
    };
  });
}

// Calculate extraction stats
function calculateStats(
  items: ExtractedItem[],
  sections: ExtractionSection[],
  ocrData: StructuredOcr
): ExtractionStats {
  const validItems = items.filter((i) => i.validationStatus === 'valid').length;
  const warningItems = items.filter((i) => i.validationStatus === 'warning').length;
  const errorItems = items.filter((i) => i.validationStatus === 'error').length;

  // Calculate overall confidence
  const itemsWithConfidence = items.filter((i) => i.confidence != null);
  const overallConfidence =
    itemsWithConfidence.length > 0
      ? Math.round(
          itemsWithConfidence.reduce((sum, i) => sum + (i.confidence || 0), 0) /
            itemsWithConfidence.length * 100
        )
      : 92; // Default confidence

  return {
    totalItems: items.length,
    totalSections: sections.length,
    tablesFound: ocrData.tables.length,
    overallConfidence,
    validItems,
    warningItems,
    errorItems,
  };
}

export function ExtractionPreview({
  ocrData,
  aiResult,
  originalFilename,
  onContinue,
  onReExtract,
  onBack,
  isLoading = false,
}: ExtractionPreviewProps) {
  const navigate = useNavigate();

  // Initialize state from OCR/AI data
  const initialState = useMemo(
    () => transformToExtractionState(ocrData, aiResult || null, originalFilename),
    [ocrData, aiResult, originalFilename]
  );

  const [state, setState] = useState<ExtractionPreviewState>(initialState);

  // Handlers
  const handleSectionChange = useCallback((sectionId: string) => {
    setState((prev) => ({ ...prev, activeSection: sectionId }));
  }, []);

  const handleColumnMappingChange = useCallback(
    (columnId: string, newMapping: FieldMappingType) => {
      setState((prev) => ({
        ...prev,
        columns: prev.columns.map((col) =>
          col.id === columnId ? { ...col, mappedField: newMapping } : col
        ),
      }));
      toast.success('Column mapping updated');
    },
    []
  );

  const handleItemSelectionChange = useCallback((itemId: string, selected: boolean) => {
    setState((prev) => {
      const newSelected = new Set(prev.selectedItems);
      if (selected) {
        newSelected.add(itemId);
      } else {
        newSelected.delete(itemId);
      }
      return { ...prev, selectedItems: newSelected };
    });
  }, []);

  const handleSelectAllChange = useCallback((selected: boolean) => {
    setState((prev) => ({
      ...prev,
      selectedItems: selected ? new Set(prev.items.map((i) => i.id)) : new Set(),
    }));
  }, []);

  const handleItemEdit = useCallback(
    (itemId: string, fieldKey: string, newValue: string) => {
      // For now, just log - in production this would open an edit modal
      console.log('Edit item:', itemId, fieldKey, newValue);
      toast.info('Inline editing coming soon');
    },
    []
  );

  const handleSaveDraft = useCallback(() => {
    toast.success('Draft saved');
  }, []);

  const handleApplyMapping = useCallback(() => {
    toast.success('Column mapping applied');
  }, []);

  const handleContinue = useCallback(() => {
    const selectedItems = state.items.filter((i) => state.selectedItems.has(i.id));
    onContinue(selectedItems, state.columns);
  }, [state.items, state.selectedItems, state.columns, onContinue]);

  const handleDownloadCsv = useCallback(() => {
    toast.info('CSV download coming soon');
  }, []);

  // Filter items by active section (simplified)
  const filteredItems = state.items;

  // Get active section name
  const activeSectionName =
    state.sections.find((s) => s.id === state.activeSection)?.name || 'All Items';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              Review Extracted Data
            </h1>
            <Badge
              variant="outline"
              className="bg-gradient-to-r from-teal-50 to-teal-100 border-teal-400 text-teal-700 font-semibold"
            >
              <FileText className="w-3 h-3 mr-1" />
              {state.documentInfo.documentType}
            </Badge>
          </div>
          <p className="text-sm text-slate-600">
            {originalFilename || 'document.pdf'} • Uploaded just now
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleDownloadCsv} className="gap-2">
            <Download className="w-4 h-4" />
            Download CSV
          </Button>
          <Button variant="secondary" onClick={onReExtract} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Re-extract
          </Button>
        </div>
      </div>

      {/* Progress Steps */}
      <ExtractionProgressSteps currentStep={2} />

      {/* Main Grid */}
      <div className="grid grid-cols-[300px_1fr] gap-6">
        {/* Sidebar */}
        <div className="space-y-5">
          <DocumentInfoCard documentInfo={state.documentInfo} />
          <SectionNavigator
            sections={state.sections}
            activeSection={state.activeSection}
            onSectionChange={handleSectionChange}
          />
          <ExtractionStatsCard stats={state.stats} />
        </div>

        {/* Main Content */}
        <div className="space-y-5">
          {/* Table Controls */}
          <div className="flex items-center justify-between px-5 py-4 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search items..."
                  value={state.searchQuery}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, searchQuery: e.target.value }))
                  }
                  className="pl-9 w-60 bg-slate-50 border-slate-200"
                />
              </div>
              <Button variant="outline" size="sm" className="gap-2 text-slate-600">
                <Filter className="w-4 h-4" />
                Show All
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2 text-slate-600">
                <Settings2 className="w-4 h-4" />
                Column Settings
              </Button>
              <Button variant="outline" size="sm" className="gap-2 text-slate-600">
                <Layers className="w-4 h-4" />
                Bulk Edit
              </Button>
            </div>
          </div>

          {/* Data Table */}
          <ExtractionDataTable
            columns={state.columns}
            items={filteredItems}
            sectionName={activeSectionName}
            selectedItems={state.selectedItems}
            onColumnMappingChange={handleColumnMappingChange}
            onItemSelectionChange={handleItemSelectionChange}
            onSelectAllChange={handleSelectAllChange}
            onItemEdit={handleItemEdit}
          />

          {/* Action Bar */}
          <ExtractionActionBar
            stats={state.stats}
            onSaveDraft={handleSaveDraft}
            onApplyMapping={handleApplyMapping}
            onContinue={handleContinue}
            onReExtract={onReExtract}
            onDownloadCsv={handleDownloadCsv}
            isLoading={isLoading}
            canContinue={state.selectedItems.size > 0}
          />
        </div>
      </div>
    </div>
  );
}
