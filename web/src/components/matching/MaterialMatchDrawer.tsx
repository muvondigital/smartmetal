/**
 * MaterialMatchDrawer Component
 *
 * Drawer/sheet component that displays material match candidates for a specific RFQ line item.
 * Allows users to review, select, and save material matches.
 */

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '../ui/sheet';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { MaterialCandidate } from '../../types/matching';

interface MaterialMatchDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfqLine: {
    rfqLineId: string;
    lineNumber: number;
    shortCategory: string;
    description: string;
    quantity?: number;
    unit?: string;
  };
  candidates: MaterialCandidate[];
  selectedCandidateId?: string;
  onSelectCandidate: (candidateId: string) => void;
  onClearMatch: () => void;
  onRefreshCandidates: () => void;
  onSave: () => void;
}

export function MaterialMatchDrawer({
  open,
  onOpenChange,
  rfqLine,
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  onClearMatch,
  onRefreshCandidates,
  onSave,
}: MaterialMatchDrawerProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefreshCandidates();
    setIsRefreshing(false);
  };

  const getConfidenceBadgeVariant = (label: string) => {
    switch (label) {
      case 'High':
        return 'default';
      case 'Medium':
        return 'secondary';
      case 'Very Low':
      case 'Low':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            Line {rfqLine.lineNumber} - Material Match
          </SheetTitle>
          <SheetDescription>
            <div className="space-y-1 mt-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{rfqLine.shortCategory}</Badge>
                {rfqLine.quantity && rfqLine.unit && (
                  <span className="text-sm text-muted-foreground">
                    Qty: {rfqLine.quantity} {rfqLine.unit}
                  </span>
                )}
              </div>
              <p className="text-sm">{rfqLine.description}</p>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="py-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Material Candidates ({candidates.length})
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </>
              )}
            </Button>
          </div>

          {candidates.length === 0 ? (
            <Card className="p-6">
              <div className="flex flex-col items-center justify-center text-center space-y-2">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No material candidates found for this line item.
                </p>
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  Try Refresh
                </Button>
              </div>
            </Card>
          ) : (
            <RadioGroup
              value={selectedCandidateId}
              onValueChange={onSelectCandidate}
              className="space-y-3"
            >
              {candidates.map((candidate) => (
                <Card
                  key={candidate.id}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedCandidateId === candidate.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-muted-foreground/50'
                  }`}
                  onClick={() => onSelectCandidate(candidate.id)}
                >
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem
                      value={candidate.id}
                      id={candidate.id}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <Label
                          htmlFor={candidate.id}
                          className="font-medium cursor-pointer"
                        >
                          {candidate.materialCode}
                        </Label>
                        <Badge variant={getConfidenceBadgeVariant(candidate.confidenceLabel)}>
                          {candidate.confidenceLabel} ({candidate.confidencePct.toFixed(0)}%)
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {candidate.materialName}
                      </p>
                      {candidate.rationale && (
                        <p className="text-xs text-muted-foreground italic">
                          {candidate.rationale}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {candidate.category && (
                          <span>Category: {candidate.category}</span>
                        )}
                        {candidate.specStandard && (
                          <span>" Spec: {candidate.specStandard}</span>
                        )}
                        {candidate.grade && (
                          <span>" Grade: {candidate.grade}</span>
                        )}
                        {candidate.sizeDescription && (
                          <span>" Size: {candidate.sizeDescription}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </RadioGroup>
          )}
        </div>

        <SheetFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClearMatch}
            disabled={!selectedCandidateId}
          >
            Clear Match
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              disabled={!selectedCandidateId}
            >
              Save Match
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
