import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table'
import { ChevronDown, ChevronUp, Search, Filter } from 'lucide-react'
import { LineItem } from '../../types'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'

interface LineItemRow extends LineItem {
  index: number
  matchStatus: 'matched' | 'unmatched' | 'partial'
  category?: string
}

interface LineItemsTableProps {
  items: LineItem[]
  onChangeItem: (index: number, updatedItem: Partial<LineItem>) => void
}

export function LineItemsTable({ items, onChangeItem }: LineItemsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [matchFilter, setMatchFilter] = useState<string>('all')

  // Transform items to include computed fields
  const tableData = useMemo<LineItemRow[]>(() => {
    return items.map((item, index) => {
      const hasMatches = item.matched_materials && item.matched_materials.length > 0
      const topMatch = hasMatches ? item.matched_materials[0] : null

      let matchStatus: 'matched' | 'unmatched' | 'partial' = 'unmatched'
      if (hasMatches && topMatch && topMatch.score >= 0.8) {
        matchStatus = 'matched'
      } else if (hasMatches) {
        matchStatus = 'partial'
      }

      // Infer category from description or metadata
      const desc = item.description?.toLowerCase() || ''
      let category = 'OTHER'
      if (desc.includes('pipe') || desc.includes('tubing')) category = 'PIPE'
      else if (desc.includes('flange')) category = 'FLANGE'
      else if (desc.includes('gasket')) category = 'GASKET'
      else if (desc.includes('valve')) category = 'VALVE'
      else if (desc.includes('fitting') || desc.includes('elbow') || desc.includes('tee')) category = 'FITTING'

      return {
        ...item,
        index,
        matchStatus,
        category,
      }
    })
  }, [items])

  // Apply filters
  const filteredData = useMemo(() => {
    let filtered = tableData

    if (categoryFilter !== 'all') {
      filtered = filtered.filter((item) => item.category === categoryFilter)
    }

    if (matchFilter === 'matched') {
      filtered = filtered.filter((item) => item.matchStatus === 'matched')
    } else if (matchFilter === 'unmatched') {
      filtered = filtered.filter((item) => item.matchStatus === 'unmatched')
    }

    return filtered
  }, [tableData, categoryFilter, matchFilter])

  // Column definitions
  const columns = useMemo<ColumnDef<LineItemRow>[]>(
    () => [
      {
        accessorKey: 'line_number',
        header: 'Line',
        cell: ({ row }) => (
          <div className="w-12 text-center font-medium text-gray-700">
            {row.original.line_number || row.original.index + 1}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <Input
            value={row.original.description || ''}
            onChange={(e) => onChangeItem(row.original.index, { description: e.target.value })}
            className="min-w-[300px] h-8 text-xs"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        cell: ({ row }) => (
          <Input
            type="number"
            value={row.original.quantity ?? ''}
            onChange={(e) =>
              onChangeItem(row.original.index, {
                quantity: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
            className="w-20 h-8 text-xs"
          />
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'unit',
        header: 'Unit',
        cell: ({ row }) => (
          <Select
            value={row.original.unit || 'EA'}
            onValueChange={(value) => onChangeItem(row.original.index, { unit: value })}
          >
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EA">EA</SelectItem>
              <SelectItem value="PCS">PCS</SelectItem>
              <SelectItem value="m">m</SelectItem>
              <SelectItem value="ft">ft</SelectItem>
              <SelectItem value="kg">kg</SelectItem>
              <SelectItem value="lb">lb</SelectItem>
              <SelectItem value="set">set</SelectItem>
            </SelectContent>
          </Select>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'size',
        header: 'Size',
        cell: ({ row }) => (
          <Input
            value={row.original.size || ''}
            onChange={(e) => onChangeItem(row.original.index, { size: e.target.value })}
            className="w-24 h-8 text-xs"
            placeholder="e.g. 2&quot;"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'schedule',
        header: 'Sch',
        cell: ({ row }) => (
          <Input
            value={row.original.schedule || ''}
            onChange={(e) => onChangeItem(row.original.index, { schedule: e.target.value })}
            className="w-20 h-8 text-xs"
            placeholder="40"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'standard',
        header: 'Standard',
        cell: ({ row }) => (
          <Input
            value={row.original.standard || ''}
            onChange={(e) => onChangeItem(row.original.index, { standard: e.target.value })}
            className="w-28 h-8 text-xs"
            placeholder="ASME B16.5"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'grade',
        header: 'Grade',
        cell: ({ row }) => (
          <Input
            value={row.original.grade || ''}
            onChange={(e) => onChangeItem(row.original.index, { grade: e.target.value })}
            className="w-24 h-8 text-xs"
            placeholder="A105"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'category',
        header: 'Category',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {row.original.category}
          </Badge>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'matchStatus',
        header: 'Match',
        cell: ({ row }) => {
          const status = row.original.matchStatus
          const variant =
            status === 'matched'
              ? 'success'
              : status === 'partial'
              ? 'warning'
              : 'destructive'
          return (
            <Badge variant={variant} className="text-xs">
              {status === 'matched' ? 'Matched' : status === 'partial' ? 'Partial' : 'Unmatched'}
            </Badge>
          )
        },
        enableSorting: true,
      },
    ],
    [onChangeItem]
  )

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search description, size, spec..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-10 h-9"
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="PIPE">Pipe</SelectItem>
              <SelectItem value="FLANGE">Flange</SelectItem>
              <SelectItem value="FITTING">Fitting</SelectItem>
              <SelectItem value="GASKET">Gasket</SelectItem>
              <SelectItem value="VALVE">Valve</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Match Status Filter */}
        <Select value={matchFilter} onValueChange={setMatchFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Matches</SelectItem>
            <SelectItem value="matched">Matched Only</SelectItem>
            <SelectItem value="unmatched">Unmatched Only</SelectItem>
          </SelectContent>
        </Select>

        {/* Results count */}
        <div className="text-sm text-gray-600">
          {filteredData.length} of {items.length} items
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <div className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="py-2 cursor-pointer select-none"
                        onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <span className="ml-1">
                              {header.column.getIsSorted() === 'asc' ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : header.column.getIsSorted() === 'desc' ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3 opacity-30" />
                              )}
                            </span>
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length > 0 ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-slate-50/50">
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-1">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-gray-500">
                      No items found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
