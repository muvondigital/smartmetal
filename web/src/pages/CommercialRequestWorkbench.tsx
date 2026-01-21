import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Lock, PackageSearch } from 'lucide-react'

import { getRfq, getRfqItems, saveSupplierSelection, updateRfqItem } from '../api/client'
import { submitForApproval } from '../services/approvalsApi'
import { createPricingRun, lockPricingRun, type PricingRun } from '../services/pricingRunsApi'
import type { Rfq, RfqItem } from '../types'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Checkbox } from '../components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'

type SupplierOptionKey = 'A' | 'B' | 'C'

interface SupplierOption {
  key: SupplierOptionKey
  label: string
  supplier_name?: string | null
  unit_cost?: number | null
  currency?: string | null
  lead_time_days?: number | null
  notes?: string | null
}

function normalizeSupplierOptions(item: RfqItem | null): SupplierOption[] {
  const raw = (item as any)?.supplier_options || {}
  const optionMap = {
    A: raw.A || raw.optionA || null,
    B: raw.B || raw.optionB || null,
    C: raw.C || raw.optionC || null,
  }

  return (['A', 'B', 'C'] as SupplierOptionKey[]).map((key) => {
    const option = optionMap[key] || {}
    return {
      key,
      label: `Option ${key}`,
      supplier_name: option.supplier_name || option.supplier || null,
      unit_cost: option.unit_cost ?? option.price ?? null,
      currency: option.currency || null,
      lead_time_days: option.lead_time_days ?? option.lead_time ?? null,
      notes: option.notes || null,
    }
  })
}

export default function CommercialRequestWorkbench() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [rfq, setRfq] = useState<Rfq | null>(null)
  const [items, setItems] = useState<RfqItem[]>([])
  const [pricingRun, setPricingRun] = useState<PricingRun | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Partial<RfqItem>>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      setLoading(true)
      setError(null)
      try {
        const [rfqResult, itemResult] = await Promise.all([getRfq(id), getRfqItems(id)])
        if (cancelled) return
        setRfq(rfqResult)
        setItems(itemResult)
        setSelectedItemId(itemResult[0]?.id?.toString() || null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load workbench data')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return items.filter((item) => {
      if (flaggedOnly && !item.needs_review) return false
      if (!query) return true
      return (
        item.description?.toLowerCase().includes(query) ||
        item.material_code?.toLowerCase().includes(query) ||
        item.line_number?.toString().includes(query)
      )
    })
  }, [items, flaggedOnly, searchQuery])

  const selectedItem = useMemo(
    () => items.find((item) => item.id?.toString() === selectedItemId) || null,
    [items, selectedItemId]
  )

  const hasNeedsReview = items.some((item) => item.needs_review)
  const missingSupplierSelection = items.some((item) => !item.supplier_selected_option)

  const handleDraftChange = (itemId: string, field: keyof RfqItem, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }))
  }

  const saveDraftField = async (item: RfqItem, field: keyof RfqItem) => {
    if (!id) return
    const draftValue = drafts[item.id as string]?.[field]
    if (draftValue === undefined) return

    const valueToCompare = item[field] ?? ''
    if (`${valueToCompare}` === `${draftValue}`) return

    const updates: any = {}
    if (field === 'quantity') {
      const numeric = Number(draftValue)
      if (Number.isNaN(numeric)) return
      updates.quantity = numeric
    } else if (field === 'description') {
      updates.description = String(draftValue)
    } else if (field === 'unit') {
      updates.unit = String(draftValue)
    } else {
      updates[field] = draftValue
    }

    setSavingItemId(item.id as string)
    try {
      const updated = await updateRfqItem(id, String(item.id), updates)
      setItems((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)))
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[item.id as string]
        return next
      })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save edits')
    } finally {
      setSavingItemId(null)
    }
  }

  const handleSupplierSelect = async (option: SupplierOptionKey) => {
    if (!id || !selectedItem) return
    setActionError(null)
    try {
      const updated = await saveSupplierSelection(id, String(selectedItem.id), {
        selected_option: option,
        supplier_options: (selectedItem as any).supplier_options,
      })
      setItems((prev) => prev.map((entry) => (entry.id === selectedItem.id ? updated : entry)))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save supplier selection')
    }
  }

  const handleGeneratePricingRun = async () => {
    if (!id) return
    setActionError(null)
    try {
      const run = await createPricingRun(id)
      setPricingRun(run)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate pricing run')
    }
  }

  const handleLockPricingRun = async () => {
    if (!pricingRun) return
    setActionError(null)
    try {
      const locked = await lockPricingRun(pricingRun.id)
      setPricingRun(locked)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to lock pricing run')
    }
  }

  const handleSubmitForApproval = async () => {
    if (!pricingRun) return
    setActionError(null)
    try {
      await submitForApproval(pricingRun.id, {
        submitted_by: 'Workbench User',
      })
      navigate(`/pricing-runs/${pricingRun.id}`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to submit for approval')
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-500">Loading workbench...</p>
      </div>
    )
  }

  if (!rfq) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Commercial Request not found</CardTitle>
            <CardDescription>We could not locate this request.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/rfqs')}>
              Back to Commercial Requests
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link to="/rfqs" className="hover:text-slate-900 hover:underline">
              Commercial Requests
            </Link>{' '}
            / Workbench
          </p>
          <h1 className="text-3xl font-bold text-slate-900">{rfq.title || 'Commercial Request'}</h1>
          {rfq.customer_name && (
            <p className="text-sm text-slate-500">Customer: {rfq.customer_name}</p>
          )}
        </div>
        <Button variant="outline" onClick={() => navigate(`/rfqs/${rfq.id}`)}>
          View Request
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load workbench</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {actionError && (
        <Alert variant="destructive">
          <AlertTitle>Action blocked</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {hasNeedsReview && (
        <Alert variant="destructive">
          <AlertTitle>Review required</AlertTitle>
          <AlertDescription>
            Resolve all flagged items before selecting suppliers or running pricing.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Draft Line Items</CardTitle>
            <CardDescription>Inline edit extracted items and review audit flags.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <Input
                placeholder="Search items, material codes, or line numbers"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="max-w-sm"
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <Checkbox
                  checked={flaggedOnly}
                  onCheckedChange={(checked) => setFlaggedOnly(Boolean(checked))}
                />
                Flagged only
              </label>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-28">Qty</TableHead>
                    <TableHead className="w-24">Unit</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead className="w-28">Supplier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                        No items match your filters.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredItems.map((item) => {
                    const isSelected = item.id?.toString() === selectedItemId
                    const draft = drafts[item.id as string] || {}
                    return (
                      <TableRow
                        key={item.id}
                        onClick={() => setSelectedItemId(item.id?.toString() || null)}
                        className={isSelected ? 'bg-slate-50' : undefined}
                      >
                        <TableCell className="text-sm text-slate-600">
                          {item.line_number ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={(draft.description ?? item.description ?? '') as string}
                            onChange={(event) =>
                              handleDraftChange(String(item.id), 'description', event.target.value)
                            }
                            onBlur={() => saveDraftField(item, 'description')}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={String(draft.quantity ?? item.quantity ?? '')}
                            onChange={(event) =>
                              handleDraftChange(String(item.id), 'quantity', event.target.value)
                            }
                            onBlur={() => saveDraftField(item, 'quantity')}
                            className="h-8 text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={(draft.unit ?? item.unit ?? '') as string}
                            onChange={(event) =>
                              handleDraftChange(String(item.id), 'unit', event.target.value)
                            }
                            onBlur={() => saveDraftField(item, 'unit')}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {item.needs_review && (
                              <Badge variant="destructive">Needs review</Badge>
                            )}
                            {item.quantity_source && (
                              <Badge variant="secondary">{item.quantity_source}</Badge>
                            )}
                            {item.confidence && <Badge variant="outline">{item.confidence}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.supplier_selected_option ? (
                            <Badge variant="secondary">
                              Option {item.supplier_selected_option}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Unselected</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {savingItemId && (
              <p className="text-xs text-slate-500">Saving changes...</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Supplier Selection</CardTitle>
              <CardDescription>Choose the supplier option for the selected item.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedItem ? (
                <>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500">Selected Item</p>
                    <p className="text-sm font-medium text-slate-900">
                      {selectedItem.description || 'Untitled line item'}
                    </p>
                  </div>

                  {hasNeedsReview && (
                    <Alert variant="destructive">
                      <AlertTitle>Selections locked</AlertTitle>
                      <AlertDescription>
                        Resolve all needs review flags before selecting suppliers.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-3">
                    {normalizeSupplierOptions(selectedItem).map((option) => {
                      const isSelected = selectedItem.supplier_selected_option === option.key
                      return (
                        <button
                          key={option.key}
                          type="button"
                          disabled={hasNeedsReview}
                          onClick={() => handleSupplierSelect(option.key)}
                          className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-slate-200 hover:border-slate-300'
                          } ${hasNeedsReview ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                              <p className="text-xs text-slate-500">
                                {option.supplier_name || 'No supplier assigned'}
                              </p>
                            </div>
                            {isSelected && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                            <span>
                              Unit cost:{' '}
                              {option.unit_cost != null ? option.unit_cost : '—'}
                            </span>
                            <span>
                              Lead time:{' '}
                              {option.lead_time_days != null ? `${option.lead_time_days} days` : '—'}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-500">
                  <PackageSearch className="h-6 w-6" />
                  <p className="text-sm">Select a line item to view supplier options.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing Run Summary</CardTitle>
              <CardDescription>Generate, lock, and submit the pricing run.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Total line items</span>
                  <span className="font-medium text-slate-900">{items.length}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                  <span>Flagged items</span>
                  <span className="font-medium text-slate-900">
                    {items.filter((item) => item.needs_review).length}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                  <span>Supplier selections</span>
                  <span className="font-medium text-slate-900">
                    {items.filter((item) => item.supplier_selected_option).length}/{items.length}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleGeneratePricingRun}
                  disabled={hasNeedsReview || missingSupplierSelection}
                >
                  Generate Pricing Run
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={handleLockPricingRun}
                  disabled={!pricingRun || pricingRun.is_locked || hasNeedsReview}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  {pricingRun?.is_locked ? 'Locked' : 'Lock Pricing Run'}
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={handleSubmitForApproval}
                  disabled={!pricingRun || !pricingRun.is_locked || hasNeedsReview}
                >
                  Submit for Approval
                </Button>
              </div>

              {(missingSupplierSelection || hasNeedsReview) && (
                <div className="flex items-start gap-2 text-xs text-amber-700">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  <span>
                    Complete all reviews and supplier selections before generating a pricing run.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
