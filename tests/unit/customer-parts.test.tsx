// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CustomerPartsPanel } from '@/features/master-data/CustomerPartsPanel'
import { customerPartCommandSchema, type CustomerPart } from '@/features/master-data/useCustomerParts'
import { CommercialWorkflowPanel } from '@/features/sales/CommercialWorkflowPanel'

afterEach(cleanup)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const part: CustomerPart = { id: id(1), company_id: id(2), customer_id: id(3), item_id: id(4), part_number: 'SAMPLE-PART', part_revision: '', reference_version: 1,
  description: 'SAMPLE customer specification', drawing_revision_id: null, drawing_label: null, customer_name: 'SAMPLE customer', customer_code: 'SAMPLE-C', sku: 'SAMPLE-SKU', created_by: id(5), created_at: '2026-10-12T00:00:00Z', retired_at: null, retired_by: null, retirement_reason: null }
const items = [{ id: id(4), sku: 'SAMPLE-SKU', description: 'SAMPLE item', base_uom: 'pcs' as const }]
const props = { parts: [part], customers: [{ id: id(3), code: 'SAMPLE-C', name: 'SAMPLE customer' }], items,
  engineering: { drawings: [], boms: [], routings: [] }, permissions: ['customer_parts.read','customer_parts.manage'], online: true, busy: false, loading: false, error: false, onCommand: vi.fn() }
it('preserves an unspecified customer revision and normalizes identifiers without inventing a revision', () => {
  const parsed = customerPartCommandSchema.parse({ action: 'create', data: { customer_id: id(3), item_id: id(4), part_number: ' sample-part ', description: 'SAMPLE item', drawing_revision_id: null, reason: 'SAMPLE checked' } })
  expect(parsed).toMatchObject({ data: { part_number: 'SAMPLE-PART', part_revision: '' } })
  expect(customerPartCommandSchema.safeParse({ action: 'retire', referenceId: id(1), reason: '' }).success).toBe(false)
})
it('filters retired history but retains the original mapping and retirement reason on demand', () => {
  render(<CustomerPartsPanel {...props} parts={[{ ...part, retired_at: '2026-10-12T01:00:00Z', retirement_reason: 'SAMPLE correction', retired_by: id(5) }]} />)
  expect(screen.queryByText('SAMPLE-SKU · SAMPLE customer specification · Mapping v1')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Include retired references'))
  expect(screen.getByText('⚠ Retired because SAMPLE correction')).toBeInTheDocument()
  expect(screen.getByText(/No customer revision recorded/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Retire SAMPLE-PART/ })).not.toBeInTheDocument()
})
it('retirement reports success only after confirmation and retains the failed reason', async () => {
  const onCommand = vi.fn().mockRejectedValue(new Error('SAMPLE network failure'))
  render(<CustomerPartsPanel {...props} onCommand={onCommand} />)
  fireEvent.click(screen.getByRole('button', { name: 'Retire SAMPLE-PART mapping v1' }))
  fireEvent.change(screen.getByLabelText('Reference retirement reason'), { target: { value: 'SAMPLE corrected mapping' } })
  await act(async () => fireEvent.submit(screen.getByRole('button', { name: 'Retire customer part reference' }).closest('form')!))
  expect(onCommand).toHaveBeenCalledWith({ action: 'retire', referenceId: id(1), reason: 'SAMPLE corrected mapping' })
  expect(screen.getByLabelText('Reference retirement reason')).toHaveValue('SAMPLE corrected mapping')
  expect(screen.getByRole('alert')).toHaveTextContent('could not be confirmed')
  expect(screen.queryByText(/reference retired/)).not.toBeInTheDocument()
})
it('prevents changes to in-flight or offline input and hides writes from read-only staff', () => {
  const { rerender } = render(<CustomerPartsPanel {...props} busy />)
  expect(screen.getByLabelText('Customer part number')).toBeDisabled()
  rerender(<CustomerPartsPanel {...props} online={false} />)
  expect(screen.getByRole('button', { name: 'Record customer part reference' })).toBeDisabled()
  rerender(<CustomerPartsPanel {...props} permissions={['customer_parts.read']} />)
  expect(screen.queryByRole('button', { name: 'Record customer part reference' })).not.toBeInTheDocument()
})
function commercial(parts: CustomerPart[]) {
  return <CommercialWorkflowPanel companyId={id(2)} items={items} engineering={{ drawings: [], boms: [], routings: [] }} records={{ rfqs: [{ id: id(6), rfq_number: 'SAMPLE-RFQ', customer_id: id(3), status: 'qualified', revision: 2 }], quotations: [], salesOrders: [], salesOrderLines: [] }} customerParts={parts} busy={false}
    onFeasibility={vi.fn()} onQuotation={vi.fn()} onApprove={vi.fn()} onAccept={vi.fn()} />
}
it('offers only active references for the selected RFQ customer, item and drawing', () => {
  render(commercial([part, { ...part, id: id(7), customer_id: id(9) }, { ...part, id: id(8), item_id: id(10) }, { ...part, id: id(11), retired_at: '2026-10-12' }, { ...part, id: id(12), drawing_revision_id: id(13) }]))
  fireEvent.click(screen.getByRole('button', { name: 'Quotation' }))
  fireEvent.change(screen.getByLabelText('Qualified RFQ'), { target: { value: id(6) } })
  fireEvent.change(screen.getByLabelText('Item', { exact: true }), { target: { value: id(4) } })
  const options = screen.getByLabelText('Quotation customer part').children
  expect(options).toHaveLength(2)
  expect(options[1]).toHaveValue(part.id)
})
it('blocks a selected reference when it is retired while the quotation form is open', () => {
  const { rerender } = render(commercial([part]))
  fireEvent.click(screen.getByRole('button', { name: 'Quotation' }))
  fireEvent.change(screen.getByLabelText('Qualified RFQ'), { target: { value: id(6) } })
  fireEvent.change(screen.getByLabelText('Item', { exact: true }), { target: { value: id(4) } })
  fireEvent.change(screen.getByLabelText('Quotation customer part'), { target: { value: part.id } })
  rerender(commercial([{ ...part, retired_at: '2026-10-12' }]))
  expect(screen.getByRole('alert')).toHaveTextContent('selected customer reference is retired')
  expect(screen.getByRole('button', { name: 'Create quotation' })).toBeDisabled()
})
