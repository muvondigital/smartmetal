/**
 * Price Change Notifications Widget
 * 
 * Displays recent material price changes for dashboard visibility
 * Part of Phase 2: Manufacturer Price Management System
 */

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { getRecentPriceChanges, getPriceChangeStats, PriceChange, PriceChangeStats } from '../../services/priceImportApi';
import { formatCurrency } from '../../lib/formatters';
import { useNavigate } from 'react-router-dom';

export function PriceChangeNotifications() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [stats, setStats] = useState<PriceChangeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPriceChanges();
  }, []);

  const loadPriceChanges = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load both recent changes and stats
      const [recentChanges, priceStats] = await Promise.all([
        getRecentPriceChanges(7, 5), // Last 7 days, top 5 changes
        getPriceChangeStats(7) // Last 7 days stats
      ]);
      
      setChanges(recentChanges);
      setStats(priceStats);
    } catch (err) {
      console.error('Failed to load price changes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load price changes');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Price Changes
          </CardTitle>
          <CardDescription>Recent material price updates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            Price Changes
          </CardTitle>
          <CardDescription>Recent material price updates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-600">
            <p>Unable to load price changes.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadPriceChanges}
              className="mt-2"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show compact view if no changes
  const hasChanges = stats && stats.total_changes > 0;

  const formatChange = (change: number | null) => {
    if (change === null || change === undefined) return 'N/A';
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  // Compact empty state
  if (!hasChanges) {
    return (
      <Card className="py-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Price Changes</h3>
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={() => navigate('/materials')}
            className="text-xs h-auto p-0"
          >
            View All
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Recent material price updates</p>
        <div className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
          <div className="flex flex-col items-center">
            <span className="text-base font-semibold text-emerald-600">0</span>
            <span>Increases</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-base font-semibold text-rose-600">0</span>
            <span>Decreases</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-base font-semibold text-slate-600">0</span>
            <span>Materials</span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Price Changes
            </CardTitle>
            <CardDescription>
              {stats.total_changes} material{stats.total_changes !== 1 ? 's' : ''} updated this week
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/materials')}
            className="text-sm"
          >
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b">
          <div className="text-center">
            <div className="text-2xl font-semibold text-green-600">
              {stats.price_increases}
            </div>
            <div className="text-xs text-slate-600 mt-1">Increases</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-red-600">
              {stats.price_decreases}
            </div>
            <div className="text-xs text-slate-600 mt-1">Decreases</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-slate-600">
              {stats.materials_affected}
            </div>
            <div className="text-xs text-slate-600 mt-1">Materials</div>
          </div>
        </div>

        {/* Recent Changes List */}
        {changes.length > 0 ? (
          <div className="space-y-3">
            {changes.slice(0, 5).map((change) => (
              <div
                key={change.id}
                className="flex items-start justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {change.price_change_pct !== null && change.price_change_pct > 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0" />
                    ) : change.price_change_pct !== null && change.price_change_pct < 0 ? (
                      <TrendingDown className="w-4 h-4 text-red-600 flex-shrink-0" />
                    ) : null}
                    <div className="font-medium text-sm truncate">
                      {change.material_name || change.material_code}
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {change.category}
                  </div>
                </div>
                <div className="text-right ml-4">
                  {change.previous_base_cost !== null && change.previous_base_cost > 0 ? (
                    <>
                      <div className="text-xs text-slate-500 line-through">
                        {formatCurrency(change.previous_base_cost)}
                      </div>
                      <div className="text-sm font-semibold">
                        {formatCurrency(change.new_base_cost)}
                      </div>
                      {change.price_change_pct !== null && (
                        <div
                          className={`text-xs font-medium mt-0.5 ${
                            change.price_change_pct > 0
                              ? 'text-green-600'
                              : change.price_change_pct < 0
                              ? 'text-red-600'
                              : 'text-slate-600'
                          }`}
                        >
                          {formatChange(change.price_change_pct)}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm font-semibold">
                      {formatCurrency(change.new_base_cost)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-600 text-center py-4">
            No recent price changes
          </div>
        )}

        {/* View More Link */}
        {stats.total_changes > 5 && (
          <div className="mt-4 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate('/materials')}
            >
              View {stats.total_changes - 5} more changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

