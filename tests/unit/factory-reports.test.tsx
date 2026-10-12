// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FactoryReportsPanel } from '@/features/reports/FactoryReportsPanel'
import { factoryReportSchema, reportFilterSchema } from '@/features/reports/useFactoryReports'
import type { FactoryReport, ReportFilters } from '@/features/reports/useFactoryReports'

afterEach(cleanup)
const id = '00000000-0000-4000-8000-000000000001'
const filters: ReportFilters = { kind: 'movements', from: '', to: '', search: '', page: 0 }
const data: FactoryReport = { total: 51, page: 0, page_size: 50, as_of: '2026-10-11T00:00:00Z', rows: [{
  key: '1', record_id: id, record_kind: 'lot', label: 'SAMPLE-LOT', sku: 'SAMPLE-ITEM', party: null, status: 'shipment',
  occurred_at: '2026-10-10T00:00:00Z', due_date: null, age_days: 1, overdue: false,
  quantity: '-0.000001', quantity_label: 'Signed movement', uom: 'kg', details: 'SAMPLE shipment event',
}] }
const props = { data, filters, availableKinds: ['movements', 'backlog'] as ReportFilters['kind'][], loading: false, error: false, online: true,
  onFilter: vi.fn(), onPage: vi.fn(), onRefresh: vi.fn(), onOpenRecord: vi.fn() }
it('keeps exact signed quantities and units, and drills into the source record', () => {
  const onOpenRecord = vi.fn()
  render(<FactoryReportsPanel {...props} onOpenRecord={onOpenRecord} />)
  expect(screen.getByText('Signed movement: -0.000001 kg')).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'WIP aging' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open SAMPLE-LOT' }))
  expect(onOpenRecord).toHaveBeenCalledWith('lot', id)
})
it('validates the date range before a read and resets pagination when applying filters', () => {
  const onFilter = vi.fn()
  render(<FactoryReportsPanel {...props} filters={{ ...filters, page: 1 }} onFilter={onFilter} />)
  fireEvent.change(screen.getByLabelText('Created / posted from'), { target: { value: '2026-10-12' } })
  fireEvent.change(screen.getByLabelText('Created / posted to'), { target: { value: '2026-10-11' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Factory report filters' }))
  expect(onFilter).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('From date must be on or before To date')
  fireEvent.change(screen.getByLabelText('Created / posted to'), { target: { value: '2026-10-13' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Factory report filters' }))
  expect(onFilter).toHaveBeenCalledWith({ ...filters, from: '2026-10-12', to: '2026-10-13', page: 0 })
})
it('does not show stale success after failed reads and disables unavailable pages', () => {
  const onPage = vi.fn()
  const { rerender } = render(<FactoryReportsPanel {...props} onPage={onPage} />)
  expect(screen.getByRole('button', { name: 'Previous report page' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Next report page' }))
  expect(onPage).toHaveBeenCalledWith(1)
  rerender(<FactoryReportsPanel {...props} error />)
  expect(screen.getByRole('alert')).toHaveTextContent('report could not be loaded')
  expect(screen.queryByText('Signed movement: -0.000001 kg')).not.toBeInTheDocument()
  rerender(<FactoryReportsPanel {...props} online={false} />)
  expect(screen.getByRole('status')).toHaveTextContent('Cached, read-only')
  expect(screen.getByRole('button', { name: 'Refresh report' })).toBeDisabled()
})
it('accepts exact database numeric strings and rejects invalid paging or units without a quantity', () => {
  expect(factoryReportSchema.parse({ ...data, rows: [{ ...data.rows[0], quantity: '999999999999.999999' }] }).rows[0]?.quantity).toBe('999999999999.999999')
  expect(reportFilterSchema.safeParse({ ...filters, page: -1 }).success).toBe(false)
  expect(factoryReportSchema.safeParse({ ...data, rows: [{ ...data.rows[0], quantity: 'NaN' }] }).success).toBe(false)
})
