import { useState } from 'react'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import type { StockLot } from '@/features/stock/useStockLots'
import type { CommercialRecords } from '@/features/sales/useCommercialWorkflow'
import type { MaterialCommand, ProcurementRecords } from './useProcurement'
import { plantDate } from '@/lib/decimal'
import { formatCommandError } from '@/lib/commandError'
import { CommandFeedback } from '@/components/CommandFeedback'
import { StockBalanceSummary } from '@/components/StockBalanceSummary'
import type { StockPosition } from '@/features/stock/useStockExplorer'
import type { UnitConversion } from '@/features/master-data/useItemControls'
import { UnitConversionSelect } from '@/components/UnitConversionSelect'

type Props = {
  companyId: string | null
  options: MasterDataOptions
  records: ProcurementRecords
  commercial: CommercialRecords
  lots: StockLot[]
  positions?: StockPosition[]
  conversions?: UnitConversion[]
  permissions: string[]
  busy: boolean
  loading: boolean
  refreshing?: boolean
  error: boolean
  onCommand: (command: MaterialCommand) => Promise<string>
}
const field = (form: HTMLFormElement, name: string) =>
  String(new FormData(form).get(name) ?? '').trim()

export function ProcurementPanel({
  companyId,
  options,
  records,
  commercial,
  lots,
  positions = [],
  conversions = [],
  permissions,
  busy,
  loading,
  refreshing = false,
  error,
  onCommand,
}: Props) {
  const [step, setStep] = useState('request'),
    [itemId, setItemId] = useState(''),
    [requestId, setRequestId] = useState(''),
    [supplierId, setSupplierId] = useState(''),
    [orderId, setOrderId] = useState(''),
    [receiptId, setReceiptId] = useState(''),
    [message, setMessage] = useState<string | null>(null)
  const [conversionId, setConversionId] = useState('')
  const conversion = conversions.find((row) => row.id === conversionId)
  const item = options.items.find((entry) => entry.id === itemId),
    request = records.requisitions.find((entry) => entry.id === requestId),
    order = records.orders.find((entry) => entry.id === orderId),
    receipt = records.receipts.find((entry) => entry.id === receiptId),
    lot = lots.find((entry) => entry.id === receipt?.lot_id)
  const supplier = records.suppliers.find((entry) => entry.id === supplierId)
  const permission =
    step === 'approve'
      ? 'purchase.approve'
      : step === 'receive'
        ? 'stock.receive'
        : step === 'return'
          ? 'stock.return'
          : 'purchase.manage'
  async function submit(command: MaterialCommand, success: string) {
    try {
      const id = await onCommand(command)
      setMessage(`${success} Confirmation: ${id}`)
    } catch (cause) {
      setMessage(
        formatCommandError(
          cause,
          'the purchase action could not be confirmed. Refresh and retry.',
        ),
      )
    }
  }
  if (loading)
    return (
      <section className="record-panel" role="status">
        Loading purchase records…
      </section>
    )
  if (error)
    return (
      <section className="record-panel" role="alert">
        Blocked because purchase records could not be loaded. Check company
        access and retry.
      </section>
    )
  return (
    <section className="record-panel" aria-labelledby="purchase-title">
      <h3 id="purchase-title" className="font-bold">
        Material purchasing
      </h3>
      {refreshing && <p role="status" className="empty-state">Refreshing server-confirmed purchasing balances…</p>}
      <p className="empty-state">
        Request demand, approve a purchase order, then receive each delivery
        into its own QC-held lot. Stock stays in the item's base unit; alternate receipts use an explicitly selected approved basis.
      </p>
      <div className="workflow-switch" aria-label="Purchasing steps">
        {[
          ['request', 'Request material'],
          ['order', 'Draft PO'],
          ['approve', 'Approve PO'],
          ['receive', 'Receive delivery'],
          ['return', 'Supplier return'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={step === key ? 'nav-item nav-item-active' : 'nav-item'}
            type="button"
            aria-pressed={step === key}
            onClick={() => {
              setStep(key!)
              setMessage(null)
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {!permissions.includes(permission) ? (
        <p role="status" className="empty-state">
          Read-only: your role cannot confirm this step. Ask an authorized{' '}
          {step === 'approve' ? 'purchase approver' : 'operator'}.
        </p>
      ) : null}
      <fieldset
        className="min-w-0 border-0 p-0"
        disabled={!companyId || busy || !permissions.includes(permission)}
      >
        {step === 'request' ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (companyId && item)
                void submit(
                  {
                    command: 'request_material',
                    params: {
                      p_company_id: companyId,
                      p_number: field(event.currentTarget, 'number'),
                      p_item_id: item.id,
                      p_quantity: field(event.currentTarget, 'quantity'),
                      p_uom: item.base_uom,
                      p_demand_source: field(event.currentTarget, 'source'),
                      p_needed_by: field(event.currentTarget, 'date'),
                      p_sales_order_line_id:
                        field(event.currentTarget, 'demand') || null,
                    },
                  },
                  'Material requested.',
                )
            }}
          >
            <h4>Purchase requisition</h4>
            <label className="form-label">
              Requisition number
              <input className="form-input" name="number" required />
            </label>
            <label className="form-label">
              Material item
              <select
                aria-label="Material item"
                className="form-input"
                required
                value={itemId}
                onChange={(event) => setItemId(event.target.value)}
              >
                <option value="">Select item</option>
                {options.items.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.sku} — {entry.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Required quantity ({item?.base_uom ?? 'select item'})
              <input
                className="form-input"
                name="quantity"
                required
                inputMode="decimal"
              />
            </label>
            <label className="form-label">
              Demand reason
              <input
                className="form-input"
                name="source"
                required
                maxLength={500}
                placeholder="Recorded shortage or approved replenishment reason"
              />
            </label>
            <label className="form-label">
              Sales demand (optional)
              <select
                aria-label="Sales demand (optional)"
                className="form-input"
                name="demand"
              >
                <option value="">No sales-line link</option>
                {commercial.salesOrderLines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {
                      commercial.salesOrders.find(
                        (entry) => entry.id === line.sales_order_id,
                      )?.sales_order_number
                    }{' '}
                    · {line.ordered_quantity} {line.uom}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Needed by
              <input
                className="form-input"
                name="date"
                required
                type="date"
                defaultValue={plantDate()}
              />
            </label>
            <button className="primary-button" disabled={!item} type="submit">
              Submit requisition
            </button>
          </form>
        ) : null}
        {step === 'order' ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (companyId && request)
                void submit(
                  {
                    command: 'create_purchase_order',
                    params: {
                      p_company_id: companyId,
                      p_requisition_id: request.id,
                      p_supplier_id: supplierId,
                      p_number: field(event.currentTarget, 'number'),
                      p_unit_price: field(event.currentTarget, 'price'),
                      p_currency: field(event.currentTarget, 'currency'),
                      p_promised_date: field(event.currentTarget, 'date'),
                      p_expected_revision: request.revision,
                      p_quantity: field(event.currentTarget, 'orderQuantity') || undefined,
                    },
                  },
                  'Purchase order drafted.',
                )
            }}
          >
            <h4>Draft purchase order</h4>
            <label className="form-label">
              Requested material
              <select
                aria-label="Requested material"
                className="form-input"
                required
                value={requestId}
                onChange={(event) => setRequestId(event.target.value)}
              >
                <option value="">Select requisition</option>
                {records.requisitions
                  .filter((entry) => entry.status === 'requested')
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.requisition_number} · {entry.quantity} {entry.uom}
                    </option>
                  ))}
              </select>
            </label>
            {request ? (
              <p>
                {request.demand_source} · Needed {request.needed_by}
                {' '}· Allocated {request.allocated_quantity ?? '0'} {request.uom} · Remaining {request.remaining_quantity ?? request.quantity} {request.uom}
              </p>
            ) : (
              <p className="empty-state">
                A requisition is required before a purchase order.
              </p>
            )}
            <label className="form-label">
              Purchase supplier
              <select
                aria-label="Purchase supplier"
                className="form-input"
                required
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Select supplier</option>
                {records.suppliers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.code} — {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Purchase order number
              <input className="form-input" name="number" required />
            </label>
            <label className="form-label">PO quantity ({request?.uom ?? 'select requisition'})<input className="form-input" name="orderQuantity" inputMode="decimal" placeholder={request?.remaining_quantity ?? request?.quantity} /></label>
            <p className="empty-state">Enter this supplier's share, or leave blank to order the remaining demand. Draft POs already allocate demand; the server rejects over-ordering.</p>
            <label className="form-label">
              Purchase unit price
              <input
                className="form-input"
                name="price"
                required
                inputMode="decimal"
              />
            </label>
            <label className="form-label">
              Purchase currency
              <input
                className="form-input"
                name="currency"
                required
                defaultValue="INR"
                pattern="[A-Z]{3}"
              />
            </label>
            <label className="form-label">
              Supplier promised date
              <input
                className="form-input"
                name="date"
                required
                type="date"
                defaultValue={plantDate()}
              />
            </label>
            <button
              className="primary-button"
              disabled={!request || !supplier}
              type="submit"
            >
              Create draft PO
            </button>
          </form>
        ) : null}
        {step === 'approve' || step === 'receive' ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (!companyId || !order) return
              if (step === 'approve')
                void submit(
                  {
                    command: 'approve_purchase_order',
                    params: {
                      p_company_id: companyId,
                      p_order_id: order.id,
                      p_expected_revision: order.revision,
                    },
                  },
                  'Purchase order approved.',
                )
              else
                void submit(
                  {
                    command: 'receive_purchase_order',
                    params: {
                      p_company_id: companyId,
                      p_order_id: order.id,
                      p_number: field(event.currentTarget, 'number'),
                      p_lot_code: field(event.currentTarget, 'lot'),
                      p_supplier_lot: field(event.currentTarget, 'supplierLot'),
                      p_certificate_reference: field(
                        event.currentTarget,
                        'certificate',
                      ),
                      p_location_id: field(event.currentTarget, 'location'),
                      p_quantity: field(event.currentTarget, 'quantity'),
                      p_uom: conversion?.from_uom ?? order.uom,
                      p_conversion_id: conversionId || undefined,
                      p_expected_revision: order.revision,
                    },
                  },
                  'Delivery received in QC hold.',
                )
            }}
          >
            <h4>
              {step === 'approve' ? 'Approve purchase order' : 'Goods receipt'}
            </h4>
            <label className="form-label">
              Purchase order
              <select
                aria-label="Purchase order"
                className="form-input"
                required
                value={orderId}
                onChange={(event) => { setOrderId(event.target.value); setConversionId('') }}
              >
                <option value="">
                  Select {step === 'approve' ? 'draft' : 'approved'} order
                </option>
                {records.orders
                  .filter((entry) =>
                    step === 'approve'
                      ? entry.status === 'draft'
                      : ['approved', 'partially_received'].includes(
                          entry.status,
                        ),
                  )
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.purchase_order_number} · {entry.status}
                    </option>
                  ))}
              </select>
            </label>
            {order ? (
              <p>
                Ordered {order.quantity} {order.uom} · Net received{' '}
                {order.received_quantity ?? 'loading'} {order.uom} · Outstanding{' '}
                {order.outstanding_quantity ?? 'loading'} {order.uom} · Unit
                price {order.unit_price} {order.currency_code} · Promised{' '}
                {order.promised_date} ·{' '}
                {
                  records.suppliers.find(
                    (entry) => entry.id === order.supplier_id,
                  )?.name
                }
              </p>
            ) : (
              <p className="empty-state">
                Select an order to review its exact quantity, unit, supplier and
                price.
              </p>
            )}
            {step === 'receive' ? (
              <>
                <p className="empty-state">
                  Partial receipts are supported. The server rejects quantities
                  beyond outstanding demand; every delivery needs a new lot.
                </p>
                <label className="form-label">
                  Receipt number
                  <input className="form-input" name="number" required />
                </label>
                <label className="form-label">
                  Internal lot code
                  <input className="form-input" name="lot" required />
                </label>
                <label className="form-label">
                  Supplier lot / heat reference
                  <input
                    className="form-input"
                    name="supplierLot"
                    required
                    maxLength={160}
                  />
                </label>
                <label className="form-label">
                  Certificate reference (if provided)
                  <input
                    className="form-input"
                    name="certificate"
                    maxLength={1000}
                  />
                </label>
                <label className="form-label">
                  Receiving location
                  <select
                    aria-label="Receiving location"
                    className="form-input"
                    name="location"
                    required
                  >
                    <option value="">Select location</option>
                    {options.locations.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.code} — {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-label">
                  Received quantity ({conversion?.from_uom ?? order?.uom ?? 'select order'})
                  <input
                    className="form-input"
                    name="quantity"
                    required
                    inputMode="decimal"
                  />
                </label>
                <UnitConversionSelect label="Receipt quantity unit" conversions={conversions} itemId={order?.item_id} baseUnit={order?.uom} value={conversionId} onChange={setConversionId} />
              </>
            ) : null}
            <button
              className="primary-button"
              disabled={
                !order || Boolean(conversionId && (!conversion || conversion.status !== 'approved' || conversion.item_id !== order.item_id)) ||
                (step === 'approve'
                  ? order.status !== 'draft'
                  : !['approved', 'partially_received'].includes(order.status))
              }
              type="submit"
            >
              {step === 'approve'
                ? 'Confirm PO approval'
                : 'Confirm goods receipt'}
            </button>
          </form>
        ) : null}
        {step === 'return' ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (companyId && receipt && lot)
                void submit(
                  {
                    command: 'return_goods_receipt',
                    params: {
                      p_company_id: companyId,
                      p_receipt_id: receipt.id,
                      p_quantity: field(event.currentTarget, 'quantity'),
                      p_reason: field(event.currentTarget, 'reason'),
                      p_expected_lot_revision: lot.revision,
                    },
                  },
                  'Supplier return posted as a reversal.',
                )
            }}
          >
            <h4>Return received goods</h4>
            <StockBalanceSummary
              position={positions.find(
                (entry) => entry.lot_id === receipt?.lot_id,
              )}
              uom={receipt?.uom}
            />
            <label className="form-label">
              Goods receipt
              <select
                aria-label="Goods receipt"
                className="form-input"
                required
                value={receiptId}
                onChange={(event) => setReceiptId(event.target.value)}
              >
                <option value="">Select receipt</option>
                {records.receipts.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.receipt_number} · {entry.supplier_lot}
                  </option>
                ))}
              </select>
            </label>
            {receipt ? (
              <p>
                Original receipt {receipt.quantity} {receipt.uom} · Certificate{' '}
                {receipt.certificate_reference ?? 'not supplied'} · Lot{' '}
                {lot?.lot_code ?? 'unavailable'}
              </p>
            ) : null}
            <label className="form-label">
              Return quantity ({receipt?.uom ?? 'select receipt'})
              <input
                className="form-input"
                name="quantity"
                required
                inputMode="decimal"
              />
            </label>
            <label className="form-label">
              Return reason
              <textarea
                className="form-input py-2"
                name="reason"
                required
                maxLength={2000}
              />
            </label>
            <p className="empty-state">
              The server preserves reserved stock. A return adds a signed
              reversal event; it never erases the receipt.
            </p>
            <button
              className="primary-button"
              disabled={!receipt || !lot}
              type="submit"
            >
              Confirm supplier return
            </button>
          </form>
        ) : null}
      </fieldset>
      <CommandFeedback message={message} />
      <div className="detail-summary">
        <h4 className="font-bold">Open commitments and delivery history</h4>
        {records.orders.length === 0 ? (
          <p>No purchase orders yet.</p>
        ) : (
          <ul>
            {records.orders.map((entry) => (
              <li key={entry.id}>
                {entry.purchase_order_number} — {entry.quantity} {entry.uom} · ◇{' '}
                {entry.status.replaceAll('_', ' ')} · Promised{' '}
                {entry.promised_date}
              </li>
            ))}
          </ul>
        )}
        <h4 className="font-bold">Supplier evidence</h4>
        {supplier ? (
          <>
            <p>
              {supplier.code} — {supplier.name}
            </p>
            <p>
              Qualification:{' '}
              {supplier.qualification_note ??
                'Not assessed; no qualification decision recorded.'}
            </p>
            <p>
              Certificate requirements:{' '}
              {supplier.certificate_requirements ?? 'Not verified.'}
            </p>
          </>
        ) : (
          <p>Select a supplier in Draft PO to see its recorded requirements.</p>
        )}
        <ul>
          {records.receipts.map((entry) => (
            <li key={entry.id}>
              {entry.receipt_number} — {entry.quantity} {entry.uom} · Supplier
              lot {entry.supplier_lot} · Certificate{' '}
              {entry.certificate_reference ?? 'not supplied'}
              {entry.input_quantity && ` · Recorded ${entry.input_quantity} ${entry.input_uom} using approved conversion`}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
