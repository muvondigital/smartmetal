import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { CheckCircle2, AlertCircle, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '../../lib/formatters';

/**
 * Dual Pricing Data Structure (from backend)
 */
export interface DualPricingData {
  primary: {
    origin_type: 'CHINA' | 'NON_CHINA';
    unit_price: number;
    total_price: number;
    base_cost: number;
    markup_pct: number;
    logistics_pct: number;
    risk_pct: number;
  };
  alternative: {
    origin_type: 'CHINA' | 'NON_CHINA';
    unit_price: number;
    total_price: number;
    base_cost: number;
    markup_pct: number;
    logistics_pct: number;
    risk_pct: number;
  };
  recommended: 'CHINA' | 'NON_CHINA';
  recommendation_reason: string;
  allowed_origins: ('CHINA' | 'NON_CHINA')[];
}

/**
 * Origin Selection Data Structure (from backend)
 */
export interface OriginSelectionData {
  allowedOrigins: ('CHINA' | 'NON_CHINA')[];
  recommendedOrigin: 'CHINA' | 'NON_CHINA' | null;
  recommendationReason: string | null;
  restrictions: Array<{
    type: string;
    reason: string;
    severity: string;
  }>;
  checks: {
    certification?: any;
    clientRestriction?: any;
    riskCategory?: any;
    aml?: any;
    operatorRules?: any;
  };
}

interface DualPricingDisplayProps {
  dualPricingData: DualPricingData | null;
  originSelectionData: OriginSelectionData | null;
  quantity: number;
  currency?: string;
  itemDescription?: string;
  // Fallback data for single-origin items
  fallbackItemData?: {
    origin_type: string | null;
    unit_price: number;
    total_price: number;
    base_cost: number;
    markup_pct: number;
    logistics_cost: number;
    risk_pct: number;
  };
}

/**
 * Dual Pricing Display Component
 * 
 * Displays both China and Non-China pricing options side-by-side,
 * highlighting the recommended option with justification.
 */
export function DualPricingDisplay({
  dualPricingData,
  originSelectionData,
  quantity,
  currency = 'USD',
  itemDescription,
  fallbackItemData,
}: DualPricingDisplayProps) {
  // Handle single-origin case when dualPricingData is null
  if (!dualPricingData && fallbackItemData) {
    const originType = (fallbackItemData.origin_type || 'NON_CHINA').toUpperCase() as 'CHINA' | 'NON_CHINA';
    const isChina = originType === 'CHINA';
    
    // Calculate logistics percentage from cost
    const logisticsPct = fallbackItemData.base_cost > 0
      ? (fallbackItemData.logistics_cost / fallbackItemData.base_cost) * 100
      : 0;

    // Get restriction reason if available
    const restrictionReason = originSelectionData?.restrictions && originSelectionData.restrictions.length > 0
      ? originSelectionData.restrictions[0].reason
      : null;

    return (
      <div className="space-y-4">
        {/* Single Origin Info Banner */}
        <div className="rounded-lg border p-3 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 text-blue-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">
                Single Origin Available: {isChina ? 'China' : 'Non-China'}
              </p>
              {restrictionReason && (
                <p className="text-xs text-slate-600 mt-0.5">
                  {restrictionReason}
                </p>
              )}
              {!restrictionReason && originSelectionData?.recommendationReason && (
                <p className="text-xs text-slate-600 mt-0.5">
                  {originSelectionData.recommendationReason}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Single Origin Card */}
        <div className="grid grid-cols-1 gap-4">
          <Card className="relative ring-2 ring-blue-500 border-blue-300">
            <div className="absolute -top-2 -right-2">
              <Badge className="bg-blue-600 text-white">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Available
              </Badge>
            </div>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {isChina ? 'China' : 'Non-China'}
                </CardTitle>
                <Badge variant="default">
                  {originType}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {quantity} {itemDescription ? `× ${itemDescription}` : 'units'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Unit Price</span>
                  <span className="text-lg font-semibold text-slate-900">
                    {formatCurrency(fallbackItemData.unit_price, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Total Price</span>
                  <span className="text-xl font-bold text-slate-900">
                    {formatCurrency(fallbackItemData.total_price, currency)}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Base Cost</span>
                  <span className="text-slate-700">{formatCurrency(fallbackItemData.base_cost, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Markup</span>
                  <span className="text-slate-700">{fallbackItemData.markup_pct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Logistics</span>
                  <span className="text-slate-700">{logisticsPct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Risk Buffer</span>
                  <span className="text-slate-700">{fallbackItemData.risk_pct.toFixed(1)}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Restrictions Info */}
        {originSelectionData && originSelectionData.restrictions.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">Origin Restrictions</p>
                <ul className="mt-1 space-y-1">
                  {originSelectionData.restrictions.map((restriction, idx) => (
                    <li key={idx} className="text-xs text-amber-800">
                      • {restriction.reason}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // If no dual pricing data and no fallback, don't render
  if (!dualPricingData) {
    return null;
  }

  const { primary, alternative, recommended, recommendation_reason, allowed_origins } = dualPricingData;
  const isPrimaryRecommended = recommended === primary.origin_type;
  const isAlternativeRecommended = recommended === alternative.origin_type;

  // Calculate price difference
  const priceDifference = alternative.unit_price - primary.unit_price;
  const priceDifferencePercent = primary.unit_price > 0 
    ? ((priceDifference / primary.unit_price) * 100).toFixed(1)
    : '0.0';

  // Format origin names
  const formatOriginName = (origin: 'CHINA' | 'NON_CHINA') => {
    return origin === 'CHINA' ? 'China' : 'Non-China';
  };

  // Get origin badge color
  const getOriginBadgeVariant = (origin: 'CHINA' | 'NON_CHINA', isRecommended: boolean) => {
    if (isRecommended) {
      return 'default';
    }
    return 'outline';
  };

  return (
    <div className="space-y-4">
      {/* Recommendation Banner */}
      {recommendation_reason && (
        <div className={`rounded-lg border p-3 ${
          isPrimaryRecommended 
            ? 'bg-blue-50 border-blue-200' 
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-start gap-2">
            <Info className={`h-4 w-4 mt-0.5 ${
              isPrimaryRecommended ? 'text-blue-600' : 'text-amber-600'
            }`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">
                Recommended: {formatOriginName(recommended)}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {recommendation_reason}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Dual Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Primary Origin Card */}
        <Card className={`relative ${
          isPrimaryRecommended 
            ? 'ring-2 ring-blue-500 border-blue-300' 
            : 'border-slate-200'
        }`}>
          {isPrimaryRecommended && (
            <div className="absolute -top-2 -right-2">
              <Badge className="bg-blue-600 text-white">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Recommended
              </Badge>
            </div>
          )}
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {formatOriginName(primary.origin_type)}
              </CardTitle>
              <Badge variant={getOriginBadgeVariant(primary.origin_type, isPrimaryRecommended)}>
                {primary.origin_type}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              {quantity} {itemDescription ? `× ${itemDescription}` : 'units'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Pricing Summary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Unit Price</span>
                <span className="text-lg font-semibold text-slate-900">
                  {formatCurrency(primary.unit_price, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Price</span>
                <span className="text-xl font-bold text-slate-900">
                  {formatCurrency(primary.total_price, currency)}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Base Cost</span>
                <span className="text-slate-700">{formatCurrency(primary.base_cost, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Markup</span>
                <span className="text-slate-700">{primary.markup_pct.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Logistics</span>
                <span className="text-slate-700">{primary.logistics_pct.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Risk Buffer</span>
                <span className="text-slate-700">{primary.risk_pct.toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alternative Origin Card */}
        <Card className={`relative ${
          isAlternativeRecommended 
            ? 'ring-2 ring-blue-500 border-blue-300' 
            : 'border-slate-200'
        }`}>
          {isAlternativeRecommended && (
            <div className="absolute -top-2 -right-2">
              <Badge className="bg-blue-600 text-white">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Recommended
              </Badge>
            </div>
          )}
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {formatOriginName(alternative.origin_type)}
              </CardTitle>
              <Badge variant={getOriginBadgeVariant(alternative.origin_type, isAlternativeRecommended)}>
                {alternative.origin_type}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              {quantity} {itemDescription ? `× ${itemDescription}` : 'units'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Pricing Summary */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Unit Price</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-slate-900">
                    {formatCurrency(alternative.unit_price, currency)}
                  </span>
                  {priceDifference !== 0 && (
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        priceDifference > 0 
                          ? 'text-red-600 border-red-300' 
                          : 'text-green-600 border-green-300'
                      }`}
                    >
                      {priceDifference > 0 ? (
                        <TrendingUp className="h-3 w-3 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-1" />
                      )}
                      {priceDifference > 0 ? '+' : ''}{priceDifferencePercent}%
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Price</span>
                <span className="text-xl font-bold text-slate-900">
                  {formatCurrency(alternative.total_price, currency)}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Base Cost</span>
                <span className="text-slate-700">{formatCurrency(alternative.base_cost, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Markup</span>
                <span className="text-slate-700">{alternative.markup_pct.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Logistics</span>
                <span className="text-slate-700">{alternative.logistics_pct.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Risk Buffer</span>
                <span className="text-slate-700">{alternative.risk_pct.toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Restrictions/Checks Info */}
      {originSelectionData && originSelectionData.restrictions.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">Origin Restrictions</p>
              <ul className="mt-1 space-y-1">
                {originSelectionData.restrictions.map((restriction, idx) => (
                  <li key={idx} className="text-xs text-amber-800">
                    • {restriction.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

