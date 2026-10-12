// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StockActionsPanel } from '@/features/stock/StockActionsPanel'

afterEach(cleanup)
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const props = (
  overrides: Partial<ComponentProps<typeof StockActionsPanel>> = {},
): ComponentProps<typeof StockActionsPanel> => ({
  companyId: id(1),
  options: { plants: [], warehouses: [], items: [], locations: [] },
  lots: [
    {
      id: id(2),
      item_id: id(3),
      lot_code: 'SAMPLE-HELD',
      qc_status: 'hold',
      revision: 3,
    },
  ],
  records: {
    rfqs: [],
    quotations: [],
    salesOrders: [
      {
        id: id(4),
        sales_order_number: 'SAMPLE-SO',
        status: 'partially_shipped',
        revision: 7,
      },
    ],
    salesOrderLines: [
      {
        id: id(5),
        sales_order_id: id(4),
        item_id: id(3),
        ordered_quantity: '10.000001',
        uom: 'pcs',
      },
    ],
  },
  reservations: [
    {
      id: id(6),
      sales_order_line_id: id(5),
      lot_id: id(2),
      quantity: '10.000001',
      consumed_quantity: '0.000001',
      remaining_quantity: '10.000000',
      status: 'active',
    },
  ],
  receiving: false,
  releasing: false,
  reserving: false,
  unreserving: false,
  permissions: ['stock.reserve'],
  online: true,
  onReceive: vi.fn(async () => undefined),
  onRelease: vi.fn(async () => undefined),
  onReserve: vi.fn(async () => undefined),
  onUnreserve: vi.fn(async () => id(6)),
  ...overrides,
})
const choose = () => {
  fireEvent.change(screen.getByLabelText('Reservation to release'), {
    target: { value: id(6) },
  })
  fireEvent.change(screen.getByLabelText('Reservation release reason'), {
    target: { value: 'SAMPLE approved NCR disposition' },
  })
}

describe('reservation release recovery', () => {
  it('passes reason and current order revision, preserves exact context, and confirms only after the server resolves', async () => {
    let finish!: (value: string) => void
    const onUnreserve = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    render(<StockActionsPanel {...props({ onUnreserve })} />)
    fireEvent.change(screen.getByLabelText('Reservation to release'), {
      target: { value: id(6) },
    })
    expect(
      screen.getByRole('button', { name: 'Release reservation' }),
    ).toBeDisabled()
    expect(
      screen.getByText(
        /Originally reserved 10\.000001 pcs; shipped 0\.000001 pcs; remaining allocation 10\.000000 pcs/,
      ),
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('Reservation release reason'), {
      target: { value: 'SAMPLE approved NCR disposition' },
    })
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Release reservation' })
        .closest('form')!,
    )
    expect(onUnreserve).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: id(1),
        reservationId: id(6),
        reason: 'SAMPLE approved NCR disposition',
        expectedSalesOrderRevision: 7,
      }),
    )
    expect(screen.queryByText(/Reservation released\./)).not.toBeInTheDocument()
    await act(async () => {
      finish(id(6))
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      `Reservation released. Shipped quantity stays recorded. Confirmation: ${id(6)}`,
    )
    expect(screen.getByLabelText('Reservation release reason')).toHaveValue('')
  })

  it.each([{ online: false }, { permissions: [] }, { permissions: undefined }])(
    'blocks unreserve without network and explicit permission: %j',
    async (overrides) => {
      const onUnreserve = vi.fn(async () => id(6))
      render(<StockActionsPanel {...props({ ...overrides, onUnreserve })} />)
      choose()
      const button = screen.getByRole('button', { name: 'Release reservation' })
      expect(button).toBeDisabled()
      fireEvent.submit(button.closest('form')!)
      expect(onUnreserve).not.toHaveBeenCalled()
    },
  )

  it('shows server rejection without a false confirmation', async () => {
    render(
      <StockActionsPanel
        {...props({
          onUnreserve: vi.fn(async () => {
            throw new Error('PACKING_PENDING')
          }),
        })}
      />,
    )
    choose()
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Release reservation' })
        .closest('form')!,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Blocked because',
    )
    expect(screen.queryByText(/Reservation released\./)).not.toBeInTheDocument()
  })
})
