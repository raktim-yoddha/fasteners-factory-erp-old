// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { StockExplorerPanel } from '@/features/stock/StockExplorerPanel'

describe('stock explorer', () => {
  it('shows exact server balances and explains a held lot before ledger navigation', () => {
    const onSelect = vi.fn()
    render(
      <StockExplorerPanel
        positions={[
          {
            lot_id: 'lot',
            item_id: 'item',
            location_id: 'location',
            qc_status: 'hold',
            on_hand: '999999999999.000001',
            reserved: '0',
            available_to_promise: '0',
          },
        ]}
        lots={[
          {
            id: 'lot',
            item_id: 'item',
            lot_code: 'SAMPLE-LOT',
            qc_status: 'hold',
            revision: 1,
          },
        ]}
        options={{
          plants: [],
          warehouses: [],
          items: [
            {
              id: 'item',
              sku: 'SAMPLE-MATERIAL',
              description: 'SAMPLE Steel',
              base_uom: 'kg',
            },
          ],
          locations: [
            { id: 'location', code: 'SAMPLE-LOC', name: 'SAMPLE Location' },
          ],
        }}
        selectedLotId={null}
        movements={[]}
        loading={false}
        error={false}
        movementLoading={false}
        movementError={false}
        onSelect={onSelect}
      />,
    )
    const button = screen.getByRole('button', { name: /SAMPLE-LOT/ })
    expect(button).toHaveTextContent('Physical 999999999999.000001 kg')
    expect(button).toHaveTextContent('Available 0 kg')
    expect(button).toHaveTextContent('Blocked because QC hold')
    fireEvent.click(button)
    expect(onSelect).toHaveBeenCalledWith('lot')
  })
})
