/**
 * DataTable Component
 * 
 * Reusable table component for displaying quote/agreement data.
 * Features:
 * - Responsive design with horizontal scroll on mobile
 * - Hover states for rows
 * - Status badge styling
 * - Clickable rows (optional)
 */

import { Badge } from '../ui/badge';
import { getStatusBadgeClass, getStatusLabel } from '../../lib/statusHelpers';
import { formatCurrency, toTitleCase } from '../../lib/formatters';

export interface Quote {
  id: string | number;
  name?: string;
  revision?: string;
  customer?: string;
  customer_name?: string;
  total?: number;
  status?: string;
  createdOn?: string;
  created_at?: string;
  approvedOn?: string;
  nextAction?: string;

  // Tax-related fields (from pricing_runs)
  subtotal?: number | null;
  taxAmount?: number | null;
  taxRate?: number | null;
  taxType?: string | null;
  taxCountry?: string | null;
  totalWithTax?: number | null;
}

interface DataTableProps {
  data: Quote[];
  columns: Array<{
    key: string;
    label: string;
    render?: (item: Quote) => React.ReactNode;
  }>;
  onRowClick?: (item: Quote) => void;
}

export function DataTable({ data, columns, onRowClick }: DataTableProps) {
  const renderCellValue = (item: Quote, column: typeof columns[0]) => {
    if (column.render) {
      return column.render(item);
    }

    let value = item[column.key as keyof Quote];

    // Handle customer field - check both customer and customer_name
    if (column.key === 'customer' && !value) {
      value = item.customer_name as any;
    }

    // Format customer/client names to title case
    if (column.key === 'customer' || column.key === 'customer_name') {
      return toTitleCase(value as string) || '-';
    }

    if (column.key === 'status') {
      return (
        <Badge variant="outline" className={getStatusBadgeClass(value as string)}>
          {getStatusLabel(value as string)}
        </Badge>
      );
    }
    
    if (column.key === 'total') {
      return formatCurrency(value as number);
    }
    
    if (column.key === 'createdOn' || column.key === 'created_at') {
      if (value) {
        const date = new Date(value as string);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      }
      return '-';
    }
    
    return value || '-';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {columns.map(column => (
              <th
                key={column.key}
                className="px-4 py-3 text-left text-xs text-slate-500 uppercase tracking-wide"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500">
                No data available
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr
                key={item.id}
                onClick={() => onRowClick?.(item)}
                className={`
                  border-b border-slate-100 
                  hover:bg-slate-50 transition-colors
                  ${onRowClick ? 'cursor-pointer' : ''}
                `}
              >
                {columns.map(column => (
                  <td key={column.key} className="px-4 py-3 text-sm text-slate-700">
                    {renderCellValue(item, column)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

