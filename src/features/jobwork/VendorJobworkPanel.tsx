import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { CommandFeedback } from '@/components/CommandFeedback'
import { StockBalanceSummary } from '@/components/StockBalanceSummary'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import type { StockLot } from '@/features/stock/useStockLots'
import type { StockPosition } from '@/features/stock/useStockExplorer'
import { formatCommandError } from '@/lib/commandError'
import { plantTimestamp, positiveDecimalSchema } from '@/lib/decimal'
import type { VendorCommand, VendorWorkspace } from './useVendorJobwork'

type Props = {
  companyId: string | null
  data?: VendorWorkspace
  options: MasterDataOptions
  suppliers: { id: string; code: string; name: string }[]
  lots: StockLot[]
  positions: StockPosition[]
  permissions: string[]
  online: boolean
  busy: boolean
  loading: boolean
  error: boolean
  onCommand: (command: VendorCommand) => Promise<string>
}
const field = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? '').trim()
const steps = ['create', 'send', 'receive', 'loss', 'close'] as const
type Step = typeof steps[number]

export function VendorJobworkPanel({ companyId, data, options, suppliers, lots, positions, permissions, online, busy, loading, error, onCommand }: Props) {
  const [step, setStep] = useState<Step>('create')
  const [orderId, setOrderId] = useState('')
  const [lotId, setLotId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const selectedOrder = data?.orders.find((order) => order.id === orderId)
  const lot = lots.find((row) => row.id === (step === 'create' ? lotId : selectedOrder?.source_lot_id))
  const item = options.items.find((row) => row.id === lot?.item_id)
  const orders = data?.orders ?? []
  const closed = selectedOrder?.status === 'closed' || selectedOrder?.status === 'cancelled'
  const disabled = !companyId || !online || busy || loading || error
  const allowed = permissions.includes(step === 'loss' ? 'jobwork.review' : 'jobwork.manage') &&
    (step !== 'send' || permissions.includes('stock.issue')) &&
    (step !== 'receive' || permissions.includes('stock.receive'))
  const positive = (value?: string) => positiveDecimalSchema.safeParse(value).success
  const lotName = (id: string) => lots.find((row) => row.id === id)?.lot_code ?? id

  async function submit(command: VendorCommand, form: HTMLFormElement, label: string) {
    try {
      const confirmation = await onCommand(command)
      setMessage(`${label} confirmed. Confirmation: ${confirmation}`)
      if (command.action === 'create') { setOrderId(confirmation); setStep('send') }
      form.reset()
    } catch (cause) {
      setMessage(formatCommandError(cause, 'the vendor action could not be confirmed. Check the current balance and retry.'))
    }
  }
  const movement = (form: HTMLFormElement) => ({
    order_id: selectedOrder!.id, revision: selectedOrder!.revision, quantity: field(form, 'quantity'),
    uom: selectedOrder!.uom, reference: field(form, 'reference'), reason: field(form, 'reason'),
  })

  return (
    <section className="record-panel" aria-labelledby="vendor-jobwork-title">
      <h3 className="font-bold" id="vendor-jobwork-title">Vendor job-work</h3>
      <p className="empty-state">Send released, unreserved stock to a processor. Each return becomes a new QC-held lot with its source history. Quantities use the same item and base unit; operation completion is recorded separately in Production.</p>
      <CommandFeedback message={message} />
      {loading && <p role="status">Loading vendor custody…</p>}
      {error && <p role="alert" className="feedback feedback-blocked">Blocked because vendor custody could not be loaded.</p>}
      {!online && <p className="feedback feedback-blocked">Blocked because vendor custody changes require an online connection.</p>}
      <nav aria-label="Vendor job-work actions" className="filter-bar">
        {steps.map((value) => (
          <button className="secondary-button" type="button" key={value} aria-pressed={step === value} disabled={busy}
            onClick={() => { setStep(value); setMessage(null) }}>
            {({ create: 'New vendor order', send: 'Send to vendor', receive: 'Receive from vendor', loss: 'Review vendor loss', close: 'Close vendor order' })[value]}
          </button>
        ))}
      </nav>
      {step !== 'create' && (
        <label className="form-label">Vendor order
          <select aria-label="Vendor order" className="form-input" value={orderId} onChange={(event) => { setOrderId(event.target.value); setMessage(null) }} disabled={busy}>
            <option value="">Select processing order</option>
            {orders.map((order) => <option key={order.id} value={order.id}>{order.number} · {order.process} · {order.status}</option>)}
          </select>
        </label>
      )}
      {selectedOrder && step !== 'create' && (
        <article className="detail-summary" aria-label="Selected vendor custody">
          <strong>{selectedOrder.number} · {selectedOrder.status} · Revision {selectedOrder.revision}</strong>
          <p>{suppliers.find((row) => row.id === selectedOrder.supplier_id)?.name ?? selectedOrder.supplier_id} · {lotName(selectedOrder.source_lot_id)} · Due {selectedOrder.due_date}</p>
          <p>Planned {selectedOrder.quantity} {selectedOrder.uom} · Sent {selectedOrder.sent_quantity} {selectedOrder.uom} · Returned {selectedOrder.returned_quantity} {selectedOrder.uom}</p>
          <p>At vendor {selectedOrder.at_vendor_quantity} {selectedOrder.uom} · Confirmed loss {selectedOrder.loss_quantity} {selectedOrder.uom} · Remaining to send {selectedOrder.remaining_to_send} {selectedOrder.uom}</p>
          {positive(selectedOrder.cancelled_unsent_quantity) && <p>Explicitly cancelled unsent balance: {selectedOrder.cancelled_unsent_quantity} {selectedOrder.uom}</p>}
          {closed && <p>Closed because {selectedOrder.close_reason}. No further custody changes are allowed.</p>}
        </article>
      )}
      {!allowed && <p className="empty-state">{step === 'loss' ? 'An authorized quality reviewer must record confirmed vendor loss.' : 'A stores or planning owner must perform this vendor action.'}</p>}
      {step === 'create' ? (
        <ActionForm title="Create vendor order" disabled={disabled || !allowed || !lot || !item}
          onSubmit={(form) => {
            if (!lot || !item) return
            void submit({ action: 'create', data: {
              lot_id: lot.id, supplier_id: field(form, 'supplier'), number: field(form, 'number'),
              process: field(form, 'process'), due_date: field(form, 'due'), quantity: field(form, 'quantity'), uom: item.base_uom,
            } }, form, 'Vendor order')
          }}>
          <label className="form-label">Vendor order number<input aria-label="Vendor order number" className="form-input" name="number" required maxLength={64} /></label>
          <label className="form-label">Processor<select aria-label="Vendor processor" className="form-input" name="supplier" required defaultValue=""><option value="">Select supplier / processor</option>{suppliers.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</select></label>
          <label className="form-label">Source lot<select aria-label="Vendor source lot" className="form-input" value={lotId} onChange={(event) => setLotId(event.target.value)} required><option value="">Select source lot</option>{lots.map((row) => <option key={row.id} value={row.id}>{row.lot_code} · {row.qc_status}</option>)}</select></label>
          {lot && <StockBalanceSummary position={positions.find((row) => row.lot_id === lot.id)} uom={item?.base_uom} />}
          <label className="form-label">Processing instructions<input aria-label="Vendor processing instructions" className="form-input" name="process" required maxLength={160} /></label>
          <label className="form-label">Planned quantity ({item?.base_uom ?? 'select item'})<input aria-label="Vendor planned quantity" className="form-input" name="quantity" inputMode="decimal" required /></label>
          <label className="form-label">Return due date<input aria-label="Vendor return due date" className="form-input" type="date" name="due" required /></label>
        </ActionForm>
      ) : selectedOrder && !closed ? (
        <>
          {step === 'send' && lot && <StockBalanceSummary position={positions.find((row) => row.lot_id === lot.id)} uom={selectedOrder.uom} />}
          {step === 'send' && lot?.qc_status !== 'released' && <p className="feedback feedback-blocked">Blocked because the source lot is on QC hold or rejected.</p>}
          <ActionForm key={`${step}:${selectedOrder.id}`} title={({ send: 'Confirm vendor send', receive: 'Confirm vendor return', loss: 'Record confirmed vendor loss', close: 'Close reconciled vendor order' })[step]}
            disabled={disabled || !allowed || (step === 'send' && (!lot || lot.qc_status !== 'released' || !positive(selectedOrder.remaining_to_send))) || ((step === 'receive' || step === 'loss') && !positive(selectedOrder.at_vendor_quantity)) || (step === 'close' && (positive(selectedOrder.at_vendor_quantity) || !positive(selectedOrder.sent_quantity)))}
            onSubmit={(form) => {
              if (step === 'send' && lot) void submit({ action: 'send', data: { ...movement(form), lot_revision: lot.revision } }, form, 'Vendor send')
              else if (step === 'receive') void submit({ action: 'receive', data: {
                ...movement(form), location_id: field(form, 'location'), lot_code: field(form, 'code'), certificate_reference: field(form, 'certificate'),
              } }, form, 'Vendor return')
              else if (step === 'loss') void submit({ action: 'loss', data: movement(form) }, form, 'Vendor loss')
              else if (step === 'close') void submit({ action: 'close', data: {
                order_id: selectedOrder.id, revision: selectedOrder.revision, reason: field(form, 'reason'), cancel_unsent: new FormData(form).get('cancel_unsent') === 'on',
              } }, form, 'Vendor order close')
            }}>
            {step !== 'close' && <>
              <label className="form-label">Quantity ({selectedOrder.uom})<input aria-label="Vendor movement quantity" className="form-input" name="quantity" inputMode="decimal" required /></label>
              <label className="form-label">Movement / review reference<input aria-label="Vendor movement reference" className="form-input" name="reference" required maxLength={160} /></label>
            </>}
            {step === 'receive' && <>
              <label className="form-label">Returned lot code<input aria-label="Vendor returned lot code" className="form-input" name="code" required maxLength={64} /></label>
              <label className="form-label">Receiving location<select aria-label="Vendor receiving location" className="form-input" name="location" required defaultValue=""><option value="">Select physical location</option>{options.locations.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</select></label>
              <label className="form-label">Processor certificate reference<input aria-label="Processor certificate reference" className="form-input" name="certificate" maxLength={1000} /></label>
              <p className="empty-state">The return remains on QC hold. A certificate reference does not claim a verified file; upload actual evidence from Quality → Traceability.</p>
            </>}
            {step === 'loss' && <label className="form-label"><input type="checkbox" required />I reviewed the actual vendor shortage. This records loss, not a pending return.</label>}
            {step === 'close' && positive(selectedOrder.remaining_to_send) && <label className="form-label"><input name="cancel_unsent" type="checkbox" required />Explicitly cancel the unsent balance of {selectedOrder.remaining_to_send} {selectedOrder.uom}.</label>}
            <label className="form-label">Reason<input aria-label="Vendor action reason" className="form-input" name="reason" required maxLength={2000} /></label>
          </ActionForm>
          {step === 'close' && positive(selectedOrder.at_vendor_quantity) && <p className="feedback feedback-blocked">Blocked because quantities remain at the vendor. Record their actual return or reviewed loss first.</p>}
          {step === 'close' && !positive(selectedOrder.sent_quantity) && <ActionForm title="Cancel unsent vendor order" disabled={disabled || !allowed}
            onSubmit={(form) => { void submit({ action: 'cancel', data: { order_id: selectedOrder.id, revision: selectedOrder.revision, reason: field(form, 'reason') } }, form, 'Vendor order cancellation') }}>
            <label className="form-label">Cancellation reason<input aria-label="Vendor cancellation reason" className="form-input" name="reason" required maxLength={2000} /></label>
          </ActionForm>}
        </>
      ) : !selectedOrder ? <p className="empty-state">Select a vendor order to review its custody and next action.</p> : null}
      <h4 className="font-bold">Recorded vendor movements</h4>
      <ul className="record-list" aria-label="Vendor custody history">
        {data?.events.filter((event) => event.vendor_order_id === orderId).map((event) => <li className="record-card" key={event.id}>
          <strong>{event.kind} · {event.quantity_delta} {event.uom}</strong>
          <p>{event.reference} · {plantTimestamp(event.created_at)}</p><p>{event.reason}</p>
          {event.output_lot_id && <p>Returned lot: {lotName(event.output_lot_id)} · Fresh QC required</p>}
          {event.certificate_reference && <p>Certificate reference: {event.certificate_reference}</p>}
        </li>)}
      </ul>
    </section>
  )
}
