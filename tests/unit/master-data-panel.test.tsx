// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MasterDataSetupPanel } from '@/features/master-data/MasterDataSetupPanel'

describe('MasterDataSetupPanel', () => {
  it('sends a customer request only for the selected company', async () => {
    const onCreate = vi.fn(async () => undefined)
    render(
      <MasterDataSetupPanel
        companyId="00000000-0000-4000-8000-000000000001"
        options={{ plants: [], warehouses: [] }}
        creating={false}
        onCreate={onCreate}
      />
    )

    fireEvent.change(screen.getByLabelText('Customer code'), { target: { value: 'CUST-01' } })
    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Sample Customer' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create customer' }).closest('form')!)

    expect(onCreate).toHaveBeenCalledWith({ kind: 'customer', companyId: '00000000-0000-4000-8000-000000000001', code: 'CUST-01', name: 'Sample Customer' })
  })
})
