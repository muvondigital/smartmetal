/**
 * Materials Catalog Page
 *
 * Browse and search the materials catalog with advanced filtering.
 */

import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Alert } from '../components/ui/alert';
import { Skeleton } from '../components/ui/skeleton';
import { MaterialsTable } from '../components/materials/MaterialsTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { getAllMaterials, createMaterial, type CreateMaterialPayload } from '../api/materials';
import type { Material } from '../types/materials';
import { toast } from 'sonner';
import {
  filterMaterials,
  getUniqueCategories,
  getUniqueMaterialTypes,
  getUniqueStandards,
  getUniqueOrigins,
} from '../lib/materialHelpers';

export default function MaterialsCatalog() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [materialTypeFilter, setMaterialTypeFilter] = useState('all');
  const [standardFilter, setStandardFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('all');

  // Add Material modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<CreateMaterialPayload>({
    material_code: '',
    category: '',
    origin_type: 'NON_CHINA',
    base_cost: 0,
    currency: 'USD',
    spec_standard: '',
    grade: '',
    material_type: '',
    size_description: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Fetch materials on mount
  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllMaterials();
      setMaterials(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  // Apply filters
  const filteredMaterials = filterMaterials(
    materials,
    search,
    categoryFilter,
    materialTypeFilter,
    standardFilter,
    originFilter
  );

  // Get unique values for filter dropdowns
  const categories = getUniqueCategories(materials);
  const materialTypes = getUniqueMaterialTypes(materials);
  const standards = getUniqueStandards(materials);
  const origins = getUniqueOrigins(materials);

  // Check if any filters are active
  const hasActiveFilters =
    search ||
    categoryFilter !== 'all' ||
    materialTypeFilter !== 'all' ||
    standardFilter !== 'all' ||
    originFilter !== 'all';

  const handleClearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setMaterialTypeFilter('all');
    setStandardFilter('all');
    setOriginFilter('all');
  };

  const handleAddMaterial = () => {
    setShowAddModal(true);
    setFormData({
      material_code: '',
      category: '',
      origin_type: 'NON_CHINA',
      base_cost: 0,
      currency: 'USD',
      spec_standard: '',
      grade: '',
      material_type: '',
      size_description: '',
      notes: '',
    });
    setFormErrors({});
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.material_code.trim()) {
      errors.material_code = 'Material code is required';
    }
    
    if (!formData.category.trim()) {
      errors.category = 'Category is required';
    }
    
    if (!formData.origin_type) {
      errors.origin_type = 'Origin type is required';
    }
    
    if (formData.base_cost === undefined || formData.base_cost < 0) {
      errors.base_cost = 'Base cost must be a positive number';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmitAddMaterial = async () => {
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      const newMaterial = await createMaterial(formData);
      toast.success('Material created successfully');
      setShowAddModal(false);
      // Refresh materials list
      await fetchMaterials();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create material';
      toast.error(errorMessage);
      if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
        setFormErrors({ material_code: 'Material code already exists' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Materials Catalog</h1>
          <p className="text-slate-600 mt-1">
            Browse and search materials used for pricing calculations
          </p>
        </div>
        <Button onClick={handleAddMaterial}>Add Material</Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Failed to load materials</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchMaterials}>
              Retry
            </Button>
          </div>
        </Alert>
      )}

      {/* Filters */}
      <div className="mb-6 space-y-4">
        {/* Search */}
        <div className="w-full">
          <Input
            type="text"
            placeholder="Search by SKU, description, standard, or size..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap gap-3 items-end">
          {/* Category Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Material Type Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Material
            </label>
            <select
              value={materialTypeFilter}
              onChange={(e) => setMaterialTypeFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Materials</option>
              {materialTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Standard Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Standard
            </label>
            <select
              value={standardFilter}
              onChange={(e) => setStandardFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Standards</option>
              {standards.map((std) => (
                <option key={std} value={std}>
                  {std}
                </option>
              ))}
            </select>
          </div>

          {/* Origin Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Origin
            </label>
            <select
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Origins</option>
              {origins.map((origin) => (
                <option key={origin} value={origin}>
                  {origin}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Card */}
      <Card>
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">All Materials</h2>
              {!loading && (
                <p className="text-sm text-slate-600 mt-1">
                  {filteredMaterials.length} {filteredMaterials.length === 1 ? 'material' : 'materials'}
                  {materials.length !== filteredMaterials.length && ` (filtered from ${materials.length})`}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
          {/* Loading State */}
          {loading && (
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="h-10 w-32" />
                </div>
              ))}
            </div>
          )}

          {/* Empty State (no materials in DB) */}
          {!loading && !error && materials.length === 0 && (
            <div className="text-center py-12">
              <div className="text-slate-400 mb-4">
                <svg
                  className="mx-auto h-12 w-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">
                No materials found
              </h3>
              <p className="text-slate-600 mb-4">
                Your materials catalog is empty. Import or add materials to get started.
              </p>
              <Button onClick={handleAddMaterial}>Add Material</Button>
            </div>
          )}

          {/* No Results State (filters produce 0 results) */}
          {!loading && !error && materials.length > 0 && filteredMaterials.length === 0 && (
            <div className="text-center py-12">
              <div className="text-slate-400 mb-4">
                <svg
                  className="mx-auto h-12 w-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">
                No materials match your filters
              </h3>
              <p className="text-slate-600 mb-4">
                Try adjusting your search or filter criteria
              </p>
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            </div>
          )}

          {/* Materials Table */}
          {!loading && !error && filteredMaterials.length > 0 && (
            <MaterialsTable materials={filteredMaterials} />
          )}
        </div>
      </Card>

      {/* Add Material Dialog */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Material</DialogTitle>
            <DialogDescription>
              Create a new material entry in the catalog. All fields marked with * are required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Material Code */}
            <div>
              <Label htmlFor="material_code">
                Material Code (SKU) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="material_code"
                value={formData.material_code}
                onChange={(e) => setFormData({ ...formData, material_code: e.target.value })}
                placeholder="e.g., PIPE-6-SCH40-CS"
                className={formErrors.material_code ? 'border-red-500' : ''}
              />
              {formErrors.material_code && (
                <p className="text-sm text-red-500 mt-1">{formErrors.material_code}</p>
              )}
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="category">
                Category <span className="text-red-500">*</span>
              </Label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className={`w-full px-3 py-2 text-sm bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  formErrors.category ? 'border-red-500' : 'border-slate-300'
                }`}
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="PIPE">PIPE</option>
                <option value="FLANGE">FLANGE</option>
                <option value="FITTING">FITTING</option>
                <option value="FASTENER">FASTENER</option>
                <option value="STEEL">STEEL</option>
                <option value="GASKET">GASKET</option>
                <option value="GRATING">GRATING</option>
              </select>
              {formErrors.category && (
                <p className="text-sm text-red-500 mt-1">{formErrors.category}</p>
              )}
            </div>

            {/* Origin Type */}
            <div>
              <Label htmlFor="origin_type">
                Origin Type <span className="text-red-500">*</span>
              </Label>
              <select
                id="origin_type"
                value={formData.origin_type}
                onChange={(e) => setFormData({ ...formData, origin_type: e.target.value })}
                className={`w-full px-3 py-2 text-sm bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  formErrors.origin_type ? 'border-red-500' : 'border-slate-300'
                }`}
              >
                <option value="CHINA">CHINA</option>
                <option value="NON_CHINA">NON_CHINA</option>
                <option value="BOTH">BOTH</option>
              </select>
              {formErrors.origin_type && (
                <p className="text-sm text-red-500 mt-1">{formErrors.origin_type}</p>
              )}
            </div>

            {/* Base Cost */}
            <div>
              <Label htmlFor="base_cost">
                Base Cost <span className="text-red-500">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="base_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.base_cost || ''}
                  onChange={(e) => setFormData({ ...formData, base_cost: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className={formErrors.base_cost ? 'border-red-500' : ''}
                />
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="USD">USD</option>
                  <option value="MYR">MYR</option>
                  <option value="CNY">CNY</option>
                </select>
              </div>
              {formErrors.base_cost && (
                <p className="text-sm text-red-500 mt-1">{formErrors.base_cost}</p>
              )}
            </div>

            {/* Optional Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="spec_standard">Specification Standard</Label>
                <Input
                  id="spec_standard"
                  value={formData.spec_standard || ''}
                  onChange={(e) => setFormData({ ...formData, spec_standard: e.target.value })}
                  placeholder="e.g., ASTM A106"
                />
              </div>

              <div>
                <Label htmlFor="grade">Grade</Label>
                <Input
                  id="grade"
                  value={formData.grade || ''}
                  onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  placeholder="e.g., GR.B"
                />
              </div>

              <div>
                <Label htmlFor="material_type">Material Type</Label>
                <Input
                  id="material_type"
                  value={formData.material_type || ''}
                  onChange={(e) => setFormData({ ...formData, material_type: e.target.value })}
                  placeholder="e.g., Carbon Steel"
                />
              </div>

              <div>
                <Label htmlFor="size_description">Size Description</Label>
                <Input
                  id="size_description"
                  value={formData.size_description || ''}
                  onChange={(e) => setFormData({ ...formData, size_description: e.target.value })}
                  placeholder={'e.g., 6" SCH40'}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes or specifications"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAddModal} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitAddMaterial} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Material'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
