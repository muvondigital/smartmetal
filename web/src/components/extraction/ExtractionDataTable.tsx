/**
 * ExtractionDataTable Component
 *
 * Industry-grade data table for extraction preview.
 * Features: column mapping, confidence indicators, inline editing,
 * row selection, validation status, and pagination.
 * Part of the SmartMetal Extraction Preview system.
 */

import { useState } from 'react';
import {
  Check,
  AlertCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Info,
} from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import { ColumnMappingDropdown } from './ColumnMappingDropdown';
import type {
  ExtractionColumn,
  ExtractedItem,
  FieldMappingType,
  ValidationStatus,
  ConfidenceLevel,
} from '../../types/extraction';
import { getConfidenceLevel } from '../../types/extraction';
import { cn } from '../../lib/utils';

interface ExtractionDataTableProps {
  columns: ExtractionColumn[];
  items: ExtractedItem[];
  sectionName: string;
  selectedItems: Set<string>;
  onColumnMappingChange: (columnId: string, newMapping: FieldMappingType) => void;
  onItemSelectionChange: (itemId: string, selected: boolean) => void;
  onSelectAllChange: (selected: boolean) => void;
  onItemEdit: (itemId: string, fieldKey: string, newValue: string) => void;
}

// Confidence indicator with icon
function ConfidenceIndicator({
  confidence,
  showLabel = true,
}: {
  confidence: number;
  showLabel?: boolean;
}) {
  const level = getConfidenceLevel(confidence);
  const Icon = level === 'high' ? Check : level === 'medium' ? AlertCircle : XCircle;
  const colorClass =
    level === 'high'
      ? 'text-green-600'
      : level === 'medium'
      ? 'text-amber-600'
      : 'text-red-600';

  return (
    <span className={cn('flex items-center gap-1 text-[10px] font-medium', colorClass)}>
      <Icon className="w-3 h-3" />
      {showLabel && `${confidence}%`}
    </span>
  );
}

// Status pill component
function StatusPill({ status }: { status: ValidationStatus }) {
  const config = {
    valid: {
      label: 'Valid',
      icon: Check,
      className: 'bg-green-100 text-green-700',
    },
    warning: {
      label: 'Review',
      icon: AlertCircle,
      className: 'bg-amber-100 text-amber-700',
    },
    error: {
      label: 'Error',
      icon: XCircle,
      className: 'bg-red-100 text-red-700',
    },
  };

  const { label, icon: Icon, className } = config[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
        'text-[10px] font-semibold uppercase tracking-wide',
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// Editable cell component
function EditableCell({
  value,
  validation,
  onEdit,
}: {
  value: string;
  validation?: { status: ValidationStatus; message?: string };
  onEdit: () => void;
}) {
  const hasWarning = validation?.status === 'warning';
  const hasError = validation?.status === 'error';

  return (
    <div
      onClick={onEdit}
      className={cn(
        'relative px-2 py-1 -mx-2 -my-1 rounded cursor-pointer',
        'transition-colors group',
        'hover:bg-slate-100',
        hasWarning && 'text-amber-600',
        hasError && 'text-red-600'
      )}
    >
      <span className="flex items-center gap-1">
        {(hasWarning || hasError) && (
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
        )}
        {value || <span className="text-red-500 italic">Missing</span>}
      </span>
      <Pencil
        className={cn(
          'absolute right-1 top-1/2 -translate-y-1/2',
          'w-3 h-3 text-slate-400 opacity-0',
          'group-hover:opacity-100 transition-opacity'
        )}
      />
    </div>
  );
}

export function ExtractionDataTable({
  columns,
  items,
  sectionName,
  selectedItems,
  onColumnMappingChange,
  onItemSelectionChange,
  onSelectAllChange,
  onItemEdit,
}: ExtractionDataTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Pagination
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = items.slice(startIndex, startIndex + itemsPerPage);

  // Selection state
  const allSelected = items.length > 0 && items.every((item) => selectedItems.has(item.id));
  const someSelected = items.some((item) => selectedItems.has(item.id)) && !allSelected;

  // Get display columns (excluding unmapped)
  const displayColumns = columns.filter((col) => col.mappedField !== 'unmapped');

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Table Header Bar */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-b from-slate-50 to-white border-b border-slate-200">
        <h3 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
          {sectionName}
          <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full text-xs font-semibold">
            {items.length} items
          </span>
        </h3>
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-amber-50 px-3 py-1.5 rounded-md">
          <Info className="w-3.5 h-3.5 text-amber-500" />
          Click column headers to adjust field mapping
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              {/* Checkbox column */}
              <th className="w-12 px-5 py-3 border-b-2 border-slate-200">
                <Checkbox
                  checked={allSelected || (someSelected ? 'indeterminate' : false)}
                  onCheckedChange={(checked) => onSelectAllChange(!!checked)}
                  className="data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                />
              </th>

              {/* Row number column */}
              <th className="w-12 px-3 py-3 text-left text-slate-500 font-semibold border-b-2 border-slate-200">
                #
              </th>

              {/* Data columns */}
              {displayColumns.map((column) => (
                <th
                  key={column.id}
                  className="px-4 py-3 text-left font-semibold text-slate-700 border-b-2 border-slate-200"
                  style={{ minWidth: column.width || 'auto' }}
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span>{column.originalHeader}</span>
                      <ColumnMappingDropdown
                        currentMapping={column.mappedField}
                        onMappingChange={(newMapping) =>
                          onColumnMappingChange(column.id, newMapping)
                        }
                      />
                    </div>
                    <ConfidenceIndicator confidence={column.confidence} />
                  </div>
                </th>
              ))}

              {/* Status column */}
              <th className="w-24 px-4 py-3 text-left font-semibold text-slate-700 border-b-2 border-slate-200">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedItems.map((item, index) => {
              const isSelected = selectedItems.has(item.id);
              const rowBgClass =
                item.validationStatus === 'warning'
                  ? 'bg-amber-50'
                  : item.validationStatus === 'error'
                  ? 'bg-red-50'
                  : isSelected
                  ? 'bg-teal-50/50'
                  : '';

              return (
                <tr
                  key={item.id}
                  className={cn(
                    'transition-colors hover:bg-slate-50',
                    rowBgClass
                  )}
                >
                  {/* Checkbox */}
                  <td className="px-5 py-3.5 border-b border-slate-100">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) =>
                        onItemSelectionChange(item.id, !!checked)
                      }
                      className="data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                    />
                  </td>

                  {/* Row number */}
                  <td className="px-3 py-3.5 border-b border-slate-100 text-slate-400 font-mono text-xs">
                    {startIndex + index + 1}
                  </td>

                  {/* Data cells */}
                  {displayColumns.map((column) => {
                    const field = item.fields[column.mappedField];
                    const displayValue = field?.displayValue || '';
                    const validation = field?.validation;

                    // Special rendering for different field types
                    if (column.mappedField === 'item_no') {
                      return (
                        <td
                          key={column.id}
                          className="px-4 py-3.5 border-b border-slate-100"
                        >
                          <span className="font-mono text-xs text-slate-600">
                            {displayValue}
                          </span>
                        </td>
                      );
                    }

                    if (
                      column.mappedField === 'size' ||
                      column.mappedField === 'unit'
                    ) {
                      return (
                        <td
                          key={column.id}
                          className="px-4 py-3.5 border-b border-slate-100"
                        >
                          <span className="inline-flex px-2 py-0.5 bg-slate-100 rounded text-xs font-medium text-slate-600">
                            {displayValue || '—'}
                          </span>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={column.id}
                        className="px-4 py-3.5 border-b border-slate-100 text-slate-700"
                      >
                        {column.isEditable !== false ? (
                          <EditableCell
                            value={displayValue}
                            validation={validation}
                            onEdit={() =>
                              onItemEdit(item.id, column.mappedField, displayValue)
                            }
                          />
                        ) : (
                          displayValue || '—'
                        )}
                      </td>
                    );
                  })}

                  {/* Status */}
                  <td className="px-4 py-3.5 border-b border-slate-100">
                    <StatusPill status={item.validationStatus} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-200">
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <span>
            <span className="font-semibold text-teal-600">{selectedItems.size}</span>{' '}
            of {items.length} items selected
          </span>
          <span className="text-slate-400">|</span>
          <span>
            Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, items.length)}{' '}
            of {items.length}
          </span>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = i + 1;
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className={cn(
                    'h-8 w-8 p-0',
                    currentPage === page &&
                      'bg-teal-500 hover:bg-teal-600 border-teal-500'
                  )}
                >
                  {page}
                </Button>
              );
            })}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
