/**
 * ExtractionActionBar Component
 *
 * Action bar with validation summary and action buttons.
 * Part of the SmartMetal Extraction Preview system.
 */

import {
  Check,
  AlertCircle,
  XCircle,
  Save,
  CheckSquare,
  ArrowRight,
  Download,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../ui/button';
import type { ExtractionStats } from '../../types/extraction';
import { cn } from '../../lib/utils';

interface ExtractionActionBarProps {
  stats: ExtractionStats;
  onSaveDraft: () => void;
  onApplyMapping: () => void;
  onContinue: () => void;
  onReExtract?: () => void;
  onDownloadCsv?: () => void;
  isLoading?: boolean;
  canContinue?: boolean;
}

function ValidationItem({
  icon: Icon,
  count,
  label,
  colorClass,
}: {
  icon: typeof Check;
  count: number;
  label: string;
  colorClass: string;
}) {
  return (
    <div className={cn('flex items-center gap-1.5 text-sm', colorClass)}>
      <Icon className="w-4 h-4" />
      <span>
        {count} {label}
      </span>
    </div>
  );
}

export function ExtractionActionBar({
  stats,
  onSaveDraft,
  onApplyMapping,
  onContinue,
  onReExtract,
  onDownloadCsv,
  isLoading = false,
  canContinue = true,
}: ExtractionActionBarProps) {
  const hasErrors = stats.errorItems > 0;
  const hasWarnings = stats.warningItems > 0;

  return (
    <div className="flex items-center justify-between px-6 py-5 bg-white rounded-xl border border-slate-200 shadow-md">
      {/* Validation Summary */}
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-4">
          <ValidationItem
            icon={Check}
            count={stats.validItems}
            label="Valid"
            colorClass="text-green-600"
          />
          {hasWarnings && (
            <ValidationItem
              icon={AlertCircle}
              count={stats.warningItems}
              label="Need Review"
              colorClass="text-amber-600"
            />
          )}
          {hasErrors && (
            <ValidationItem
              icon={XCircle}
              count={stats.errorItems}
              label="Errors"
              colorClass="text-red-600"
            />
          )}
        </div>

        {/* Re-extract and Download buttons */}
        <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
          {onReExtract && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReExtract}
              disabled={isLoading}
              className="text-slate-600 gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              Re-extract
            </Button>
          )}
          {onDownloadCsv && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDownloadCsv}
              disabled={isLoading}
              className="text-slate-600 gap-2"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </Button>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={onSaveDraft}
          disabled={isLoading}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          Save Draft
        </Button>

        <Button
          variant="secondary"
          onClick={onApplyMapping}
          disabled={isLoading}
          className="gap-2"
        >
          <CheckSquare className="w-4 h-4" />
          Apply Column Mapping
        </Button>

        <Button
          onClick={onContinue}
          disabled={isLoading || !canContinue}
          className={cn(
            'gap-2 shadow-md',
            'bg-gradient-to-r from-teal-500 to-teal-600',
            'hover:from-teal-600 hover:to-teal-700',
            'text-white'
          )}
        >
          Continue to Review
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
