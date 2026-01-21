/**
 * DocumentInfoCard Component
 *
 * Displays extracted document metadata with confidence indicators.
 * Part of the SmartMetal Extraction Preview system.
 */

import { FileText, Check, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import type { ExtractedDocumentInfo, ConfidenceLevel } from '../../types/extraction';
import { getDocumentTypeLabel } from '../../lib/rfqUtils';

interface DocumentInfoCardProps {
  documentInfo: ExtractedDocumentInfo;
}

function ConfidenceDot({ level }: { level?: ConfidenceLevel }) {
  const colorClass =
    level === 'high'
      ? 'bg-green-500'
      : level === 'medium'
      ? 'bg-amber-500'
      : level === 'low'
      ? 'bg-red-500'
      : 'bg-slate-300';

  return <span className={`inline-block w-2 h-2 rounded-full ${colorClass}`} />;
}

function InfoItem({
  label,
  value,
  confidence,
}: {
  label: string;
  value?: string | null;
  confidence?: ConfidenceLevel;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
        {confidence && <ConfidenceDot level={confidence} />}
        {value || '—'}
      </span>
    </div>
  );
}

export function DocumentInfoCard({ documentInfo }: DocumentInfoCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="px-5 py-4 border-b border-slate-200">
        <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          Document Info
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid gap-4">
          <InfoItem
            label="Customer"
            value={documentInfo.customer}
            confidence={documentInfo.customerConfidence}
          />
          <InfoItem
            label="Project"
            value={documentInfo.project}
            confidence={documentInfo.projectConfidence}
          />
          <InfoItem
            label="Document Type"
            value={getDocumentTypeLabel(documentInfo.documentType)}
            confidence={documentInfo.documentTypeConfidence}
          />
          <InfoItem
            label="Reference No."
            value={documentInfo.referenceNumber}
            confidence={documentInfo.referenceConfidence}
          />
          <InfoItem
            label="Pages Processed"
            value={`${documentInfo.pagesProcessed} of ${documentInfo.totalPages}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
