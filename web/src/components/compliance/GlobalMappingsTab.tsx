/**
 * Global Mappings Tab - Phase 8 Compliance Center
 * 
 * Manage global keyword to HS code mappings
 */

import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { Button } from '../ui/button';
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

interface GlobalMapping {
  id: string;
  keyword: string;
  hs_code_id: string;
  hs_code?: string;
  hs_description?: string;
  category?: string;
  priority: number;
  created_at: string;
}

export default function GlobalMappingsTab() {
  const [mappings, setMappings] = useState<GlobalMapping[]>([]);
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

      const response = await apiRequest('/regulatory/global-mappings');
      
      if (response.success) {
        setMappings(response.data || []);
      } else {
        setError(response.error || 'Failed to load global mappings');
      }
    } catch (err) {
      setError('Failed to load global mappings');
      console.error('Error loading mappings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mapping?')) return;

    try {
      const response = await apiRequest(`/regulatory/global-mappings/${id}`, {
        method: 'DELETE',
      });

      if (response.success) {
        await loadMappings();
      } else {
        setError(response.error || 'Failed to delete mapping');
      }
    } catch (err) {
      setError('Failed to delete mapping');
      console.error('Error deleting mapping:', err);
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
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search mappings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Mapping
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead>HS Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                  No global mappings found
                </TableCell>
              </TableRow>
            ) : (
              filteredMappings.map((mapping) => (
                <TableRow key={mapping.id}>
                  <TableCell className="font-semibold">{mapping.keyword}</TableCell>
                  <TableCell className="font-mono">{mapping.hs_code || 'N/A'}</TableCell>
                  <TableCell className="max-w-md truncate text-sm text-gray-600">
                    {mapping.hs_description || 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={mapping.priority <= 5 ? 'default' : 'secondary'}>
                      {mapping.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(mapping.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <div className="text-sm text-gray-600">
        Showing {filteredMappings.length} of {mappings.length} global mappings
      </div>
    </div>
  );
}

