import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, it, type Mock, vi } from 'vitest'

import CommercialRequestWorkbench from './CommercialRequestWorkbench'
import { getRfq, getRfqItems, saveSupplierSelection, updateRfqItem } from '../api/client'
import { createPricingRun, lockPricingRun } from '../services/pricingRunsApi'
import { submitForApproval } from '../services/approvalsApi'

vi.mock('../api/client', () => ({
  getRfq: vi.fn(),
  getRfqItems: vi.fn(),
  updateRfqItem: vi.fn(),
  saveSupplierSelection: vi.fn(),
  request: vi.fn(),
}))

vi.mock('../services/pricingRunsApi', () => ({
  createPricingRun: vi.fn(),
  lockPricingRun: vi.fn(),
}))

vi.mock('../services/approvalsApi', () => ({
  submitForApproval: vi.fn(),
}))

const mockGetRfq = getRfq as unknown as Mock
const mockGetRfqItems = getRfqItems as unknown as Mock
const mockUpdateRfqItem = updateRfqItem as unknown as Mock
const mockSaveSupplierSelection = saveSupplierSelection as unknown as Mock
const mockCreatePricingRun = createPricingRun as unknown as Mock
const mockLockPricingRun = lockPricingRun as unknown as Mock
const mockSubmitForApproval = submitForApproval as unknown as Mock

const baseRfq = {
  id: 'rfq-demo-002',
  title: 'CR-NSC-Workbench',
  status: 'draft',
  customer_name: 'NSC',
  created_at: '2025-12-01T00:00:00.000Z',
  updated_at: '2025-12-02T00:00:00.000Z',
}

const lineItems = [
  {
    id: 'item-1',
    rfq_id: baseRfq.id,
    line_number: 1,
    description: 'Pipe spool',
    quantity: 10,
    unit: 'PCS',
    needs_review: false,
    quantity_source: 'explicit',
    confidence: 'high',
    supplier_selected_option: 'A',
    supplier_options: {
      A: { supplier_name: 'Supplier One', unit_cost: 100, currency: 'USD' },
      B: { supplier_name: 'Supplier Two', unit_cost: 110, currency: 'USD' },
      C: { supplier_name: 'Supplier Three', unit_cost: 120, currency: 'USD' },
    },
  },
  {
    id: 'item-2',
    rfq_id: baseRfq.id,
    line_number: 2,
    description: 'Flange kit',
    quantity: 4,
    unit: 'SET',
    needs_review: true,
    quantity_source: 'inferred_price_line',
    confidence: 'medium',
    supplier_selected_option: null,
    supplier_options: null,
  },
]

describe('CommercialRequestWorkbench', () => {
  beforeEach(() => {
    mockGetRfq.mockResolvedValue(baseRfq)
    mockGetRfqItems.mockResolvedValue(lineItems)
    mockUpdateRfqItem.mockResolvedValue(lineItems[0])
    mockSaveSupplierSelection.mockResolvedValue(lineItems[0])
    mockCreatePricingRun.mockResolvedValue({
      id: 'run-1',
      rfq_id: baseRfq.id,
      is_locked: false,
    })
    mockLockPricingRun.mockResolvedValue({
      id: 'run-1',
      rfq_id: baseRfq.id,
      is_locked: true,
    })
    mockSubmitForApproval.mockResolvedValue({ success: true })
  })

  it('renders draft items and audit flags', async () => {
    render(
      <MemoryRouter initialEntries={[`/commercial-requests/${baseRfq.id}/workbench`]}>
        <Routes>
          <Route
            path="/commercial-requests/:id/workbench"
            element={<CommercialRequestWorkbench />}
          />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Draft Line Items')).toBeInTheDocument())

    const table = screen.getByRole('table')
    const rowGroups = within(table).getAllByRole('rowgroup')
    const bodyRows = within(rowGroups[1]).getAllByRole('row')
    expect(bodyRows).toHaveLength(2)

    expect(screen.getByText('Needs review')).toBeInTheDocument()
    expect(screen.getByText('inferred_price_line')).toBeInTheDocument()
  })
})
