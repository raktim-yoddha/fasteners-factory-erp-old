import type { StockPosition } from '@/features/stock/useStockExplorer'

export function StockBalanceSummary({
  position,
  uom,
}: {
  position: StockPosition | undefined
  uom: string | undefined
}) {
  if (!position)
    return (
      <span className="block text-sm text-muted">
        Select a lot with loaded balances to review stock.
      </span>
    )
  const unit = uom ?? 'unit unavailable'
  return (
    <span className="block text-sm text-muted">
      <span className="block">
        Physical {position.on_hand} {unit} · Reserved {position.reserved} {unit}
      </span>
      <span className="block">
        QC hold {position.qc_status === 'hold' ? position.on_hand : '0'} {unit}{' '}
        · Available {position.available_to_promise} {unit}
      </span>
    </span>
  )
}
