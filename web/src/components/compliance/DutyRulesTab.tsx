/**
 * Duty Rules Tab - Phase 8 Compliance Center
 * 
 * View and manage versioned duty rules
 */

import { useEffect, useState } from 'react';
import { FileCode, Calendar } from 'lucide-react';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { request as apiRequest } from '../../api/client';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertDescription } from '../ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface DutyRule {
  id: string;
  match: {
    category?: string[];
    origin?: string[];
    hs_prefix?: string[];
  };
  effective_from: string;
  effective_to: string | null;
  overrideRate?: number | null;
  addToRate?: number | null;
  reason: string;
}

export default function DutyRulesTab() {
  const [rules, setRules] = useState<DutyRule[]>([]);
  const [version, setVersion] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiRequest('/regulatory/versioned-rules');
      
      if (response.success) {
        setRules(response.rules || []);
        setVersion(response.version || 'N/A');
      } else {
        setError(response.error || 'Failed to load versioned rules');
      }
    } catch (err) {
      setError('Failed to load versioned rules');
      console.error('Error loading rules:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Version Info Card */}
      <Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-purple-900 dark:text-purple-100">
            <FileCode className="h-5 w-5" />
            Versioned Duty Rules - {version}
          </CardTitle>
          <CardDescription className="text-purple-700 dark:text-purple-300">
            Configuration-driven duty rules with effective date ranges. Rules are loaded from backend/src/config/regulatory/dutyRules.versioned.json
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule ID</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead>Effect</TableHead>
              <TableHead>Effective Period</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                  No versioned rules found
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono font-semibold">{rule.id}</TableCell>
                  <TableCell>
                    <div className="space-y-1 text-sm">
                      {rule.match.category && (
                        <div>
                          <span className="text-gray-600">Category:</span>{' '}
                          <Badge variant="outline">{rule.match.category.join(', ')}</Badge>
                        </div>
                      )}
                      {rule.match.origin && (
                        <div>
                          <span className="text-gray-600">Origin:</span>{' '}
                          <Badge variant="outline">{rule.match.origin.join(', ')}</Badge>
                        </div>
                      )}
                      {rule.match.hs_prefix && (
                        <div>
                          <span className="text-gray-600">HS Prefix:</span>{' '}
                          <Badge variant="outline">{rule.match.hs_prefix.join(', ')}</Badge>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {rule.overrideRate !== null && rule.overrideRate !== undefined ? (
                      <Badge className="bg-orange-600">Override: {rule.overrideRate}%</Badge>
                    ) : rule.addToRate !== null && rule.addToRate !== undefined ? (
                      <Badge className="bg-blue-600">Add: +{rule.addToRate}%</Badge>
                    ) : (
                      <span className="text-gray-400">No effect</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span>{new Date(rule.effective_from).toLocaleDateString()}</span>
                      <span className="text-gray-400">→</span>
                      <span>{rule.effective_to ? new Date(rule.effective_to).toLocaleDateString() : 'Current'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-gray-600">
                    {rule.reason}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <div className="text-sm text-gray-600">
        {rules.length} versioned duty rules configured
      </div>
    </div>
  );
}

