/**
 * Material Detail Page
 *
 * Displays detailed information about a single material.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Alert } from '../components/ui/alert';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { getMaterialById, updateMaterial, deleteMaterial, type UpdateMaterialPayload } from '../api/materials';
import type { Material } from '../types/materials';
import { toast } from 'sonner';
import {
  getCategoryBadgeVariant,
  formatCategory,
  formatMaterialDescription,
  formatMoney,
  formatOrigin,
} from '../lib/materialHelpers';

export default function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editData, setEditData] = useState<UpdateMaterialPayload>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  
  // Delete confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchMaterial(id);
    }
  }, [id]);

  const fetchMaterial = async (materialId: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMaterialById(materialId);
      setMaterial(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load material');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/materials');
  };

  const handleEdit = () => {
    if (!material) return;
    
    setEditData({
      category: material.category || '',
      origin_type: material.origin_type || 'NON_CHINA',
      base_cost: material.base_cost || 0,
      currency: material.currency || 'USD',
      spec_standard: material.spec_standard || '',
      grade: material.grade || '',
      material_type: material.material_type || '',
      size_description: material.size_description || '',
      notes: material.notes || '',
    });
    setEditErrors({});
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditErrors({});
  };

  const validateEditForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!editData.category?.trim()) {
      errors.category = 'Category is required';
    }
    
    if (!editData.origin_type) {
      errors.origin_type = 'Origin type is required';
    }
    
    if (editData.base_cost !== undefined && editData.base_cost < 0) {
      errors.base_cost = 'Base cost must be a positive number';
    }
    
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmitEdit = async () => {
    if (!material || !id) return;
    
    if (!validateEditForm()) {
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateMaterial(id, editData);
      setMaterial(updated);
      toast.success('Material updated successfully');
      setShowEditModal(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update material';
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!id) return;
    
    setDeleting(true);
    try {
      await deleteMaterial(id);
      toast.success('Material deleted successfully');
      navigate('/materials');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete material';
      toast.error(errorMessage);
      setShowDeleteDialog(false);
    } finally {
      setDeleting(false);
    }
  };

  const formatNotes = (notes: string | null | undefined): React.ReactNode => {
    if (!notes) return '-';

    try {
      const notesObj = JSON.parse(notes);
      return (
        <div className="space-y-1">
          {Object.entries(notesObj).map(([key, value]) => (
            <div key={key} className="text-sm">
              <span className="font-medium text-slate-700">{key}:</span>{' '}
              <span className="text-slate-900">{String(value)}</span>
            </div>
          ))}
        </div>
      );
    } catch {
      return <span className="text-sm text-slate-900">{notes}</span>;
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-6 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64 md:col-span-2" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive" className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Failed to load material</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleBack}>
                Back to Catalog
              </Button>
              <Button variant="outline" size="sm" onClick={() => id && fetchMaterial(id)}>
                Retry
              </Button>
            </div>
          </div>
        </Alert>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <p className="font-medium">Material not found</p>
          <Button variant="outline" size="sm" onClick={handleBack} className="mt-2">
            Back to Catalog
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={handleBack} className="mb-4">
        ← Back to Catalog
      </Button>

      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold font-mono text-slate-900 mb-2">
              {material.material_code}
            </h1>
            <p className="text-lg text-slate-600">
              {formatMaterialDescription(material)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleEdit}>
              Edit Material
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Overview Card */}
        <Card>
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-600">SKU</label>
              <p className="text-base font-mono text-slate-900 mt-1">
                {material.material_code}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600">Category</label>
              <div className="mt-1">
                <Badge variant={getCategoryBadgeVariant(material.category || '')}>
                  {formatCategory(material.category || '')}
                </Badge>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600">Description</label>
              <p className="text-base text-slate-900 mt-1">
                {formatMaterialDescription(material)}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600">Origin</label>
              <p className="text-base text-slate-900 mt-1">
                {formatOrigin(material.origin_type)}
              </p>
            </div>
          </div>
        </Card>

        {/* Technical Attributes Card */}
        <Card>
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Technical Attributes</h2>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-600">Material Type</label>
              <p className="text-base text-slate-900 mt-1">
                {material.material_type || '-'}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600">Standard / Specification</label>
              <p className="text-base text-slate-900 mt-1">
                {material.spec_standard || '-'}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600">Grade</label>
              <p className="text-base text-slate-900 mt-1">
                {material.grade || '-'}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600">Size Description</label>
              <p className="text-base text-slate-900 mt-1">
                {material.size_description || '-'}
              </p>
            </div>
          </div>
        </Card>

        {/* Pricing & Metadata Card */}
        <Card className="md:col-span-2">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Pricing & Metadata</h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-sm font-medium text-slate-600">Base Cost</label>
                <p className="text-xl font-semibold text-slate-900 mt-1">
                  {formatMoney(material.base_cost, material.currency)}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600">Currency</label>
                <p className="text-base text-slate-900 mt-1">
                  {material.currency || 'USD'}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600">Material ID</label>
                <p className="text-base font-mono text-slate-600 mt-1 text-xs">
                  {material.id}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600">Created At</label>
                <p className="text-base text-slate-900 mt-1">
                  {material.created_at
                    ? new Date(material.created_at).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-'}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600">Updated At</label>
                <p className="text-base text-slate-900 mt-1">
                  {material.updated_at
                    ? new Date(material.updated_at).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-'}
                </p>
              </div>

              <div className="md:col-span-3">
                <label className="text-sm font-medium text-slate-600">Notes</label>
                <div className="mt-1 p-3 bg-slate-50 rounded-md border border-slate-200">
                  {formatNotes(material.notes)}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Edit Material Dialog */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Material</DialogTitle>
            <DialogDescription>
              Update material information. Material code cannot be changed.
            </DialogDescription>
          </DialogHeader>

          {material && (
            <div className="space-y-4 py-4">
              {/* Material Code (read-only) */}
              <div>
                <Label htmlFor="edit_material_code">Material Code (SKU)</Label>
                <Input
                  id="edit_material_code"
                  value={material.material_code}
                  disabled
                  className="bg-slate-50"
                />
                <p className="text-xs text-slate-500 mt-1">Material code cannot be changed</p>
              </div>

              {/* Category */}
              <div>
                <Label htmlFor="edit_category">
                  Category <span className="text-red-500">*</span>
                </Label>
                <select
                  id="edit_category"
                  value={editData.category || ''}
                  onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                  className={`w-full px-3 py-2 text-sm bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    editErrors.category ? 'border-red-500' : 'border-slate-300'
                  }`}
                >
                  <option value="PIPE">PIPE</option>
                  <option value="FLANGE">FLANGE</option>
                  <option value="FITTING">FITTING</option>
                  <option value="FASTENER">FASTENER</option>
                  <option value="STEEL">STEEL</option>
                  <option value="GASKET">GASKET</option>
                  <option value="GRATING">GRATING</option>
                </select>
                {editErrors.category && (
                  <p className="text-sm text-red-500 mt-1">{editErrors.category}</p>
                )}
              </div>

              {/* Origin Type */}
              <div>
                <Label htmlFor="edit_origin_type">
                  Origin Type <span className="text-red-500">*</span>
                </Label>
                <select
                  id="edit_origin_type"
                  value={editData.origin_type || 'NON_CHINA'}
                  onChange={(e) => setEditData({ ...editData, origin_type: e.target.value })}
                  className={`w-full px-3 py-2 text-sm bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    editErrors.origin_type ? 'border-red-500' : 'border-slate-300'
                  }`}
                >
                  <option value="CHINA">CHINA</option>
                  <option value="NON_CHINA">NON_CHINA</option>
                  <option value="BOTH">BOTH</option>
                </select>
                {editErrors.origin_type && (
                  <p className="text-sm text-red-500 mt-1">{editErrors.origin_type}</p>
                )}
              </div>

              {/* Base Cost */}
              <div>
                <Label htmlFor="edit_base_cost">
                  Base Cost <span className="text-red-500">*</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="edit_base_cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editData.base_cost || ''}
                    onChange={(e) => setEditData({ ...editData, base_cost: parseFloat(e.target.value) || 0 })}
                    className={editErrors.base_cost ? 'border-red-500' : ''}
                  />
                  <select
                    value={editData.currency || 'USD'}
                    onChange={(e) => setEditData({ ...editData, currency: e.target.value })}
                    className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="USD">USD</option>
                    <option value="MYR">MYR</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>
                {editErrors.base_cost && (
                  <p className="text-sm text-red-500 mt-1">{editErrors.base_cost}</p>
                )}
              </div>

              {/* Optional Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_spec_standard">Specification Standard</Label>
                  <Input
                    id="edit_spec_standard"
                    value={editData.spec_standard || ''}
                    onChange={(e) => setEditData({ ...editData, spec_standard: e.target.value })}
                    placeholder="e.g., ASTM A106"
                  />
                </div>

                <div>
                  <Label htmlFor="edit_grade">Grade</Label>
                  <Input
                    id="edit_grade"
                    value={editData.grade || ''}
                    onChange={(e) => setEditData({ ...editData, grade: e.target.value })}
                    placeholder="e.g., GR.B"
                  />
                </div>

                <div>
                  <Label htmlFor="edit_material_type">Material Type</Label>
                  <Input
                    id="edit_material_type"
                    value={editData.material_type || ''}
                    onChange={(e) => setEditData({ ...editData, material_type: e.target.value })}
                    placeholder="e.g., Carbon Steel"
                  />
                </div>

                <div>
                  <Label htmlFor="edit_size_description">Size Description</Label>
                  <Input
                    id="edit_size_description"
                    value={editData.size_description || ''}
                    onChange={(e) => setEditData({ ...editData, size_description: e.target.value })}
                    placeholder={'e.g., 6" SCH40'}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label htmlFor="edit_notes">Notes</Label>
                <textarea
                  id="edit_notes"
                  value={editData.notes || ''}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  placeholder="Additional notes or specifications"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEditModal} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitEdit} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Material</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this material? This action cannot be undone.
              {material && (
                <span className="block mt-2 font-mono text-sm">
                  Material: {material.material_code}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Material'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
