// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CreateRfqPanel } from '@/features/sales/CreateRfqPanel'

describe('CreateRfqPanel', () => {
  it('passes a validated user entry to the trusted command adapter', () => {
    const onCreate = vi.fn()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000099')
    render(
      <CreateRfqPanel
        companyId="00000000-0000-4000-8000-000000000001"
        customers={[{ id: '00000000-0000-4000-8000-000000000002', code: 'CUST-01', name: 'Sample Customer' }]}
        creating={false}
        error={null}
        onCreate={onCreate}
      />
    )

    fireEvent.change(screen.getByLabelText('RFQ number'), { target: { value: 'RFQ-001' } })
    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: '00000000-0000-4000-8000-000000000002' } })
    fireEvent.change(screen.getByLabelText('Requirement summary'), { target: { value: 'Hex fastener enquiry' } })
    fireEvent.change(screen.getByLabelText('Requested line'), { target: { value: 'M8 hex bolt' } })
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '100' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create RFQ' }).closest('form')!)

    expect(onCreate).toHaveBeenCalledWith({
      companyId: '00000000-0000-4000-8000-000000000001',
      rfqNumber: 'RFQ-001',
      customerId: '00000000-0000-4000-8000-000000000002',
      requirementSummary: 'Hex fastener enquiry',
      idempotencyKey: '00000000-0000-4000-8000-000000000099',
      line: { requestedDescription: 'M8 hex bolt', quantity: '100', uom: 'pcs' }
    })
  })
})
