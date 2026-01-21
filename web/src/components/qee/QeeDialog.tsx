import { useEffect, useState, useRef } from 'react'
import { AlertTriangle, Calculator, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Button } from '../ui/button'
import { getQuickEstimate, QuickEstimateResult } from '../../services/qeeApi'
import { searchMaterials } from '../../api/materials'
import type { Material } from '../../types/materials'

type QeeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

export function QeeDialog({ open, onOpenChange }: QeeDialogProps) {
  const [materialQuery, setMaterialQuery] = useState('')
  const [markupPercent, setMarkupPercent] = useState('20')
  const [quantity, setQuantity] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<QuickEstimateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<Material[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchTimeoutRef = useRef<number | null>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setResult(null)
      setError(null)
      setMaterialQuery('')
      setQuantity('')
      setMarkupPercent('20')
      setSuggestions([])
      setSelectedMaterial(null)
      setShowSuggestions(false)
    }
  }, [open])

  // Debounced material search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    const trimmedQuery = materialQuery.trim()

    if (trimmedQuery.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    setIsSearching(true)

    searchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const results = await searchMaterials(trimmedQuery)
        setSuggestions(results)
        setShowSuggestions(true)
      } catch (err) {
        console.error('Material search error:', err)
        setSuggestions([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [materialQuery])

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSuggestions])

  const handleMaterialSelect = (material: Material) => {
    setSelectedMaterial(material)
    const displayText = `${material.material_code}${material.size_description ? ` – ${material.size_description}` : ''}`
    setMaterialQuery(displayText)
    setShowSuggestions(false)
    setSuggestions([])
  }

  const handleMaterialQueryChange = (value: string) => {
    setMaterialQuery(value)
    if (selectedMaterial) {
      setSelectedMaterial(null)
    }
  }

  const handleGenerate = async () => {
    if (!materialQuery.trim() && !selectedMaterial) return
    setIsLoading(true)
    setError(null)
    setResult(null)
    try {
      const payload: any = {
        markupPercent: markupPercent ? Number(markupPercent) : undefined,
        quantity: quantity ? Number(quantity) : undefined,
      }

      if (selectedMaterial) {
        payload.materialId = selectedMaterial.id
      } else if (materialQuery.trim()) {
        payload.searchTerm = materialQuery.trim()
      }

      const estimate = await getQuickEstimate(payload)
      setResult(estimate)
    } catch (err: any) {
      setError(err?.message || 'Failed to generate quick estimate')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Quick Estimate Engine
          </DialogTitle>
          <DialogDescription>
            Get a fast, advisory-only price estimate from the catalog. This does not create an RFQ or pricing run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 relative">
            <Label htmlFor="qee-material">Material</Label>
            <div className="relative" ref={suggestionsRef}>
              <Input
                id="qee-material"
                placeholder="Search materials by code, size, description..."
                value={materialQuery}
                onChange={(e) => handleMaterialQueryChange(e.target.value)}
                onFocus={() => {
                  if (suggestions.length > 0 && !selectedMaterial) {
                    setShowSuggestions(true)
                  }
                }}
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </div>
              )}

              {showSuggestions && suggestions.length > 0 && !selectedMaterial && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {suggestions.map((material) => (
                    <button
                      key={material.id}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0 focus:bg-slate-100 focus:outline-none"
                      onClick={() => handleMaterialSelect(material)}
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm text-slate-900">
                          {material.material_code}
                        </span>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {[
                            material.category,
                            material.spec_standard,
                            material.grade,
                            material.size_description,
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showSuggestions && suggestions.length === 0 && !isSearching && materialQuery.trim().length >= 2 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg p-3">
                  <p className="text-sm text-slate-500">
                    No materials found. Try a different keyword or check the catalog.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qee-markup">Markup (%)</Label>
              <Input
                id="qee-markup"
                type="number"
                min={0}
                step="0.1"
                value={markupPercent}
                onChange={(e) => setMarkupPercent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qee-quantity">Quantity (optional)</Label>
              <Input
                id="qee-quantity"
                type="number"
                min={0}
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {result && (
            <div className="border-t border-slate-200 pt-4 space-y-3">
              <div className="text-sm text-slate-600">
                (<span className="text-purple-600 font-medium">When</span>{' '}
                <span className="text-slate-900">estimate</span>{' '}
                <span className="text-purple-600 font-medium">is</span>{' '}
                <span className="text-slate-900">generated</span>)
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-700">Baseline Unit Price:</span>
                  <span className="font-mono text-orange-600">
                    {result.currency || 'RM'} {formatNumber(result.baselinePrice)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-700">Markup Applied:</span>
                  <span className="font-mono text-orange-600">+{formatNumber(result.markupPercent)}%</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-700">Estimated Unit Price:</span>
                  <span className="font-mono text-orange-600">
                    {result.currency || 'RM'} {formatNumber(result.estimatedUnitPrice)}
                  </span>
                </div>

                {result.quantity != null && result.estimatedTotal != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-700">
                      Estimated Total (<span className="text-orange-600">{result.quantity}</span> pcs):
                    </span>
                    <span className="font-mono text-orange-600">
                      {result.currency || 'RM'} {formatNumber(result.estimatedTotal)}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="flex gap-2 text-sm text-slate-600">
                  <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-orange-600 font-medium">This is</span> a non-binding advisory estimate.
                    Run a pricing workflow <span className="text-purple-600 font-medium">for</span> a formal quote.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={handleGenerate} disabled={isLoading || (!materialQuery.trim() && !selectedMaterial)}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Estimating...
                </>
              ) : (
                'Generate Estimate'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

