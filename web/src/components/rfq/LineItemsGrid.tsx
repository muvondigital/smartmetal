import { useState, useMemo } from 'react'
import { Search, Filter } from 'lucide-react'
import { LineItem, LineItemView } from '../../types'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Badge } from '../ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'

interface LineItemsGridProps {
  items: LineItem[]
  onItemChange?: (index: number, updatedItem: Partial<LineItem>) => void
  onItemSelect?: (index: number) => void
}

// Helper to compute match status
function computeMatchStatus(item: LineItem): 'matched' | 'partial' | 'unmatched' {
  const hasMatches = item.matched_materials && item.matched_materials.length > 0
  if (!hasMatches) return 'unmatched'

  const topMatch = item.matched_materials[0]
  if (topMatch && topMatch.score >= 0.8) return 'matched'
  return 'partial'
}

// Helper to infer category from description
function inferCategory(description: string): string {
  const desc = description.toLowerCase()
  if (desc.includes('pipe') || desc.includes('tubing')) return 'PIPE'
  if (desc.includes('flange')) return 'FLANGE'
  if (desc.includes('gasket')) return 'GASKET'
  if (desc.includes('valve')) return 'VALVE'
  if (desc.includes('fitting') || desc.includes('elbow') || desc.includes('tee')) return 'FITTING'
  return 'OTHER'
}

export function LineItemsGrid({ items, onItemChange, onItemSelect }: LineItemsGridProps) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [matchFilter, setMatchFilter] = useState<string>('all')

  // Transform items to view models
  const viewItems = useMemo<LineItemView[]>(() => {
    return items.map((item, index) => ({
      ...item,
      id: `line-${index}`,
      index,
      matchStatus: computeMatchStatus(item),
      category: inferCategory(item.description || ''),
    }))
  }, [items])

  // Filter items
  const filteredItems = useMemo(() => {
    return viewItems.filter((item) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesSearch =
          (item.description && item.description.toLowerCase().includes(searchLower)) ||
          (item.size && item.size.toLowerCase().includes(searchLower)) ||
          (item.standard && item.standard.toLowerCase().includes(searchLower)) ||
          (item.schedule && item.schedule.toLowerCase().includes(searchLower)) ||
          (item.grade && item.grade.toLowerCase().includes(searchLower))

        if (!matchesSearch) return false
      }

      // Category filter
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false
      }

      // Match filter
      if (matchFilter === 'matched' && item.matchStatus !== 'matched') return false
      if (matchFilter === 'unmatched' && item.matchStatus !== 'unmatched') return false
      if (matchFilter === 'partial' && item.matchStatus !== 'partial') return false

      return true
    })
  }, [viewItems, search, categoryFilter, matchFilter])

  const handleRowClick = (item: LineItemView) => {
    if (onItemSelect) {
      onItemSelect(item.index)
    }
  }

  const handleQtyChange = (index: number, value: string) => {
    if (onItemChange) {
      onItemChange(index, {
        quantity: value ? parseFloat(value) : null,
      })
    }
  }

  const handleUnitChange = (index: number, value: string) => {
    if (onItemChange) {
      onItemChange(index, { unit: value })
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search description, size, spec..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="unmatched">Unmatched</SelectItem>
          </SelectContent>
        </Select>

        {/* Results count */}
        <div className="text-sm text-gray-600 ml-auto">
          {filteredItems.length} of {items.length} items
        </div>
      </div>

      {/* Compact 7-Column Table - No Horizontal Scroll */}
      <div className="relative mt-2 rounded-md border bg-card">
        <div className="max-h-[calc(100vh-320px)] overflow-y-auto overflow-x-hidden">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-50 z-10">
              <TableRow>
                <TableHead className="w-12 text-center py-2">Line</TableHead>
                <TableHead className="py-2 min-w-[200px]">Description</TableHead>
                <TableHead className="w-20 py-2">Qty</TableHead>
                <TableHead className="w-20 py-2">Unit</TableHead>
                <TableHead className="w-24 py-2">Size</TableHead>
                <TableHead className="w-28 py-2">Spec</TableHead>
                <TableHead className="w-24 text-center py-2">Match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                  // Get spec: prefer standard, then grade, then schedule
                  const spec = item.standard || item.grade || item.schedule || ''
                  // Get notes if available (from raw_row or other source)
                  const notes = item.raw_row?.join(' ') || ''

                  return (
                    <TableRow
                      key={item.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => handleRowClick(item)}
                    >
                      <TableCell className="text-center font-medium text-gray-700 py-2">
                        {item.line_number || item.index + 1}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-col gap-0.5 min-w-0 max-w-full">
                          <div className="font-medium truncate text-sm">
                            {item.description || '—'}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                            {item.category && (
                              <Badge variant="outline" className="px-1.5 py-0 text-[10px] shrink-0">
                                {item.category}
                              </Badge>
                            )}
                            {spec && <span className="truncate">{spec}</span>}
                            {notes && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="underline underline-offset-2 text-xs shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Notes
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs whitespace-pre-wrap">
                                    {notes}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Input
                          type="number"
                          value={item.quantity ?? ''}
                          onChange={(e) => {
                            e.stopPropagation()
                            handleQtyChange(item.index, e.target.value)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-20 h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <Select
                          value={item.unit || 'EA'}
                          onValueChange={(value) => {
                            handleUnitChange(item.index, value)
                          }}
                        >
                          <SelectTrigger
                            className="w-20 h-8 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
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
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="text-sm truncate">
                          {item.size || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="text-sm truncate">
                          {spec || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <Badge
                          variant={
                            item.matchStatus === 'matched'
                              ? 'success'
                              : item.matchStatus === 'partial'
                              ? 'warning'
                              : 'destructive'
                          }
                          className="text-xs"
                        >
                          {item.matchStatus === 'matched'
                            ? 'Matched'
                            : item.matchStatus === 'partial'
                            ? 'Partial'
                            : 'Unmatched'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-gray-500">
                    No items found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
