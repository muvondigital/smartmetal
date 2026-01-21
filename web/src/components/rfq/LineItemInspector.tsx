import { LineItemView } from '../../types'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

interface LineItemInspectorProps {
  item?: LineItemView | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onItemChange?: (index: number, updatedItem: Partial<LineItemView>) => void
}

export function LineItemInspector({
  item,
  open,
  onOpenChange,
  onItemChange,
}: LineItemInspectorProps) {
  if (!item) return null

  const handleFieldChange = (field: string, value: any) => {
    if (onItemChange) {
      onItemChange(item.index, { [field]: value })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            Line {item.line_number || item.index + 1} – {item.description || 'Item'}
          </SheetTitle>
          <SheetDescription>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                {item.category}
              </Badge>
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
                  ? 'Partial Match'
                  : 'No Match'}
              </Badge>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Basic Information Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Basic Information</h3>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={item.description || ''}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                className="min-h-[80px]"
                placeholder="Enter item description..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={item.quantity ?? ''}
                  onChange={(e) =>
                    handleFieldChange('quantity', e.target.value ? parseFloat(e.target.value) : null)
                  }
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Select
                  value={item.unit || 'EA'}
                  onValueChange={(value) => handleFieldChange('unit', value)}
                >
                  <SelectTrigger id="unit">
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
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={item.category || 'OTHER'}
                onValueChange={(value) => handleFieldChange('category', value)}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIPE">Pipe</SelectItem>
                  <SelectItem value="FLANGE">Flange</SelectItem>
                  <SelectItem value="FITTING">Fitting</SelectItem>
                  <SelectItem value="GASKET">Gasket</SelectItem>
                  <SelectItem value="VALVE">Valve</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Dimensions Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Dimensions & Specifications</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="size">Size</Label>
                <Input
                  id="size"
                  value={item.size || ''}
                  onChange={(e) => handleFieldChange('size', e.target.value)}
                  placeholder='e.g. 24"'
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule">Schedule</Label>
                <Input
                  id="schedule"
                  value={item.schedule || ''}
                  onChange={(e) => handleFieldChange('schedule', e.target.value)}
                  placeholder="e.g. 40"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="standard">Standard</Label>
              <Input
                id="standard"
                value={item.standard || ''}
                onChange={(e) => handleFieldChange('standard', e.target.value)}
                placeholder="e.g. ASME B16.5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="grade">Grade / Material</Label>
              <Input
                id="grade"
                value={item.grade || ''}
                onChange={(e) => handleFieldChange('grade', e.target.value)}
                placeholder="e.g. A105, 316L"
              />
            </div>
          </div>

          <Separator />

          {/* AI / Extraction Meta Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">AI Extraction Info</h3>

            {item.raw_row && item.raw_row.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="rawRow">Raw Extracted Row</Label>
                <Textarea
                  id="rawRow"
                  value={item.raw_row.join(' | ')}
                  readOnly
                  className="min-h-[60px] bg-slate-50 text-xs font-mono"
                />
              </div>
            )}

            {item.matched_materials && item.matched_materials.length > 0 && (
              <div className="space-y-2">
                <Label>Material Matches ({item.matched_materials.length})</Label>
                <div className="space-y-2">
                  {item.matched_materials.slice(0, 3).map((match, idx) => (
                    <div
                      key={idx}
                      className="p-3 border border-slate-200 rounded-md bg-slate-50 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-900">
                          {match.material_code || 'Unknown'}
                        </span>
                        <Badge
                          variant={match.score >= 0.8 ? 'success' : 'warning'}
                          className="text-xs"
                        >
                          {Math.round(match.score * 100)}% match
                        </Badge>
                      </div>
                      {match.reason && (
                        <p className="text-xs text-slate-600">{match.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!item.matched_materials || item.matched_materials.length === 0) && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm text-amber-800">
                  No material matches found for this line item.
                </p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
