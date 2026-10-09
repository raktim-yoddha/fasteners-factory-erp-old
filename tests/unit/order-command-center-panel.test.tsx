// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrderCommandCenterPanel } from '@/features/dashboard/OrderCommandCenterPanel'

describe('OrderCommandCenterPanel', () => {
  it('shows independent sales, stock and dispatch states with the next action', () => {
    render(<OrderCommandCenterPanel loading={false} error={false} rows={[{
      sales_order_id: '00000000-0000-4000-8000-000000000001', sales_order_number: 'SO-001', customer_po_number: 'PO-001', sales_order_status: 'open', promised_date: null,
      active_reservation_count: 1, prepared_shipment_count: 0, dispatched_shipment_count: 0, stock_status: 'reserved', packing_dispatch_status: 'not prepared', next_action: 'Prepare packing shipment'
    }]} />)

    expect(screen.getByRole('columnheader', { name: 'Stock' })).toBeVisible()
    expect(screen.getByText('reserved (1 active)')).toBeVisible()
    expect(screen.getByText('Prepare packing shipment')).toBeVisible()
  })
})
