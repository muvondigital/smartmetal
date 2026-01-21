import { DollarSign, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface TaxBreakdownProps {
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  taxType?: string;
  taxCountry?: string;
  totalWithTax: number;
  currency?: string;
}

export function TaxBreakdown({
  subtotal,
  taxAmount,
  taxRate,
  taxType,
  taxCountry,
  totalWithTax,
  currency = 'USD'
}: TaxBreakdownProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount);
  };

  const taxPercentage = (taxRate * 100).toFixed(1);
  const taxLabel = getTaxLabel(taxType, taxCountry);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" />
          Price Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Subtotal */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Subtotal</span>
            <span className="text-sm font-medium text-slate-900">
              {formatCurrency(subtotal)}
            </span>
          </div>

          {/* Tax */}
          {taxAmount > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">
                    {taxLabel} ({taxPercentage}%)
                  </span>
                  {taxCountry && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {taxCountry}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-slate-900">
                  +{formatCurrency(taxAmount)}
                </span>
              </div>

              {/* Separator */}
              <div className="border-t border-slate-200" />
            </>
          )}

          {/* Total */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-base font-semibold text-slate-900">
              Total {taxAmount > 0 ? '(incl. tax)' : ''}
            </span>
            <span className="text-lg font-bold text-teal-600">
              {formatCurrency(totalWithTax)}
            </span>
          </div>

          {/* Tax Info */}
          {taxAmount === 0 && (
            <div className="mt-2 rounded bg-amber-50 p-2">
              <p className="text-xs text-amber-800">
                <span className="font-semibold">Note:</span> No tax applied. Tax may be added based on client location or exemption status.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Get human-readable tax label
 */
function getTaxLabel(taxType?: string, taxCountry?: string): string {
  if (!taxType) return 'Tax';

  const labels: Record<string, Record<string, string>> = {
    SST: {
      MY: 'Sales & Service Tax (SST)',
      default: 'SST'
    },
    VAT: {
      ID: 'PPN (VAT)',
      default: 'VAT'
    },
    GST: {
      SG: 'GST',
      default: 'GST'
    }
  };

  const typeLabels = labels[taxType];
  if (!typeLabels) return taxType;

  return typeLabels[taxCountry || ''] || typeLabels.default || taxType;
}

/**
 * Compact inline tax breakdown (for tables/summary cards)
 */
export function InlineTaxBreakdown({
  subtotal,
  taxAmount,
  taxRate,
  totalWithTax,
  currency = 'USD'
}: Omit<TaxBreakdownProps, 'taxType' | 'taxCountry'>) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount);
  };

  const taxPercentage = (taxRate * 100).toFixed(1);

  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between text-slate-600">
        <span>Subtotal:</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>
      {taxAmount > 0 && (
        <div className="flex justify-between text-slate-600">
          <span>Tax ({taxPercentage}%):</span>
          <span>+{formatCurrency(taxAmount)}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
        <span>Total:</span>
        <span>{formatCurrency(totalWithTax)}</span>
      </div>
    </div>
  );
}
