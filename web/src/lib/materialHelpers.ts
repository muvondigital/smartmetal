/**
 * Material Helper Functions
 *
 * Utilities for formatting, filtering, and displaying materials.
 */

import type { Material } from '../types/materials';

/**
 * Get badge variant based on category
 */
export function getCategoryBadgeVariant(category: string): 'default' | 'secondary' | 'success' | 'warning' | 'outline' {
  const cat = (category || '').toUpperCase();

  if (cat.includes('FLNG') || cat.includes('FLANGE')) return 'default';
  if (cat.includes('PIPE')) return 'success';
  if (cat.includes('FITG') || cat.includes('FITTING')) return 'secondary';
  if (cat.includes('FAST') || cat.includes('FASTENER')) return 'warning';
  if (cat.includes('GRAT')) return 'outline';

  return 'outline';
}

/**
 * Get formatted category display name
 */
export function formatCategory(category: string): string {
  const cat = (category || '').toUpperCase();

  if (cat.includes('FLNG') || cat.includes('FLANGE')) return 'Flange';
  if (cat.includes('PIPE')) return 'Pipe';
  if (cat.includes('FITG') || cat.includes('FITTING')) return 'Fitting';
  if (cat.includes('FAST') || cat.includes('FASTENER')) return 'Fastener';
  if (cat.includes('GRAT')) return 'Grating';

  // Capitalize first letter
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

/**
 * Format a material's description from its attributes
 */
export function formatMaterialDescription(material: Material): string {
  const parts: string[] = [];

  if (material.size_description) {
    parts.push(material.size_description);
  }

  if (material.material_type) {
    parts.push(material.material_type);
  }

  if (material.spec_standard) {
    parts.push(material.spec_standard);
  }

  if (parts.length === 0 && material.grade) {
    parts.push(material.grade);
  }

  return parts.join(' ') || 'No description available';
}

/**
 * Format currency value
 */
export function formatMoney(value: number | null | undefined, currency: string = 'USD'): string {
  if (value === null || value === undefined) {
    return '-';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format origin type for display
 */
export function formatOrigin(origin: string | null | undefined): string {
  if (!origin) return '-';

  const orig = origin.toUpperCase();
  if (orig === 'CHINA') return 'China';
  if (orig === 'NON_CHINA') return 'Non-China';

  return origin;
}

/**
 * Get unique categories from materials array
 */
export function getUniqueCategories(materials: Material[]): string[] {
  const categories = materials
    .map(m => m.category)
    .filter((cat): cat is string => !!cat);

  return Array.from(new Set(categories)).sort();
}

/**
 * Get unique material types from materials array
 */
export function getUniqueMaterialTypes(materials: Material[]): string[] {
  const types = materials
    .map(m => m.material_type)
    .filter((type): type is string => !!type);

  return Array.from(new Set(types)).sort();
}

/**
 * Get unique standards from materials array
 */
export function getUniqueStandards(materials: Material[]): string[] {
  const standards = materials
    .map(m => m.spec_standard)
    .filter((std): std is string => !!std);

  return Array.from(new Set(standards)).sort();
}

/**
 * Get unique origins from materials array
 */
export function getUniqueOrigins(materials: Material[]): string[] {
  const origins = materials
    .map(m => m.origin_type)
    .filter((origin): origin is string => !!origin);

  return Array.from(new Set(origins)).sort();
}

/**
 * Filter materials based on search and filter criteria
 */
export function filterMaterials(
  materials: Material[],
  search: string,
  categoryFilter: string,
  materialTypeFilter: string,
  standardFilter: string,
  originFilter: string
): Material[] {
  return materials.filter(material => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        material.material_code?.toLowerCase().includes(searchLower) ||
        material.size_description?.toLowerCase().includes(searchLower) ||
        material.spec_standard?.toLowerCase().includes(searchLower) ||
        material.material_type?.toLowerCase().includes(searchLower) ||
        material.grade?.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;
    }

    // Category filter
    if (categoryFilter && categoryFilter !== 'all') {
      if (material.category !== categoryFilter) return false;
    }

    // Material type filter
    if (materialTypeFilter && materialTypeFilter !== 'all') {
      if (material.material_type !== materialTypeFilter) return false;
    }

    // Standard filter
    if (standardFilter && standardFilter !== 'all') {
      if (material.spec_standard !== standardFilter) return false;
    }

    // Origin filter
    if (originFilter && originFilter !== 'all') {
      if (material.origin_type !== originFilter) return false;
    }

    return true;
  });
}
