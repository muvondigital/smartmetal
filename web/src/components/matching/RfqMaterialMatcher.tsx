/**
 * RfqMaterialMatcher Container Component
 * 
 * Orchestrates MaterialMatchesPanel + MaterialMatchDrawer on the RFQ Detail/Import page.
 * Handles data fetching and state.
 */

import { useState, useEffect, useCallback } from 'react';
import { MaterialMatchesPanel } from './MaterialMatchesPanel';
import { MaterialMatchDrawer } from './MaterialMatchDrawer';
import type { MaterialMatchSummary, MaterialCandidate } from '../../types/matching';

interface RfqMaterialMatcherProps {
  rfqId: string;
  rfqLineItems?: Array<{
    id: string;
    line_number: number;
    description: string;
    quantity?: number;
    unit?: string;
    material_code?: string | null;
    matched_materials?: Array<{
      material_id: string | null;
      material_code: string | null;
      score: number;
      reason: string | null;
    }>;
  }>;
}

/**
 * Infer category from description
 */
function inferCategory(description: string): string {
  const desc = description.toUpperCase();
  if (desc.includes('PIPE') || desc.includes('TUBE')) return 'PIPE';
  if (desc.includes('FLANGE') || desc.includes('BLIND')) return 'FLANGE';
  if (desc.includes('FITTING') || desc.includes('ELBOW') || desc.includes('TEE')) return 'FITTING';
  if (desc.includes('GASKET')) return 'GASKET';
  if (desc.includes('BOLT') || desc.includes('NUT') || desc.includes('FASTENER')) return 'FASTENER';
  return 'OTHER';
}

/**
 * Get confidence label from score
 */
function getConfidenceLabel(score: number): string {
  if (score <= 40) return 'Very Low';
  if (score <= 70) return 'Medium';
  return 'High';
}

/**
 * Transform RFQ line items to MaterialMatchSummary
 */
function transformToSummaries(
  lineItems: RfqMaterialMatcherProps['rfqLineItems'] = []
): MaterialMatchSummary[] {
  return lineItems.map((item) => {
    const matchedMaterials = item.matched_materials || [];
    const primaryMatch = matchedMaterials[0];
    const selectedMatch = matchedMaterials.find((m) => m.material_code === item.material_code) || primaryMatch;

    return {
      rfqLineId: String(item.id),
      lineNumber: item.line_number || 0,
      shortCategory: inferCategory(item.description || ''),
      description: item.description || '',
      selectedMaterialCode: selectedMatch?.material_code || undefined,
      selectedMaterialName: undefined, // TODO: Fetch from material details if needed
      confidencePct: selectedMatch ? selectedMatch.score * 100 : null,
      confidenceLabel: selectedMatch ? getConfidenceLabel(selectedMatch.score * 100) : undefined,
      hasCandidates: matchedMaterials.length > 0,
      isAutoSelected: !!primaryMatch && primaryMatch.material_code === item.material_code,
    };
  });
}

/**
 * Transform matched materials to MaterialCandidate
 */
function transformToCandidates(
  matchedMaterials: Array<{
    material_id: string | null;
    material_code: string | null;
    score: number;
    reason: string | null;
  }>
): MaterialCandidate[] {
  return matchedMaterials.map((match, idx) => ({
    id: match.material_id || `candidate-${idx}`,
    materialCode: match.material_code || 'Unknown',
    materialName: match.material_code || 'Unknown', // TODO: Fetch full name from API
    category: 'UNKNOWN', // TODO: Fetch from material details
    confidencePct: match.score * 100,
    confidenceLabel: getConfidenceLabel(match.score * 100),
    rationale: match.reason || undefined,
  }));
}

export function RfqMaterialMatcher({ rfqId, rfqLineItems = [] }: RfqMaterialMatcherProps) {
  const [summaries, setSummaries] = useState<MaterialMatchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MaterialCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [candidatesCache, setCandidatesCache] = useState<Record<string, MaterialCandidate[]>>({});

  // Initialize summaries from line items
  useEffect(() => {
    if (rfqLineItems.length > 0) {
      const transformed = transformToSummaries(rfqLineItems);
      setSummaries(transformed);
    } else {
      // TODO: Fetch summaries from API if line items not provided
      // GET /api/rfqs/:id/material-matches
      setIsLoading(true);
      // For now, set empty
      setSummaries([]);
      setIsLoading(false);
    }
  }, [rfqId, rfqLineItems]);

  // Handle opening drawer for a line
  const handleOpenLine = useCallback(
    async (rfqLineId: string) => {
      setActiveLineId(rfqLineId);
      setDrawerOpen(true);

      // Check cache first
      if (candidatesCache[rfqLineId]) {
        setCandidates(candidatesCache[rfqLineId]);
        // Find selected candidate
        const lineItem = rfqLineItems.find((item) => String(item.id) === rfqLineId);
        if (lineItem?.material_code) {
          const selected = candidatesCache[rfqLineId].find(
            (c) => c.materialCode === lineItem.material_code
          );
          setSelectedCandidateId(selected?.id || null);
        } else {
          setSelectedCandidateId(null);
        }
        return;
      }

      // Fetch candidates for this line
      // TODO: Implement actual API call
      // GET /api/rfqs/:id/material-matches/:rfqLineId/candidates
      const lineItem = rfqLineItems.find((item) => String(item.id) === rfqLineId);
      if (lineItem?.matched_materials) {
        const transformed = transformToCandidates(lineItem.matched_materials);
        setCandidates(transformed);
        setCandidatesCache((prev) => ({ ...prev, [rfqLineId]: transformed }));

        // Set selected candidate if material_code matches
        if (lineItem.material_code) {
          const selected = transformed.find((c) => c.materialCode === lineItem.material_code);
          setSelectedCandidateId(selected?.id || null);
        } else {
          setSelectedCandidateId(null);
        }
      } else {
        setCandidates([]);
        setSelectedCandidateId(null);
      }
    },
    [rfqLineItems, candidatesCache]
  );

  // Handle selecting a candidate
  const handleSelectCandidate = useCallback((candidateId: string | null) => {
    setSelectedCandidateId(candidateId);
  }, []);

  // Handle clearing match
  const handleClearMatch = useCallback(() => {
    setSelectedCandidateId(null);
  }, []);

  // Handle saving selection
  const handleSave = useCallback(async () => {
    if (!activeLineId || !selectedCandidateId) return;

    const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId);
    if (!selectedCandidate) return;

    try {
      // TODO: Implement actual API call
      // POST/PUT /api/rfqs/:id/material-matches/:rfqLineId
      // await request(`/rfqs/${rfqId}/material-matches/${activeLineId}`, {
      //   method: 'PUT',
      //   body: JSON.stringify({ material_code: selectedCandidate.materialCode }),
      // });

      // Update local state
      setSummaries((prev) =>
        prev.map((summary) =>
          summary.rfqLineId === activeLineId
            ? {
                ...summary,
                selectedMaterialCode: selectedCandidate.materialCode,
                selectedMaterialName: selectedCandidate.materialName,
                confidencePct: selectedCandidate.confidencePct,
                confidenceLabel: selectedCandidate.confidenceLabel,
                isAutoSelected: false,
              }
            : summary
        )
      );

      // Close drawer
      setDrawerOpen(false);
    } catch (error) {
      console.error('Failed to save material match:', error);
      // TODO: Show error toast
    }
  }, [activeLineId, selectedCandidateId, candidates, rfqId]);

  // Handle refresh candidates
  const handleRefreshCandidates = useCallback(async () => {
    if (!activeLineId) return;

    try {
      // TODO: Implement actual API call to re-run matching
      // POST /api/rfqs/:id/material-matches/:rfqLineId/refresh
      // const refreshed = await request(`/rfqs/${rfqId}/material-matches/${activeLineId}/refresh`, {
      //   method: 'POST',
      // });

      // For now, just clear cache and reload
      setCandidatesCache((prev) => {
        const newCache = { ...prev };
        delete newCache[activeLineId];
        return newCache;
      });
      await handleOpenLine(activeLineId);
    } catch (error) {
      console.error('Failed to refresh candidates:', error);
      // TODO: Show error toast
    }
  }, [activeLineId, rfqId, handleOpenLine]);

  const activeLineItem = rfqLineItems.find((item) => String(item.id) === activeLineId);

  return (
    <>
      <MaterialMatchesPanel
        rfqId={rfqId}
        summaries={summaries}
        isLoading={isLoading}
        onOpenLine={handleOpenLine}
      />
      {activeLineItem && (
        <MaterialMatchDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          rfqLine={{
            rfqLineId: activeLineId!,
            lineNumber: activeLineItem.line_number || 0,
            shortCategory: inferCategory(activeLineItem.description || ''),
            description: activeLineItem.description || '',
            quantity: activeLineItem.quantity,
            unit: activeLineItem.unit || undefined,
          }}
          candidates={candidates}
          selectedCandidateId={selectedCandidateId || undefined}
          onSelectCandidate={handleSelectCandidate}
          onClearMatch={handleClearMatch}
          onRefreshCandidates={handleRefreshCandidates}
          onSave={handleSave}
        />
      )}
    </>
  );
}

