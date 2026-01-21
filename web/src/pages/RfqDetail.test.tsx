import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, beforeEach, describe, it, type Mock } from 'vitest';
import RfqDetail from './RfqDetail';
import {
  getRfq,
  getRfqItems,
  getRfqItemsWithPricing,
  deleteRfq,
  updateRfq,
} from '../api/client';
import { getPricingRunsByRfqId } from '../services/pricingRunsApi';
import { getApprovalHistory } from '../services/approvalsApi';

vi.mock('../api/client', () => ({
  getRfq: vi.fn(),
  getRfqItems: vi.fn(),
  getRfqItemsWithPricing: vi.fn(),
  deleteRfq: vi.fn(),
  updateRfq: vi.fn(),
  request: vi.fn(),
}));

vi.mock('../services/pricingRunsApi', () => ({
  getPricingRunsByRfqId: vi.fn(),
  createPricingRun: vi.fn(),
}));

vi.mock('../services/approvalsApi', () => ({
  getApprovalHistory: vi.fn(),
  getPendingApprovals: vi.fn(),
}));

const mockGetRfq = getRfq as unknown as Mock;
const mockGetRfqItems = getRfqItems as unknown as Mock;
const mockGetRfqItemsWithPricing = getRfqItemsWithPricing as unknown as Mock;
const mockGetPricingRunsByRfqId = getPricingRunsByRfqId as unknown as Mock;
const mockGetApprovalHistory = getApprovalHistory as unknown as Mock;
const mockDeleteRfq = deleteRfq as unknown as Mock;
const mockUpdateRfq = updateRfq as unknown as Mock;

const baseRfq = {
  id: 'rfq-demo-001',
  title: 'RFQ-PIPEMART-001',
  status: 'pending_approval',
  customer_name: 'PipeMart',
  client_name: 'PipeMart',
  project_name: 'Demo Project',
  created_at: '2025-10-01T00:00:00.000Z',
  updated_at: '2025-10-02T00:00:00.000Z',
};

const lineItems = Array.from({ length: 6 }).map((_, idx) => ({
  id: `item-${idx + 1}`,
  rfq_id: baseRfq.id,
  line_number: idx + 1,
  description: `Line item ${idx + 1}`,
  quantity: 10,
  unit: 'pcs',
  material_code: `MAT-${idx + 1}`,
  size_display: null,
  size1_raw: null,
  size2_raw: null,
  has_pricing: false,
  pricing: null,
}));

describe('RfqDetail line items rendering', () => {
  beforeEach(() => {
    mockGetRfq.mockResolvedValue(baseRfq);
    mockGetRfqItems.mockResolvedValue(lineItems);
    mockGetRfqItemsWithPricing.mockResolvedValue(lineItems);
    mockGetPricingRunsByRfqId.mockResolvedValue([
      {
        id: 'run-1',
        rfq_id: baseRfq.id,
        status: 'pending_approval',
        total_price: 1000,
        currency: 'USD',
        approval_status: 'pending_approval',
        approved_by: null,
        approved_at: null,
        approval_notes: null,
        outcome: null,
        won_lost_date: null,
        outcome_notes: null,
        parent_version_id: null,
        version_number: 1,
        created_at: '2025-10-02T00:00:00.000Z',
        updated_at: '2025-10-02T00:00:00.000Z',
      },
    ]);
    mockGetApprovalHistory.mockResolvedValue([]);
    mockDeleteRfq.mockResolvedValue(undefined);
    mockUpdateRfq.mockResolvedValue(baseRfq);
  });

  it('shows the seeded line items and summary counts', async () => {
    render(
      <MemoryRouter initialEntries={[`/rfqs/${baseRfq.id}`]}>
        <Routes>
          <Route path="/rfqs/:id" element={<RfqDetail />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for data to load
    await waitFor(() =>
      expect(screen.getByText(baseRfq.title)).toBeInTheDocument()
    );

    // Summary metric shows the correct line-item count
    const lineItemsLabel = screen.getAllByText('Line Items')[0];
    const summaryCount = lineItemsLabel.nextElementSibling;
    expect(summaryCount?.textContent).toBe('6');

    // Table renders all line items
    const table = await screen.findByRole('table');
    const rowGroups = within(table).getAllByRole('rowgroup');
    const bodyRows = within(rowGroups[1]).getAllByRole('row');
    expect(bodyRows).toHaveLength(6);
  });

  it('falls back to plain items when enriched items are empty', async () => {
    mockGetRfqItemsWithPricing.mockResolvedValueOnce([]);
    mockGetRfqItems.mockResolvedValueOnce(lineItems);

    render(
      <MemoryRouter initialEntries={[`/rfqs/${baseRfq.id}`]}>
        <Routes>
          <Route path="/rfqs/:id" element={<RfqDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByText(baseRfq.title)).toBeInTheDocument()
    );

    const lineItemsLabel = screen.getAllByText('Line Items')[0];
    const summaryCount = lineItemsLabel.nextElementSibling;
    expect(summaryCount?.textContent).toBe('6');

    const table = await screen.findByRole('table');
    const rowGroups = within(table).getAllByRole('rowgroup');
    const bodyRows = within(rowGroups[1]).getAllByRole('row');
    expect(bodyRows).toHaveLength(6);
  });
});
