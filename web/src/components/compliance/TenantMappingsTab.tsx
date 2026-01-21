/**
 * Tenant Mappings Tab - Phase 8 Compliance Center
 * 
 * Manage tenant-specific keyword mappings
 */

import { useEffect, useState } from 'react';
import { Search, Building2 } from 'lucide-react';
import { Input } from '../ui/input';
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

interface TenantMapping {
  id: string;
  keyword: string;
  hs_code_id: string;
  hs_code?: string;
  priority: number;
  source: string;
  created_at: string;
}

export default function TenantMappingsTab() {
  const [mappings, setMappings] = useState<TenantMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadMappings();
  }, []);

  const loadMappings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiRequest('/regulatory/tenant-mappings');
      
      if (response.success) {
        setMappings(response.data || []);
      } else {
        setError(response.error || 'Failed to load tenant mappings');
      }
    } catch (err) {
      setError('Failed to load tenant mappings');
      console.error('Error loading mappings:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredMappings = mappings.filter((mapping) => {
    const matchesSearch = searchTerm === '' ||
      mapping.keyword.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (mapping.hs_code && mapping.hs_code.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

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
      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
            <Building2 className="h-5 w-5" />
            Tenant-Specific Mappings
          </CardTitle>
          <CardDescription className="text-blue-700 dark:text-blue-300">
            These mappings override global mappings for your tenant. They are learned from your usage patterns or added manually.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Toolbar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search tenant mappings..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead>HS Code</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                  No tenant-specific mappings found
                </TableCell>
              </TableRow>
            ) : (
              filteredMappings.map((mapping) => (
                <TableRow key={mapping.id}>
                  <TableCell className="font-semibold">{mapping.keyword}</TableCell>
                  <TableCell className="font-mono">{mapping.hs_code || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant="default">{mapping.priority}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{mapping.source}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {new Date(mapping.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <div className="text-sm text-gray-600">
        Showing {filteredMappings.length} of {mappings.length} tenant mappings
      </div>
    </div>
  );
}

