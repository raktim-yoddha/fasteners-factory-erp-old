import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { CommandFeedback } from '@/components/CommandFeedback'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import { formatCommandError } from '@/lib/commandError'
import { plantTimestamp, positiveDecimalSchema } from '@/lib/decimal'
import type { CustomerReturnInput, CustomerReturnWorkspace } from './useCustomerReturns'

type Props = {
  companyId: string | null; data?: CustomerReturnWorkspace; options: MasterDataOptions;
  permissions: string[]; online: boolean; busy: boolean; loading: boolean; error: boolean;
  onReceive: (input: CustomerReturnInput) => Promise<string>
}
export function CustomerReturnsPanel({ companyId, data, options, permissions, online, busy, loading, error, onReceive }: Props) {
  const [lineId, setLineId] = useState('')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const line = data?.shipments.find((row) => row.id === lineId)
  const shipments = data?.shipments.filter((row) =>
    `${row.shipment_number} ${row.sales_order_number} ${row.customer_name} ${row.sku} ${row.source_lot_code}`.toLowerCase().includes(search.toLowerCase())) ?? []
  const disabled = !companyId || !online || busy || loading || error || !permissions.includes('customer_returns.receive') || !line || !positiveDecimalSchema.safeParse(line.returnable_quantity).success

  async function receive(form: HTMLFormElement) {
    if (!line) return
    const fields = new FormData(form)
    const read = (name: string) => String(fields.get(name) ?? '').trim()
    try {
      const confirmation = await onReceive({
        shipment_line_id: line.id, shipment_revision: line.shipment_revision, quantity: read('quantity'), uom: line.uom,
        location_id: read('location'), return_number: read('number'), lot_code: read('lot'), reference: read('reference'), reason: read('reason'),
      })
      setMessage(`Customer return received into QC hold. Confirmation: ${confirmation}`)
      form.reset()
    } catch (cause) {
      setMessage(formatCommandError(cause, 'the return could not be confirmed. Keep the received goods segregated and retry.'))
    }
  }
  return (
    <section className="record-panel" aria-labelledby="customer-returns-title">
      <h3 className="font-bold" id="customer-returns-title">Customer returns</h3>
      <p className="empty-state">Receive actual dispatched goods into a separate QC-held lot. Original shipments and orders stay historical; replacements need a separate accepted order. No credit note or tax document is issued here.</p>
      <CommandFeedback message={message} />
      {loading && <p role="status">Loading shipped quantities and returns…</p>}
      {error && <p role="alert" className="feedback feedback-blocked">Blocked because customer return records could not be loaded.</p>}
      {!online && <p className="feedback feedback-blocked">Blocked because receiving returned stock requires an online connection.</p>}
      {!permissions.includes('customer_returns.receive') && <p className="empty-state">An authorized stores owner must receive customer goods.</p>}
      <label className="form-label">Find shipment or customer<input className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="form-label">Dispatched shipment line
        <select className="form-input" aria-label="Dispatched shipment line" value={lineId} disabled={busy} onChange={(event) => { setLineId(event.target.value); setMessage(null) }}>
          <option value="">Select shipped item and source lot</option>
          {shipments.map((row) => <option key={row.id} value={row.id}>{row.shipment_number} · {row.customer_name} · {row.sku} · {row.source_lot_code}</option>)}
        </select>
      </label>
      {!shipments.length && !loading && !error && <p className="empty-state">No dispatched shipment lines match this search.</p>}
      {line && <article className="detail-summary" aria-label="Customer return balance">
        <strong>{line.shipment_number} · {line.sales_order_number} · {line.customer_name}</strong>
        <p>{line.sku} · Source lot {line.source_lot_code}</p>
        <p>Shipped {line.shipped_quantity} {line.uom} · Already returned {line.returned_quantity} {line.uom} · Returnable {line.returnable_quantity} {line.uom}</p>
        {!positiveDecimalSchema.safeParse(line.returnable_quantity).success && <p className="feedback feedback-blocked">Blocked because the full shipped quantity has already been returned.</p>}
      </article>}
      <ActionForm title="Receive customer return" disabled={disabled} onSubmit={(form) => { void receive(form) }}>
        <label className="form-label">Customer return number<input className="form-input" name="number" required maxLength={64} /></label>
        <label className="form-label">Returned stock lot code<input className="form-input" name="lot" required maxLength={64} /></label>
        <label className="form-label">Customer return quantity ({line?.uom ?? 'select shipment'})<input className="form-input" aria-label="Customer return quantity" inputMode="decimal" name="quantity" required /></label>
        <label className="form-label">Return receiving location<select className="form-input" name="location" required defaultValue=""><option value="">Select quarantine / receiving location</option>{options.locations.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</select></label>
        <label className="form-label">Customer return reference<input className="form-input" name="reference" required maxLength={160} /></label>
        <label className="form-label">Customer return reason<input className="form-input" name="reason" required maxLength={2000} /></label>
        <p className="empty-state">A fresh final inspection and quality decision are required before returned goods can be used or shipped.</p>
      </ActionForm>
      <h4 className="font-bold">Received customer lots</h4>
      <ul className="record-list" aria-label="Customer return history">
        {data?.receipts.filter((row) => !lineId || row.shipment_line_id === lineId).map((row) => <li className="record-card" key={row.id}>
          <strong>{row.return_number} · {row.lot_code} · {row.qc_status}</strong>
          <p>{row.quantity} {row.uom} · {row.reference} · {plantTimestamp(row.created_at)}</p><p>{row.reason}</p>
          <p className="text-sm text-muted">Open this lot in Quality → Traceability to review its source shipment and disposition.</p>
        </li>)}
      </ul>
    </section>
  )
}
