import { DataTable, Quote } from './DataTable';
import { Button } from '../ui/button';
import { useNavigate } from 'react-router-dom';

interface RecentTableProps {
  data: Quote[];
  onRowClick?: (item: Quote) => void;
}

export function RecentTable({ data, onRowClick }: RecentTableProps) {
  const navigate = useNavigate();

  const columns = [
    { key: 'name', label: 'Quote / Agreement Name' },
    { key: 'revision', label: 'Revision' },
    { key: 'customer', label: 'Customer' },
    { key: 'total', label: 'Total' },
    { key: 'createdOn', label: 'Created On' },
  ];

  const handleRowClick = (item: Quote) => {
    if (onRowClick) {
      onRowClick(item);
    } else {
      // Navigate to pricing run detail page
      if (item.id) {
        navigate(`/pricing-runs/${item.id}`);
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-slate-900 font-semibold">Recently Started</h3>
        <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-700">
          View All
        </Button>
      </div>
      <div className="p-6">
        <DataTable
          data={data}
          columns={columns}
          onRowClick={handleRowClick}
        />
      </div>
    </div>
  );
}

