// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CommercialWorkflowPanel } from '@/features/sales/CommercialWorkflowPanel'

describe('CommercialWorkflowPanel', () => {
  it('submits the current RFQ revision through the feasibility command', () => {
    const onFeasibility = vi.fn(async () => undefined)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000099')
    render(<CommercialWorkflowPanel companyId="00000000-0000-4000-8000-000000000001" items={[]} records={{ rfqs: [{ id: '00000000-0000-4000-8000-000000000002', rfq_number: 'RFQ-001', status: 'new', revision: 3 }], quotations: [], salesOrders: [], salesOrderLines: [] }} busy={false} onFeasibility={onFeasibility} onQuotation={vi.fn(async () => undefined)} onApprove={vi.fn(async () => undefined)} onAccept={vi.fn(async () => undefined)} />)
    fireEvent.change(screen.getByLabelText('RFQ'), { target: { value: '00000000-0000-4000-8000-000000000002' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Record feasibility' }).closest('form')!)
    expect(onFeasibility).toHaveBeenCalledWith(expect.objectContaining({ rfqId: '00000000-0000-4000-8000-000000000002', expectedRfqRevision: 3, status: 'feasible' }))
  })
})
