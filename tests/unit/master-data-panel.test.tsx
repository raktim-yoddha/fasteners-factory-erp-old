// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MasterDataSetupPanel } from '@/features/master-data/MasterDataSetupPanel'

const companyId = '00000000-0000-4000-8000-000000000001'
const plantId = '00000000-0000-4000-8000-000000000002'
const itemId = '00000000-0000-4000-8000-000000000003'

afterEach(cleanup)

describe('MasterDataSetupPanel', () => {
  function renderPanel(onCreate = vi.fn(async () => undefined)) {
    render(
      <MasterDataSetupPanel
        companyId={companyId}
        options={{
          plants: [{ id: plantId, name: 'SAMPLE Plant' }],
          warehouses: [],
          items: [{ id: itemId, sku: 'SAMPLE-M8', description: 'SAMPLE M8 fastener', base_uom: 'pcs' }],
          locations: []
        }}
        creating={false}
        onCreate={onCreate}
      />
    )
    return onCreate
  }

  it('sends a customer request only for the selected company', () => {
    const onCreate = vi.fn(async () => undefined)
    renderPanel(onCreate)

    fireEvent.change(screen.getByLabelText('Customer code'), { target: { value: 'CUST-01' } })
    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Sample Customer' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create customer' }).closest('form')!)

    expect(onCreate).toHaveBeenCalledWith({ kind: 'customer', companyId, code: 'CUST-01', name: 'Sample Customer' })
  })

  it('sends supplier, drawing and work-centre records through the selected company', () => {
    const onCreate = renderPanel()

    fireEvent.change(screen.getByLabelText('Supplier code'), { target: { value: 'SUP-01' } })
    fireEvent.change(screen.getByLabelText('Supplier name'), { target: { value: 'Sample Supplier' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create supplier' }).closest('form')!)

    fireEvent.change(screen.getByLabelText('Item'), { target: { value: itemId } })
    fireEvent.change(screen.getByLabelText('Drawing number'), { target: { value: 'SAMPLE-DRW-01' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create drawing' }).closest('form')!)

    fireEvent.change(screen.getAllByLabelText('Plant')[1]!, { target: { value: plantId } })
    fireEvent.change(screen.getByLabelText('Work centre code'), { target: { value: 'WC-01' } })
    fireEvent.change(screen.getByLabelText('Work centre name'), { target: { value: 'Sample Work Centre' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create work centre' }).closest('form')!)

    expect(onCreate).toHaveBeenNthCalledWith(1, { kind: 'supplier', companyId, code: 'SUP-01', name: 'Sample Supplier' })
    expect(onCreate).toHaveBeenNthCalledWith(2, { kind: 'drawing', companyId, itemId, drawingNumber: 'SAMPLE-DRW-01' })
    expect(onCreate).toHaveBeenNthCalledWith(3, { kind: 'workCentre', companyId, plantId, code: 'WC-01', name: 'Sample Work Centre' })
  })
})
