/**
 * RFQ Item Modal
 * 
 * Modal for editing/creating RFQ items with HS Code support
 */

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
// Removed: HsCodeLookupModal (de-engineered regulatory features)
import type { RfqLineItem } from '../../pages/RfqDetail';
import { request, updateRfqItem, addRfqItem } from '../../api/client';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface RfqItemModalProps {
  open: boolean;
  onClose: () => void;
  item: RfqLineItem | null;
  rfqId: string;
  onSave: () => void;
}

export function RfqItemModal({ open, onClose, item, rfqId, onSave }: RfqItemModalProps) {
  const [formData, setFormData] = useState({
    description: '',
    quantity: 0,
    unit: 'PCS',
    material_code: null as string | null,
    hs_code: null as string | null,
    import_duty_rate: null as number | null,
    origin_country: null as string | null,
  });

  const [manualOverride, setManualOverride] = useState(false);
  const [hsLookupOpen, setHsLookupOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalDutyData, setFinalDutyData] = useState<{
    trade_agreement: string | null;
    final_import_duty_rate: number | null;
    final_import_duty_amount: number | null;
  } | null>(null);

  // Auto-suggested values (read-only display)
  const autoSuggested = {
    hs_code: item?.hs_code && item?.hs_match_source !== 'MANUAL' ? item.hs_code : null,
    import_duty_rate: item?.import_duty_rate && item?.hs_match_source !== 'MANUAL' ? item.import_duty_rate : null,
    match_source: item?.hs_match_source,
    confidence: item?.hs_confidence,
  };

  useEffect(() => {
    if (item) {
      setFormData({
        description: item.description || '',
        quantity: item.quantity || 0,
        unit: item.unit || 'PCS',
        material_code: item.material_code || null,
        hs_code: item.hs_code || null,
        import_duty_rate: item.import_duty_rate || null,
        origin_country: item.origin_country || null,
      });
      setManualOverride(item.hs_match_source === 'MANUAL');
      setFinalDutyData({
        trade_agreement: item.trade_agreement || null,
        final_import_duty_rate: item.final_import_duty_rate || null,
        final_import_duty_amount: item.final_import_duty_amount || null,
      });
    } else {
      // Reset for new item
      setFormData({
        description: '',
        quantity: 0,
        unit: 'PCS',
        material_code: null,
        hs_code: null,
        import_duty_rate: null,
        origin_country: null,
      });
      setManualOverride(false);
      setFinalDutyData(null);
    }
  }, [item, open]);

  // Recalculate final duty when origin country or HS code changes (debounced)
  useEffect(() => {
    if (!item || !formData.origin_country || !formData.hs_code) {
      // Clear final duty data if origin or HS code is missing
      if (!formData.origin_country || !formData.hs_code) {
        setFinalDutyData(null);
      }
      return;
    }

    // Only recalculate if origin country actually changed from item's current value
    const originChanged = formData.origin_country !== (item.origin_country || null);
    const hsCodeChanged = formData.hs_code !== (item.hs_code || null);
    
    if (!originChanged && !hsCodeChanged) {
      return; // No change, don't recalculate
    }

    const timeoutId = setTimeout(async () => {
      try {
        // Update item to trigger backend recalculation
        const updated = await updateRfqItem(rfqId, item.id, {
          origin_country: formData.origin_country,
        });
        setFinalDutyData({
          trade_agreement: updated.trade_agreement || null,
          final_import_duty_rate: updated.final_import_duty_rate || null,
          final_import_duty_amount: updated.final_import_duty_amount || null,
        });
      } catch (error) {
        console.error('Error recalculating duty:', error);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [formData.origin_country, formData.hs_code, item?.id, item?.origin_country, item?.hs_code, rfqId]);

  const handleFieldChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleHsCodeSelect = (hsData: {
    hs_code: string;
    import_duty_rate: number;
    hs_match_source: 'MANUAL';
    hs_confidence: 1;
  }) => {
    setFormData((prev) => ({
      ...prev,
      hs_code: hsData.hs_code,
      import_duty_rate: hsData.import_duty_rate,
    }));
    setManualOverride(true);
  };

  const validateHsCode = (code: string | null): boolean => {
    if (!code) return true; // Optional field
    const hsCodeRegex = /^\d{4}(\.\d{2,4})*$/;
    return hsCodeRegex.test(code);
  };

  const handleSave = async () => {
    // Validate required fields
    if (!formData.description || !formData.description.trim()) {
      toast.error('Description is required');
      return;
    }

    if (!formData.quantity || formData.quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    if (!formData.unit || !formData.unit.trim()) {
      toast.error('Unit is required');
      return;
    }

    // Validate HS code format if provided
    if (formData.hs_code && !validateHsCode(formData.hs_code)) {
      toast.error('Invalid HS code format. Expected format: 1234.56.78 or 1234.56.78.90');
      return;
    }

    // Validate duty rate
    if (formData.import_duty_rate !== null && formData.import_duty_rate < 0) {
      toast.error('Duty rate must be non-negative');
      return;
    }

    setSaving(true);
    try {
      if (!item) {
        // CREATE NEW ITEM
        const newItemData: any = {
          description: formData.description,
          quantity: formData.quantity,
          unit: formData.unit,
        };

        if (formData.material_code) {
          newItemData.material_code = formData.material_code;
        }

        // HS code fields (if manual override enabled)
        if (manualOverride) {
          newItemData.hs_code = formData.hs_code || null;
          newItemData.import_duty_rate = formData.import_duty_rate !== null ? formData.import_duty_rate : null;
        }

        // Origin country
        if (formData.origin_country) {
          newItemData.origin_country = formData.origin_country;
        }

        await addRfqItem(rfqId, newItemData);
        toast.success('Item added successfully');
      } else {
        // UPDATE EXISTING ITEM
        const updates: any = {
          description: formData.description,
          quantity: formData.quantity,
          unit: formData.unit,
        };

        if (formData.material_code !== null) {
          updates.material_code = formData.material_code;
        }

        // HS code fields
        if (manualOverride) {
          updates.hs_code = formData.hs_code || null;
          updates.import_duty_rate = formData.import_duty_rate !== null ? formData.import_duty_rate : null;
          // Backend will set hs_match_source = 'MANUAL' and hs_confidence = 1
        }

        // Origin country (Phase 5) - always include if changed
        if (formData.origin_country !== item?.origin_country) {
          updates.origin_country = formData.origin_country || null;
        }

        const updated = await updateRfqItem(rfqId, item.id, updates);
        
        // Update final duty data from response
        if (updated) {
          setFinalDutyData({
            trade_agreement: updated.trade_agreement || null,
            final_import_duty_rate: updated.final_import_duty_rate || null,
            final_import_duty_amount: updated.final_import_duty_amount || null,
          });
        }

        toast.success('Item updated successfully');
      }

      onSave();
      onClose();
    } catch (error: any) {
      console.error('Error saving item:', error);
      toast.error(error.message || `Failed to ${item ? 'update' : 'add'} item`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {item ? `Edit Line Item ${item.line_number}` : 'New Line Item'}
            </DialogTitle>
            <DialogDescription>
              Update item details and HS code information
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Basic Information</h3>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  className="min-h-[80px]"
                  placeholder="Enter item description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={formData.quantity}
                    onChange={(e) =>
                      handleFieldChange('quantity', e.target.value ? parseFloat(e.target.value) : 0)
                    }
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    value={formData.unit}
                    onChange={(e) => handleFieldChange('unit', e.target.value)}
                    placeholder="PCS"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="material_code">Material Code</Label>
                <Input
                  id="material_code"
                  value={formData.material_code || ''}
                  onChange={(e) => handleFieldChange('material_code', e.target.value || null)}
                  placeholder="Optional material code"
                />
              </div>
            </div>

            <Separator />

            {/* HS Code Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">HS Code (Regulatory)</h3>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="manual-override"
                    checked={manualOverride}
                    onCheckedChange={(checked) => setManualOverride(checked as boolean)}
                  />
                  <Label htmlFor="manual-override" className="text-sm font-normal cursor-pointer">
                    Enable manual override
                  </Label>
                </div>
              </div>

              {/* Auto Suggested Values (Reference) */}
              {!manualOverride && (autoSuggested.hs_code || autoSuggested.import_duty_rate !== null) && (
                <div className="p-3 bg-slate-50 rounded-md space-y-2">
                  <p className="text-xs font-medium text-slate-600">Auto Suggested Values:</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-600">HS Code:</span>
                      <div className="font-mono">{autoSuggested.hs_code || '—'}</div>
                    </div>
                    <div>
                      <span className="text-slate-600">Duty Rate:</span>
                      <div>{autoSuggested.import_duty_rate !== null ? `${autoSuggested.import_duty_rate}%` : '—'}</div>
                    </div>
                    {autoSuggested.match_source && (
                      <div>
                        <span className="text-slate-600">Match Source:</span>
                        <div>
                          <Badge variant="outline" className="text-xs">
                            {autoSuggested.match_source}
                          </Badge>
                        </div>
                      </div>
                    )}
                    {autoSuggested.confidence !== null && autoSuggested.confidence !== undefined && (
                      <div>
                        <span className="text-slate-600">Confidence:</span>
                        <div>{(autoSuggested.confidence * 100).toFixed(1)}%</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Editable HS Code Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hs_code">HS Code</Label>
                    <div className="flex gap-2">
                      <Input
                        id="hs_code"
                        value={formData.hs_code || ''}
                        onChange={(e) => handleFieldChange('hs_code', e.target.value || null)}
                        disabled={!manualOverride}
                        placeholder="e.g., 7306.40.2000"
                        className="font-mono"
                      />
                      {manualOverride && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setHsLookupOpen(true)}
                          title="Lookup HS Code"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="import_duty_rate">Import Duty Rate (%)</Label>
                    <Input
                      id="import_duty_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.import_duty_rate !== null ? formData.import_duty_rate : ''}
                      onChange={(e) =>
                        handleFieldChange(
                          'import_duty_rate',
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      disabled={!manualOverride}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Read-only metadata */}
                {item && (
                  <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
                    <div>
                      <span className="font-medium">Match Source:</span>{' '}
                      <Badge variant="outline" className="ml-2">
                        {item.hs_match_source || 'NONE'}
                      </Badge>
                    </div>
                    {item.hs_confidence !== null && item.hs_confidence !== undefined && (
                      <div>
                        <span className="font-medium">Confidence:</span>{' '}
                        <span className="ml-2">{(item.hs_confidence * 100).toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Final Duty Section (Phase 5) */}
            {finalDutyData && (finalDutyData.trade_agreement || finalDutyData.final_import_duty_rate !== null) && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">Final Duty Calculation</h3>
                <div className="p-3 bg-blue-50 rounded-md space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-600">Detected Agreement:</span>
                      <div className="font-medium text-slate-900">
                        <Badge variant="outline">{finalDutyData.trade_agreement || 'MFN'}</Badge>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-600">Final Duty Rate:</span>
                      <div className="font-medium text-slate-900">
                        {finalDutyData.final_import_duty_rate !== null
                          ? `${finalDutyData.final_import_duty_rate}%`
                          : '—'}
                      </div>
                    </div>
                    {finalDutyData.final_import_duty_amount !== null && (
                      <div className="col-span-2">
                        <span className="text-slate-600">Final Duty Amount:</span>
                        <div className="font-medium text-slate-900">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          }).format(finalDutyData.final_import_duty_amount)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : item ? 'Save Changes' : 'Add Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HS Code Lookup Modal - Removed (de-engineered regulatory features) */}
    </>
  );
}

