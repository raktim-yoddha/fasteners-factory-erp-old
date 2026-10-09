import { useState } from 'react'
import type { CommercialRecords } from '@/features/sales/useCommercialWorkflow'
import type { DispatchRecords, DispatchShipmentInput, PrepareShipmentInput } from '@/features/dispatch/useDispatchWorkflow'
import { formatCommandError } from '@/lib/commandError'

type DispatchPanelProps = { companyId: string | null; commercial: CommercialRecords; dispatchRecords: DispatchRecords; busy: boolean; onPrepare: (input: PrepareShipmentInput) => Promise<void>; onDispatch: (input: DispatchShipmentInput) => Promise<void> }

export function DispatchPanel({ companyId, commercial, dispatchRecords, busy, onPrepare, onDispatch }: DispatchPanelProps) {
  const [salesOrderId, setSalesOrderId] = useState('')
  const [reservationId, setReservationId] = useState('')
  const [packingNumber, setPackingNumber] = useState('')
  const [shipmentNumber, setShipmentNumber] = useState('')
  const [quantity, setQuantity] = useState('')
  const [shipmentId, setShipmentId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const openOrders = commercial.salesOrders.filter((order) => ['open', 'partially_shipped'].includes(order.status))
  const selectedOrder = openOrders.find((order) => order.id === salesOrderId)
  const selectedLineIds = new Set(commercial.salesOrderLines.filter((line) => line.sales_order_id === salesOrderId).map((line) => line.id))
  const usableReservations = dispatchRecords.reservations.filter((reservation) => selectedLineIds.has(reservation.sales_order_line_id) && reservation.quantity > reservation.consumed_quantity)
  const draftShipments = dispatchRecords.shipments.filter((shipment) => shipment.status === 'draft')
  async function submit(action: () => Promise<void>, success: string) { try { await action(); setMessage(success) } catch (error) { setMessage(formatCommandError(error, 'the server rejected this dispatch action. Check the selected record and try again.')) } }

  return <section className="mt-6 rounded-xl border border-line bg-panel p-5" aria-labelledby="dispatch-title">
    <h3 className="font-bold" id="dispatch-title">Packing and dispatch</h3>
    <p className="mt-1 text-sm leading-6 text-muted">Prepare one packed shipment from an active reservation, then gate it out through the server-validated dispatch command.</p>
    <div className="mt-5 grid gap-6 xl:grid-cols-2">
      <form className="master-form" onSubmit={(event) => { event.preventDefault(); if (companyId && selectedOrder && reservationId) void submit(() => onPrepare({ companyId, salesOrderId, packingNumber, shipmentNumber, reservationId, quantity, expectedSalesOrderRevision: selectedOrder.revision, idempotencyKey: crypto.randomUUID() }), 'Packed shipment prepared for dispatch.') }}>
        <h4>1. Prepare packed shipment</h4><label className="form-label">Sales order<select className="form-input" required value={salesOrderId} onChange={(event) => { setSalesOrderId(event.target.value); setReservationId('') }}><option value="">Select open sales order</option>{openOrders.map((order) => <option key={order.id} value={order.id}>{order.sales_order_number} — {order.status}</option>)}</select></label><label className="form-label">Active reservation<select className="form-input" required value={reservationId} onChange={(event) => setReservationId(event.target.value)}><option value="">Select active reservation</option>{usableReservations.map((reservation) => <option key={reservation.id} value={reservation.id}>Reserved {reservation.quantity - reservation.consumed_quantity}</option>)}</select></label><label className="form-label">Packing number<input className="form-input" required value={packingNumber} onChange={(event) => setPackingNumber(event.target.value)} /></label><label className="form-label">Shipment number<input className="form-input" required value={shipmentNumber} onChange={(event) => setShipmentNumber(event.target.value)} /></label><label className="form-label">Packed quantity<input className="form-input" required inputMode="decimal" min="0.000001" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><button className="secondary-button" disabled={!companyId || !selectedOrder || !reservationId || busy} type="submit">Prepare shipment</button>
      </form>
      <form className="master-form" onSubmit={(event) => { event.preventDefault(); const shipment = draftShipments.find((candidate) => candidate.id === shipmentId); if (companyId && shipment) void submit(() => onDispatch({ companyId, shipmentId, expectedShipmentRevision: shipment.revision, idempotencyKey: crypto.randomUUID() }), 'Shipment dispatched and stock ledger posted.') }}>
        <h4>2. Dispatch shipment</h4><label className="form-label">Prepared shipment<select className="form-input" required value={shipmentId} onChange={(event) => setShipmentId(event.target.value)}><option value="">Select prepared shipment</option>{draftShipments.map((shipment) => <option key={shipment.id} value={shipment.id}>{shipment.shipment_number}</option>)}</select></label><button className="primary-button" disabled={!companyId || !shipmentId || busy} type="submit">Dispatch shipment</button>
      </form>
    </div>
    {message ? <p className={message.startsWith('Blocked because') ? 'mt-4 rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning' : 'mt-4 rounded-lg border border-line bg-canvas p-3 text-sm'} role={message.startsWith('Blocked because') ? 'alert' : 'status'}>{message}</p> : null}
  </section>
}
