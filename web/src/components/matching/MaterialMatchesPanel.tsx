/**
 * MaterialMatchesPanel Component
 * 
 * A compact summary table embedded on the RFQ page.
 * Shows one row per RFQ line, no inline candidate spam.
 * Designed to fit comfortably within a 1900x1200 viewport with minimal page scroll.
 */

import { useState, useMemo } from 'react';
import { Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { MaterialMatchSummary, MaterialMatchStatusFilter } from '../../types/matching';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ScrollArea } from '../ui/scroll-area';
import { Progress } from '../ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface MaterialMatchesPanelProps {
  rfqId: string;
  summaries: MaterialMatchSummary[];
  isLoading?: boolean;
  onOpenLine: (rfqLineId: string) => void;
}

/**
 * Get confidence label color
 */
function getConfidenceColor(confidencePct: number | null | undefined): string {
  if (confidencePct === null || confidencePct === undefined) return 'bg-slate-200 text-slate-600';
  if (confidencePct <= 40) return 'bg-red-100 text-red-800';
  if (confidencePct <= 70) return 'bg-amber-100 text-amber-800';
  return 'bg-green-100 text-green-800';
}

/**
 * Get confidence label text
 */
function getConfidenceLabel(confidencePct: number | null | undefined, label?: string): string {
  if (label) return label;
  if (confidencePct === null || confidencePct === undefined) return 'N/A';
  if (confidencePct <= 40) return 'Low';
  if (confidencePct <= 70) return 'Medium';
  return 'High';
}

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function MaterialMatchesPanel({
  rfqId,
  summaries,
  isLoading = false,
  onOpenLine,
}: MaterialMatchesPanelProps) {
  const [statusFilter, setStatusFilter] = useState<MaterialMatchStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter summaries
  const filteredSummaries = useMemo(() => {
    let filtered = summaries;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((summary) => {
        switch (statusFilter) {
          case 'no_match':
            return !summary.hasCandidates;
          case 'low_confidence':
            return summary.hasCandidates && (summary.confidencePct === null || summary.confidencePct === undefined || summary.confidencePct <= 40);
          case 'auto_selected':
            return summary.isAutoSelected && summary.selectedMaterialCode;
          case 'manual':
            return !summary.isAutoSelected && summary.selectedMaterialCode;
          default:
            return true;
        }
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (summary) =>
          summary.description.toLowerCase().includes(query) ||
          summary.selectedMaterialCode?.toLowerCase().includes(query) ||
          summary.shortCategory.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [summaries, statusFilter, searchQuery]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Material Matches</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Material Matches</CardTitle>
            <CardDescription>
              RFQ {rfqId} • {summaries.length} line{summaries.length !== 1 ? 's' : ''}
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as MaterialMatchStatusFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="no_match">No Match</SelectItem>
              <SelectItem value="low_confidence">Low Confidence</SelectItem>
              <SelectItem value="auto_selected">Auto-selected</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by description or material code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[70vh] w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Line #</TableHead>
                <TableHead className="w-24">Category</TableHead>
                <TableHead className="min-w-[300px]">Description</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-40">Confidence</TableHead>
                <TableHead className="w-24">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSummaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No matches found
                  </TableCell>
                </TableRow>
              ) : (
                filteredSummaries.map((summary) => (
                  <TableRow key={summary.rfqLineId} className="h-14">
                    <TableCell className="font-medium">{summary.lineNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {summary.shortCategory}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {summary.description.length > 60 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{truncate(summary.description, 60)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">{summary.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        summary.description
                      )}
                    </TableCell>
                    <TableCell>
                      {summary.hasCandidates && summary.selectedMaterialCode ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="default" className="cursor-help">
                              {summary.selectedMaterialCode}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{summary.selectedMaterialName || summary.selectedMaterialCode}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : !summary.hasCandidates ? (
                        <Badge variant="secondary" className="bg-slate-200 text-slate-600">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          No Match
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {summary.confidencePct !== null && summary.confidencePct !== undefined ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-xs ${getConfidenceColor(summary.confidencePct)}`}
                            >
                              {getConfidenceLabel(summary.confidencePct, summary.confidenceLabel)}
                            </Badge>
                            <span className="text-xs text-slate-600">{Math.round(summary.confidencePct)}%</span>
                          </div>
                          <Progress value={summary.confidencePct} className="h-1" />
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenLine(summary.rfqLineId)}
                        className="w-full"
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
        {filteredSummaries.length > 0 && (
          <div className="mt-4 text-xs text-slate-500 text-center">
            Showing {filteredSummaries.length} of {summaries.length} line{summaries.length !== 1 ? 's' : ''}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

