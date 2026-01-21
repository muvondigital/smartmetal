/**
 * HS Code Library Tab - Phase 8 Compliance Center
 * 
 * Manage HS code master data
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { request as apiRequest } from '../../api/client';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertDescription } from '../ui/alert';
import { formatDate } from '../../lib/formatters';

interface HsCode {
  id: string;
  hs_code: string;
  description: string;
  category: string;
  material_group: string;
  origin_restrictions?: any;
  notes?: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export default function HsCodeLibraryTab() {
  const [hsCodes, setHsCodes] = useState<HsCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<HsCode | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    hs_code: '',
    description: '',
    category: 'PIPE',
    material_group: 'CARBON_STEEL',
    notes: '',
  });

  useEffect(() => {
    loadHsCodes();
  }, [categoryFilter]);

  const loadHsCodes = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);

      const response = await apiRequest(`/regulatory/hs-codes?${params.toString()}`);
      
      if (response.success) {
        setHsCodes(response.data || []);
      } else {
        setError(response.error || 'Failed to load HS codes');
      }
    } catch (err) {
      setError('Failed to load HS codes');
      console.error('Error loading HS codes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (editingCode) {
        // Update existing
        const response = await apiRequest(`/regulatory/hs-codes/${editingCode.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (response.success) {
          await loadHsCodes();
          setIsDialogOpen(false);
          resetForm();
        } else {
          setError(response.error || 'Failed to update HS code');
        }
      } else {
        // Create new
        const response = await apiRequest('/regulatory/hs-codes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (response.success) {
          await loadHsCodes();
          setIsDialogOpen(false);
          resetForm();
        } else {
          setError(response.error || 'Failed to create HS code');
        }
      }
    } catch (err) {
      setError('Failed to save HS code');
      console.error('Error saving HS code:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this HS code?')) return;

    try {
      const response = await apiRequest(`/regulatory/hs-codes/${id}`, {
        method: 'DELETE',
      });

      if (response.success) {
        await loadHsCodes();
      } else {
        setError(response.error || 'Failed to delete HS code');
      }
    } catch (err) {
      setError('Failed to delete HS code');
      console.error('Error deleting HS code:', err);
    }
  };

  const handleEdit = (code: HsCode) => {
    setEditingCode(code);
    setFormData({
      hs_code: code.hs_code,
      description: code.description,
      category: code.category,
      material_group: code.material_group,
      notes: code.notes || '',
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingCode(null);
    setFormData({
      hs_code: '',
      description: '',
      category: 'PIPE',
      material_group: 'CARBON_STEEL',
      notes: '',
    });
  };

  const filteredHsCodes = hsCodes.filter((code) => {
    const matchesSearch = searchTerm === '' ||
      code.hs_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      code.description.toLowerCase().includes(searchTerm.toLowerCase());
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
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search HS codes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Categories</SelectItem>
              <SelectItem value="PIPE">PIPE</SelectItem>
              <SelectItem value="FLANGE">FLANGE</SelectItem>
              <SelectItem value="FITTING">FITTING</SelectItem>
              <SelectItem value="FASTENER">FASTENER</SelectItem>
              <SelectItem value="VALVE">VALVE</SelectItem>
              <SelectItem value="OTHER">OTHER</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add HS Code
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingCode ? 'Edit HS Code' : 'Add New HS Code'}</DialogTitle>
              <DialogDescription>
                {editingCode ? 'Update the HS code details below.' : 'Add a new HS code to the library.'}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hs_code">HS Code *</Label>
                  <Input
                    id="hs_code"
                    value={formData.hs_code}
                    onChange={(e) => setFormData({ ...formData, hs_code: e.target.value })}
                    placeholder="e.g., 7306.40.2000"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger id="category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PIPE">PIPE</SelectItem>
                      <SelectItem value="FLANGE">FLANGE</SelectItem>
                      <SelectItem value="FITTING">FITTING</SelectItem>
                      <SelectItem value="FASTENER">FASTENER</SelectItem>
                      <SelectItem value="VALVE">VALVE</SelectItem>
                      <SelectItem value="OTHER">OTHER</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., Seamless steel pipes"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="material_group">Material Group *</Label>
                <Select
                  value={formData.material_group}
                  onValueChange={(value) => setFormData({ ...formData, material_group: value })}
                >
                  <SelectTrigger id="material_group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CARBON_STEEL">Carbon Steel</SelectItem>
                    <SelectItem value="STAINLESS_STEEL">Stainless Steel</SelectItem>
                    <SelectItem value="ALLOY_STEEL">Alloy Steel</SelectItem>
                    <SelectItem value="DUPLEX_STEEL">Duplex Steel</SelectItem>
                    <SelectItem value="NICKEL_ALLOY">Nickel Alloy</SelectItem>
                    <SelectItem value="COPPER_ALLOY">Copper Alloy</SelectItem>
                    <SelectItem value="ALUMINUM">Aluminum</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setIsDialogOpen(false);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingCode ? 'Update' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>HS Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Material Group</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredHsCodes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                  No HS codes found
                </TableCell>
              </TableRow>
            ) : (
              filteredHsCodes.map((code) => (
                <TableRow key={code.id}>
                  <TableCell className="font-mono font-semibold">{code.hs_code}</TableCell>
                  <TableCell className="max-w-md truncate">{code.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{code.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600">
                      {code.material_group.replace('_', ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {formatDate(code.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(code)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(code.id)}
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
        Showing {filteredHsCodes.length} of {hsCodes.length} HS codes
      </div>
    </div>
  );
}

