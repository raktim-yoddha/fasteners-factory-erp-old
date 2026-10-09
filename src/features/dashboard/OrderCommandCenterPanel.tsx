import type { OrderCommandCenterRow } from '@/features/dashboard/useOrderCommandCenter'

type OrderCommandCenterPanelProps = {
  rows: OrderCommandCenterRow[]
  loading: boolean
  error: boolean
}

export function OrderCommandCenterPanel({ rows, loading, error }: OrderCommandCenterPanelProps) {
  return (
    <section className="mt-6 rounded-xl border border-line bg-panel p-5" aria-labelledby="order-command-center-title">
      <h3 className="font-bold" id="order-command-center-title">Order Command Center</h3>
      <p className="mt-2 max-w-prose text-sm leading-6 text-muted">Sales, stock and dispatch remain separate states. This view shows the next confirmed action for each sales order.</p>
      {error ? <p className="mt-4 rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning" role="alert">Order statuses could not be loaded. Check your company permissions and try again.</p> : null}
      {loading ? <p className="mt-4 text-sm text-muted" role="status">Loading order statuses…</p> : null}
      {!loading && !error && rows.length === 0 ? <p className="mt-4 text-sm text-muted">No sales orders are available for this company.</p> : null}
      {!loading && !error && rows.length > 0 ? <div className="mt-4 overflow-x-auto"><table className="min-w-full border-separate border-spacing-0 text-left text-sm"><caption className="sr-only">Independent sales, stock and dispatch states for each sales order.</caption><thead><tr className="text-muted"><th className="border-b border-line px-3 py-2 font-semibold">Sales order</th><th className="border-b border-line px-3 py-2 font-semibold">Sales</th><th className="border-b border-line px-3 py-2 font-semibold">Stock</th><th className="border-b border-line px-3 py-2 font-semibold">Packing / dispatch</th><th className="border-b border-line px-3 py-2 font-semibold">Next action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.sales_order_id}><th className="border-b border-line px-3 py-3 font-semibold" scope="row">{row.sales_order_number}<span className="block pt-1 text-xs font-normal text-muted">PO {row.customer_po_number}</span></th><td className="border-b border-line px-3 py-3">{row.sales_order_status}</td><td className="border-b border-line px-3 py-3">{row.stock_status}{row.active_reservation_count > 0 ? ` (${row.active_reservation_count} active)` : ''}</td><td className="border-b border-line px-3 py-3">{row.packing_dispatch_status}{row.prepared_shipment_count > 0 ? ` (${row.prepared_shipment_count} prepared)` : row.dispatched_shipment_count > 0 ? ` (${row.dispatched_shipment_count} dispatched)` : ''}</td><td className="border-b border-line px-3 py-3">{row.next_action}</td></tr>)}</tbody></table></div> : null}
    </section>
  )
}
