// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CommercialInbox } from '@/features/sales/CommercialInbox'

describe('commercial inbox', () => {
  it('filters missing information and owner without losing its blocker', () => {
    const onSelect = vi.fn()
    render(
      <CommercialInbox
        records={{
          rfqs: [
            {
              id: 'one',
              rfq_number: 'SAMPLE-OPEN',
              status: 'new',
              revision: 1,
              created_by: 'other',
            },
            {
              id: 'two',
              rfq_number: 'SAMPLE-WAIT',
              status: 'awaiting_info',
              revision: 2,
              created_by: 'me',
            },
          ],
          quotations: [],
          salesOrders: [],
          salesOrderLines: [],
        }}
        customers={[]}
        selectedId={null}
        currentUserId="me"
        loading={false}
        error={false}
        detailLoading={false}
        detailError={false}
        onSelect={onSelect}
      />,
    )
    fireEvent.change(screen.getByLabelText('Feasibility state'), {
      target: { value: 'awaiting_info' },
    })
    expect(screen.queryByText('SAMPLE-OPEN')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Created by me'))
    fireEvent.click(screen.getByRole('button', { name: /SAMPLE-WAIT/ }))
    expect(onSelect).toHaveBeenCalledWith('two')
    expect(
      screen.getByText(/Blocked because information is required/),
    ).toBeVisible()
  })
})
