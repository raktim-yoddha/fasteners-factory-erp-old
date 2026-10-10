// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GlobalSearchPanel } from '@/features/search/GlobalSearchPanel'

describe('GlobalSearchPanel', () => {
  it('sends a query and labels permitted results by record type', () => {
    const onQueryChange = vi.fn()
    const onOpenRecord = vi.fn()
    render(<GlobalSearchPanel companyId="00000000-0000-4000-8000-000000000001" error={false} loading={false} onQueryChange={onQueryChange} onOpenRecord={onOpenRecord} query="SAMPLE" results={[{ record_type: 'Customer', record_id: '00000000-0000-4000-8000-000000000002', label: 'SAMPLE-CUST — SAMPLE Customer' }]} />)

    fireEvent.change(screen.getByLabelText('Search records'), { target: { value: 'CUST' } })

    expect(onQueryChange).toHaveBeenCalledWith('CUST')
    expect(screen.getByText('Customer')).toBeInTheDocument()
    expect(screen.getByText('SAMPLE-CUST — SAMPLE Customer')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /SAMPLE-CUST/i }))
    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ record_type: 'Customer' }))
  })
})
