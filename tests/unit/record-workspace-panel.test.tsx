// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RecordWorkspacePanel } from '@/features/records/RecordWorkspacePanel'

vi.mock('@/features/records/useRecordWorkspace', () => ({
  recordKindLabel: (kind: string) => kind,
  useRecordWorkspace: () => ({
    isLoading: false,
    isError: false,
    data: {
      kind: 'sales-order', title: 'SO-001', state: 'open', source: 'Accepted sales order', lastRecordedAt: '2026-10-10T12:00:00.000Z', nextWorkspace: 'Sales orders',
      summary: [{ label: 'Customer PO', value: 'PO-001' }],
      relatedRecords: [{ id: '00000000-0000-4000-8000-000000000002', label: 'Q-001', kind: 'quotation' }],
      timeline: [],
    }
  })
}))

describe('RecordWorkspacePanel', () => {
  it('shows record context, permission-limited history and linked record navigation', () => {
    const onOpenRecord = vi.fn()
    render(<RecordWorkspacePanel companyId="00000000-0000-4000-8000-000000000001" recordId="00000000-0000-4000-8000-000000000001" recordType="sales-order" onBack={vi.fn()} onOpenRecord={onOpenRecord} />)

    expect(screen.getByRole('heading', { name: 'SO-001' })).toBeVisible()
    expect(screen.getByText('Customer PO')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }))
    expect(screen.getByText('No audit entries are available under your current permissions.')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'Linked records' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onOpenRecord).toHaveBeenCalledWith('quotation', '00000000-0000-4000-8000-000000000002')
  })
})
