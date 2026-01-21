/**
 * Materials Table Component
 *
 * Displays materials in a sortable table with category badges and clickable SKUs.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../ui/badge';
import type { Material } from '../../types/materials';
import {
  getCategoryBadgeVariant,
  formatCategory,
  formatMaterialDescription,
  formatMoney,
  formatOrigin,
} from '../../lib/materialHelpers';

interface MaterialsTableProps {
  materials: Material[];
}

type SortField = 'material_code' | 'category' | 'material_type' | 'base_cost';
type SortDirection = 'asc' | 'desc';

export function MaterialsTable({ materials }: MaterialsTableProps) {
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<SortField>('material_code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedMaterials = [...materials].sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];

    // Handle null/undefined
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    // String comparison
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const handleRowClick = (material: Material) => {
    navigate(`/materials/${material.id}`);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="text-slate-400 ml-1">↕</span>;
    }
    return <span className="text-blue-600 ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  if (materials.length === 0) {
    return null; // Empty state handled by parent
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th
              className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
              onClick={() => handleSort('material_code')}
            >
              SKU
              <SortIcon field="material_code" />
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
              onClick={() => handleSort('category')}
            >
              Category
              <SortIcon field="category" />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
              Description
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
              onClick={() => handleSort('material_type')}
            >
              Material
              <SortIcon field="material_type" />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
              Size
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
              Standard
            </th>
            <th
              className="px-4 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
              onClick={() => handleSort('base_cost')}
            >
              Base Cost
              <SortIcon field="base_cost" />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
              Origin
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedMaterials.map((material) => (
            <tr
              key={material.id}
              onClick={() => handleRowClick(material)}
              className="border-b border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              {/* SKU */}
              <td className="px-4 py-3 text-sm font-mono text-blue-600 hover:text-blue-800 font-medium">
                {material.material_code}
              </td>

              {/* Category */}
              <td className="px-4 py-3 text-sm">
                <Badge variant={getCategoryBadgeVariant(material.category || '')}>
                  {formatCategory(material.category || '')}
                </Badge>
              </td>

              {/* Description */}
              <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                {formatMaterialDescription(material)}
              </td>

              {/* Material Type */}
              <td className="px-4 py-3 text-sm text-slate-900">
                {material.material_type || '-'}
              </td>

              {/* Size */}
              <td className="px-4 py-3 text-sm text-slate-900">
                {material.size_description || '-'}
              </td>

              {/* Standard */}
              <td className="px-4 py-3 text-sm text-slate-900">
                {material.spec_standard || '-'}
              </td>

              {/* Base Cost */}
              <td className="px-4 py-3 text-sm text-slate-900 text-right font-medium">
                {formatMoney(material.base_cost, material.currency)}
              </td>

              {/* Origin */}
              <td className="px-4 py-3 text-sm">
                <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded">
                  {formatOrigin(material.origin_type)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
