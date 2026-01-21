import { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { ArrowUpDown } from 'lucide-react';
import { Rfq } from '../../types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { formatRelativeTime, getStatusVariant, formatStatusText } from '../../lib/rfqUtils';
import { toTitleCase } from '../../lib/formatters';

export const columns: ColumnDef<Rfq>[] = [
  {
    accessorKey: 'id',
    header: ({ column }) => {
      return (
        <button
          className="flex items-center gap-1 hover:text-slate-900"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          RFQ
          <ArrowUpDown className="h-3 w-3" />
        </button>
      );
    },
    cell: ({ row }) => {
      const id = row.getValue('id') as number;
      return (
        <Link
          to={`/rfqs/${id}`}
          className="flex flex-col gap-0.5 hover:underline"
        >
          <span className="font-medium text-slate-900">RFQ #{id}</span>
          <span className="text-xs text-slate-500 font-mono">ID: {id}</span>
        </Link>
      );
    },
  },
  {
    accessorKey: 'customer_name',
    header: 'Customer',
    cell: ({ row }) => {
      const customer = row.getValue('customer_name') as string;
      return <span className="text-slate-700">{customer ? toTitleCase(customer) : '—'}</span>;
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const variant = getStatusVariant(status);
      return (
        <Badge variant={variant}>
          {formatStatusText(status)}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => {
      return (
        <button
          className="flex items-center gap-1 hover:text-slate-900"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Created
          <ArrowUpDown className="h-3 w-3" />
        </button>
      );
    },
    cell: ({ row }) => {
      const createdAt = row.getValue('created_at') as string;
      return (
        <span className="text-slate-600 text-sm">
          {createdAt ? formatRelativeTime(createdAt) : 'Unknown'}
        </span>
      );
    },
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => {
      const id = row.original.id;
      return (
        <Button
          asChild
          variant="ghost"
          size="sm"
        >
          <Link to={`/rfqs/${id}`}>
            Open
          </Link>
        </Button>
      );
    },
  },
];
