/**
 * Materials API Client
 *
 * Functions for fetching and managing materials from the backend.
 */

import type { Material } from '../types/materials';

import { request as apiRequest } from './client';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await apiRequest<any>(endpoint, options);
  return (response?.data ?? response) as T;
}

/**
 * Get all materials
 */
export async function getAllMaterials(): Promise<Material[]> {
  return request<Material[]>('/materials');
}

/**
 * Get a single material by ID
 */
export async function getMaterialById(id: string): Promise<Material> {
  return request<Material>(`/materials/${id}`);
}

/**
 * Get a material by material code (SKU)
 */
export async function getMaterialByCode(materialCode: string): Promise<Material> {
  return request<Material>(`/materials/code/${materialCode}`);
}

/**
 * Create a new material
 */
export interface CreateMaterialPayload {
  material_code: string;
  category: string;
  origin_type: string;
  base_cost: number;
  spec_standard?: string;
  grade?: string;
  material_type?: string;
  size_description?: string;
  currency?: string;
  notes?: string;
}

export async function createMaterial(payload: CreateMaterialPayload): Promise<Material> {
  return request<Material>('/materials', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Update an existing material
 */
export interface UpdateMaterialPayload {
  category?: string;
  origin_type?: string;
  base_cost?: number;
  spec_standard?: string;
  grade?: string;
  material_type?: string;
  size_description?: string;
  currency?: string;
  notes?: string;
}

export async function updateMaterial(id: string, payload: UpdateMaterialPayload): Promise<Material> {
  return request<Material>(`/materials/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * Delete a material
 */
export async function deleteMaterial(id: string): Promise<void> {
  return request<void>(`/materials/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Search materials by term (filters client-side from all materials)
 * Searches across material_code, description, size_description, grade, category
 */
export async function searchMaterials(searchTerm: string): Promise<Material[]> {
  const allMaterials = await getAllMaterials();

  if (!searchTerm || searchTerm.trim().length === 0) {
    return allMaterials.slice(0, 10);
  }

  const term = searchTerm.toLowerCase().trim();

  const matches = allMaterials.filter(material => {
    const code = (material.material_code || '').toLowerCase();
    const category = (material.category || '').toLowerCase();
    const grade = (material.grade || '').toLowerCase();
    const sizeDesc = (material.size_description || '').toLowerCase();
    const specStd = (material.spec_standard || '').toLowerCase();
    const materialType = (material.material_type || '').toLowerCase();

    return (
      code.includes(term) ||
      category.includes(term) ||
      grade.includes(term) ||
      sizeDesc.includes(term) ||
      specStd.includes(term) ||
      materialType.includes(term)
    );
  });

  return matches.slice(0, 10);
}
