import { useState } from 'react'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import type { StockLot } from '@/features/stock/useStockLots'
import type {
  StockReceiptInput,
  StockReleaseInput,
  StockUnreservationInput,
  StockReservation,
} from '@/features/stock/useStockCommands'
import type { StockReservationInput } from '@/features/stock/useStockCommands'
import type { CommercialRecords } from '@/features/sales/useCommercialWorkflow'
import { formatCommandError } from '@/lib/commandError'
import { CommandFeedback } from '@/components/CommandFeedback'
import { StockBalanceSummary } from '@/components/StockBalanceSummary'
import type { StockPosition } from './useStockExplorer'

type StockActionsPanelProps = {
  permissions?: string[]
  positions?: StockPosition[]
  companyId: string | null
  options: MasterDataOptions
  lots: StockLot[]
  records: CommercialRecords
  receiving: boolean
  releasing: boolean
  reserving: boolean
  reservations?: StockReservation[]
  unreserving?: boolean
  online?: boolean
  onReceive: (input: StockReceiptInput) => Promise<void>
  onRelease: (input: StockReleaseInput) => Promise<void>
  onReserve: (input: StockReservationInput) => Promise<void>
  onUnreserve?: (input: StockUnreservationInput) => Promise<string>
}

export function StockActionsPanel({
  companyId,
  options,
  lots,
  records,
  receiving,
  releasing,
  reserving,
  reservations = [],
  unreserving = false,
  online = true,
  permissions,
  positions = [],
  onReceive,
  onRelease,
  onReserve,
  onUnreserve,
}: StockActionsPanelProps) {
  const [itemId, setItemId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [lotCode, setLotCode] = useState('')
  const [quantity, setQuantity] = useState('')
  const [uom, setUom] = useState<StockReceiptInput['uom']>('pcs')
  const [lotId, setLotId] = useState('')
  const [salesOrderLineId, setSalesOrderLineId] = useState('')
  const [reserveLotId, setReserveLotId] = useState('')
  const [reserveQuantity, setReserveQuantity] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [reservationId, setReservationId] = useState('')
  const [unreserveReason, setUnreserveReason] = useState('')
  const selectedReservation = reservations.find(
    (row) => row.id === reservationId,
  )
  const unreserveLine = records.salesOrderLines.find(
    (row) => row.id === selectedReservation?.sales_order_line_id,
  )
  const unreserveOrder = records.salesOrders.find(
    (row) => row.id === unreserveLine?.sales_order_id,
  )
  const unreserveLot = lots.find(
    (row) => row.id === selectedReservation?.lot_id,
  )
  const heldLots = lots.filter((lot) => lot.qc_status === 'hold')
  const openOrders = records.salesOrders.filter((order) =>
    ['open', 'partially_shipped'].includes(order.status),
  )
  const reservableLines = records.salesOrderLines.filter((line) =>
    openOrders.some((order) => order.id === line.sales_order_id),
  )
  const selectedLine = reservableLines.find(
    (line) => line.id === salesOrderLineId,
  )
  const selectedOrder = selectedLine
    ? openOrders.find((order) => order.id === selectedLine.sales_order_id)
    : undefined
  const releasableLots = selectedLine
    ? lots.filter(
        (lot) =>
          lot.qc_status === 'released' && lot.item_id === selectedLine.item_id,
      )
    : []
  const selectedPosition = positions.find(
    (position) => position.lot_id === reserveLotId,
  )
  const offlineMessage =
    'Blocked because this device is offline. Stock changes require a server confirmation.'
  const receive = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!online) {
      setMessage(offlineMessage)
      return
    }
    if (!companyId) return
    try {
      await onReceive({
        companyId,
        itemId,
        locationId,
        lotCode,
        quantity,
        uom,
        idempotencyKey: crypto.randomUUID(),
      })
      setMessage('Receipt recorded in QC hold.')
    } catch (error) {
      setMessage(
        formatCommandError(
          error,
          'the receipt could not be recorded. Check the item, location and unit.',
        ),
      )
    }
  }
  const release = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!online) {
      setMessage(offlineMessage)
      return
    }
    if (!companyId) return
    const lot = heldLots.find((candidate) => candidate.id === lotId)
    if (!lot) return
    try {
      await onRelease({
        companyId,
        lotId,
        expectedRevision: lot.revision,
        idempotencyKey: crypto.randomUUID(),
      })
      setMessage('Lot released for reservation.')
    } catch (error) {
      setMessage(
        formatCommandError(
          error,
          'the lot could not be released. Refresh and try again.',
        ),
      )
    }
  }
  const reserve = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!online) {
      setMessage(offlineMessage)
      return
    }
    if (!companyId || !selectedOrder || !salesOrderLineId || !reserveLotId)
      return
    try {
      await onReserve({
        companyId,
        salesOrderLineId,
        lotId: reserveLotId,
        quantity: reserveQuantity,
        expectedSalesOrderRevision: selectedOrder.revision,
        idempotencyKey: crypto.randomUUID(),
      })
      setMessage('Released stock reserved against the sales order.')
    } catch (error) {
      setMessage(
        formatCommandError(
          error,
          'the stock could not be reserved. Refresh and try again.',
        ),
      )
    }
  }
  const unreserve = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!online) {
      setMessage(offlineMessage)
      return
    }
    if (
      !companyId ||
      !selectedReservation ||
      !unreserveOrder ||
      !onUnreserve ||
      unreserving ||
      !permissions?.includes('stock.reserve')
    )
      return
    setMessage(null)
    try {
      const result = await onUnreserve({
        companyId,
        reservationId: selectedReservation.id,
        reason: unreserveReason,
        expectedSalesOrderRevision: unreserveOrder.revision,
        idempotencyKey: crypto.randomUUID(),
      })
      setMessage(
        `Reservation released. Shipped quantity stays recorded. Confirmation: ${result}`,
      )
      setReservationId('')
      setUnreserveReason('')
    } catch (error) {
      setMessage(
        formatCommandError(
          error,
          'the reservation could not be released. Cancel any prepared packing allocation, refresh and retry.',
        ),
      )
    }
  }
  return (
    <section
      className="mt-6 rounded-xl border border-line bg-panel p-5"
      aria-labelledby="stock-actions-title"
    >
      <h3 id="stock-actions-title" className="font-bold">
        Stock receipt, QC release and reservation
      </h3>
      {!online ? (
        <p
          className="mt-4 rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning"
          role="alert"
        >
          {offlineMessage}
        </p>
      ) : null}
      <div className="mt-5 grid gap-6 xl:grid-cols-3">
        <form className="master-form" onSubmit={receive}>
          <h4>Receive finished goods</h4>
          <label className="form-label">
            Item
            <select
              aria-label="Item"
              className="form-input"
              required
              value={itemId}
              onChange={(event) => {
                const selected = options.items.find(
                  (item) => item.id === event.target.value,
                )
                setItemId(event.target.value)
                if (selected) setUom(selected.base_uom)
              }}
            >
              <option value="">Select item</option>
              {options.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} — {item.description}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Location
            <select
              aria-label="Location"
              className="form-input"
              required
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">Select location</option>
              {options.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} — {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Lot code
            <input
              className="form-input"
              required
              value={lotCode}
              onChange={(event) => setLotCode(event.target.value)}
            />
          </label>
          <label className="form-label">
            Quantity
            <input
              className="form-input"
              required
              inputMode="decimal"
              min="0.000001"
              step="any"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            disabled={
              !online || !companyId || !itemId || !locationId || receiving
            }
            type="submit"
          >
            Record receipt
          </button>
        </form>
        <form className="master-form" onSubmit={release}>
          <h4>Release held lot</h4>
          <label className="form-label">
            QC-held lot
            <select
              aria-label="QC-held lot"
              className="form-input"
              required
              value={lotId}
              onChange={(event) => setLotId(event.target.value)}
            >
              <option value="">Select held lot</option>
              {heldLots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.lot_code}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={
              !online ||
              !companyId ||
              !lotId ||
              releasing ||
              Boolean(permissions && !permissions.includes('quality.release'))
            }
            type="submit"
          >
            Release for reservation
          </button>
        </form>
        <form className="master-form" onSubmit={reserve}>
          <h4>Reserve released lot</h4>
          <label className="form-label">
            Sales-order line
            <select
              aria-label="Sales-order line"
              className="form-input"
              required
              value={salesOrderLineId}
              onChange={(event) => {
                setSalesOrderLineId(event.target.value)
                setReserveLotId('')
              }}
            >
              <option value="">Select sales-order line</option>
              {reservableLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {
                    openOrders.find((order) => order.id === line.sales_order_id)
                      ?.sales_order_number
                  }{' '}
                  — {line.ordered_quantity} {line.uom}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Released lot
            <select
              aria-label="Released lot"
              className="form-input"
              required
              value={reserveLotId}
              onChange={(event) => setReserveLotId(event.target.value)}
            >
              <option value="">Select matching released lot</option>
              {releasableLots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.lot_code}
                </option>
              ))}
            </select>
          </label>
          <StockBalanceSummary
            position={selectedPosition}
            uom={selectedLine?.uom}
          />
          <label className="form-label">
            Quantity
            <input
              className="form-input"
              required
              inputMode="decimal"
              min="0.000001"
              step="any"
              type="number"
              value={reserveQuantity}
              onChange={(event) => setReserveQuantity(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            disabled={
              !online ||
              !companyId ||
              !selectedOrder ||
              !reserveLotId ||
              reserving ||
              Boolean(permissions && !permissions.includes('stock.reserve'))
            }
            type="submit"
          >
            Reserve stock
          </button>
        </form>
      </div>
      <form className="master-form mt-5" onSubmit={unreserve}>
        <h4>Release reservation</h4>
        <p className="empty-state">
          Release the unshipped allocation so held goods can follow approved NCR
          disposition or stock can be reassigned. Already shipped quantity stays
          recorded. Cancel prepared packing before releasing its allocation.
        </p>
        {!reservations.length && (
          <p role="status">
            No active reservations are available under your company access.
          </p>
        )}
        <label className="form-label">
          Reservation to release
          <select
            className="form-input"
            aria-label="Reservation to release"
            required
            value={reservationId}
            onChange={(event) => setReservationId(event.target.value)}
          >
            <option value="">Select active reservation</option>
            {reservations.map((row) => {
              const line = records.salesOrderLines.find(
                (entry) => entry.id === row.sales_order_line_id,
              )
              const order = records.salesOrders.find(
                (entry) => entry.id === line?.sales_order_id,
              )
              return (
                <option key={row.id} value={row.id}>
                  {order?.sales_order_number ?? 'Order unavailable'} ·{' '}
                  {lots.find((entry) => entry.id === row.lot_id)?.lot_code ??
                    row.lot_id}{' '}
                  · {row.remaining_quantity} {line?.uom ?? 'unit unavailable'}
                </option>
              )
            })}
          </select>
        </label>
        {selectedReservation && (
          <>
            <p>
              Originally reserved {selectedReservation.quantity}{' '}
              {unreserveLine?.uom}; shipped{' '}
              {selectedReservation.consumed_quantity} {unreserveLine?.uom};
              remaining allocation {selectedReservation.remaining_quantity}{' '}
              {unreserveLine?.uom}.
            </p>
            <StockBalanceSummary
              position={positions.find(
                (position) => position.lot_id === unreserveLot?.id,
              )}
              uom={unreserveLine?.uom}
            />
          </>
        )}
        <label className="form-label">
          Reservation release reason
          <input
            className="form-input"
            aria-label="Reservation release reason"
            required
            maxLength={2000}
            value={unreserveReason}
            onChange={(event) => setUnreserveReason(event.target.value)}
          />
        </label>
        <button
          className="secondary-button"
          type="submit"
          disabled={
            !online ||
            !companyId ||
            !selectedReservation ||
            !unreserveOrder ||
            !unreserveReason.trim() ||
            !onUnreserve ||
            unreserving ||
            !permissions?.includes('stock.reserve')
          }
        >
          Release reservation
        </button>
      </form>
      <CommandFeedback message={message} />
    </section>
  )
}
