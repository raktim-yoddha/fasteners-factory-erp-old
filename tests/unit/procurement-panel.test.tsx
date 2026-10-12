// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProcurementPanel } from '@/features/procurement/ProcurementPanel'

describe('material purchasing', () => {
  it('submits exact base-unit demand and waits for confirmation before showing success', async () => {
    let resolve: (id: string) => void = () => undefined
    const onCommand = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done
        }),
    )
    render(
      <ProcurementPanel
        companyId="company"
        options={{
          plants: [],
          warehouses: [],
          items: [
            {
              id: 'item',
              sku: 'SAMPLE-STEEL',
              description: 'SAMPLE Steel',
              base_uom: 'kg',
            },
          ],
          locations: [],
        }}
        records={{
          requisitions: [],
          orders: [],
          receipts: [],
          suppliers: [],
          counts: [],
        }}
        commercial={{
          rfqs: [],
          quotations: [],
          salesOrders: [],
          salesOrderLines: [],
        }}
        lots={[]}
        permissions={['purchase.manage']}
        busy={false}
        loading={false}
        error={false}
        onCommand={onCommand}
      />,
    )
    fireEvent.change(screen.getByLabelText('Material item'), {
      target: { value: 'item' },
    })
    fireEvent.change(screen.getByLabelText('Requisition number'), {
      target: { value: 'SAMPLE-PR' },
    })
    fireEvent.change(screen.getByLabelText('Required quantity (kg)'), {
      target: { value: '999999999999.000001' },
    })
    fireEvent.change(screen.getByLabelText('Demand reason'), {
      target: { value: 'SAMPLE demand' },
    })
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Submit requisition' })
        .closest('form')!,
    )
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'request_material',
        params: expect.objectContaining({
          p_quantity: '999999999999.000001',
          p_uom: 'kg',
        }),
      }),
    )
    expect(screen.queryByText(/Material requested\./)).not.toBeInTheDocument()
    resolve('confirmation')
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Material requested. Confirmation: confirmation',
      ),
    )
  })
})
