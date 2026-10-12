import { useState } from 'react'
import type { StockPosition, StockMovement } from './useStockExplorer'
import type { StockLot } from './useStockLots'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import { plantTimestamp } from '@/lib/decimal'
import { StockBalanceSummary } from '@/components/StockBalanceSummary'
import { HistoryPagination } from '@/components/HistoryPagination'
import { LotLabelPanel } from './LotLabelPanel'

type Props = {
  positions: StockPosition[]
  lots: StockLot[]
  options: MasterDataOptions
  selectedLotId: string | null
  movements: StockMovement[]
  loading: boolean
  error: boolean
  movementLoading: boolean
  movementError: boolean
  onSelect: (id: string) => void
  canOlder?: boolean
  canNewer?: boolean
  onOlder?: () => void
  onNewer?: () => void
  onPrintLot?: () => void
}
export function StockExplorerPanel({
  positions,
  lots,
  options,
  selectedLotId,
  movements,
  loading,
  error,
  movementLoading,
  movementError,
  onSelect,
  canOlder=false,
  canNewer=false,
  onOlder=() => undefined,
  onNewer=() => undefined,
  onPrintLot,
}: Props) {
  const [query, setQuery] = useState(''),
    [state, setState] = useState(''),
    [location, setLocation] = useState('')
  const selectedLot=lots.find((row) => row.id===selectedLotId),selectedItem=options.items.find((row) => row.id===selectedLot?.item_id)
  const rows = positions.filter(
    (entry) =>
      (!state || entry.qc_status === state) &&
      (!location || entry.location_id === location) &&
      `${lots.find((lot) => lot.id === entry.lot_id)?.lot_code} ${options.items.find((item) => item.id === entry.item_id)?.sku}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  return (
    <section className="record-panel" aria-labelledby="stock-explorer-title">
      <h3 id="stock-explorer-title" className="font-bold">
        Stock explorer
      </h3>
      <p className="empty-state">
        Physical stock comes from signed ledger events. Reserved excludes
        dispatched quantity. Available-to-promise is zero for QC-held or
        rejected lots.
      </p>
      <div className="filter-bar">
        <label className="form-label">
          Find item or lot
          <input
            className="form-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="form-label">
          Stock state
          <select
            aria-label="Stock state"
            className="form-input"
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="">All states</option>
            <option value="released">Released</option>
            <option value="hold">QC hold</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="form-label">
          Stock location
          <select
            aria-label="Stock location"
            className="form-input"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          >
            <option value="">All locations</option>
            {options.locations.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.code} — {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <p role="status">Loading stock balances…</p>
      ) : error ? (
        <p role="alert">
          Blocked because stock balances could not be loaded. Retry or check
          company access.
        </p>
      ) : rows.length === 0 ? (
        <p className="empty-state">No matching stock lots.</p>
      ) : (
        <ul className="record-list" aria-label="Stock balances">
          {rows.map((entry) => {
            const item = options.items.find(
                (candidate) => candidate.id === entry.item_id,
              ),
              lot = lots.find((candidate) => candidate.id === entry.lot_id)
            return (
              <li key={entry.lot_id}>
                <button
                  className="record-list-button"
                  type="button"
                  aria-pressed={entry.lot_id === selectedLotId}
                  onClick={() => onSelect(entry.lot_id)}
                >
                  <strong>
                    {lot?.lot_code ?? 'Lot unavailable'} ·{' '}
                    {item?.sku ?? 'Item unavailable'}
                  </strong>
                  <span>
                    Location:{' '}
                    {options.locations.find(
                      (candidate) => candidate.id === entry.location_id,
                    )?.code ?? 'unavailable'}
                  </span>
                  <StockBalanceSummary position={entry} uom={item?.base_uom} />
                  <span>
                    ◇ {entry.qc_status}
                    {entry.qc_status !== 'released'
                      ? ` · Blocked because ${entry.qc_status === 'hold' ? 'QC hold' : 'the lot was rejected'}`
                      : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="empty-state">
        WIP is tracked in Production material balances. At-vendor custody is tracked
        in Purchasing → Vendor job-work.
      </p>
      {selectedLotId ? (
        <article className="detail-summary">
          <h4 className="font-bold">
            {lots.find((entry) => entry.id === selectedLotId)?.lot_code} —
            ledger movements
          </h4>
          {movementLoading ? (
            <p role="status">Loading ledger…</p>
          ) : movementError ? (
            <p role="alert">
              Blocked because ledger events could not be loaded.
            </p>
          ) : movements.length === 0 ? (
            <p>No ledger entries available under your permissions.</p>
          ) : (
            <ol aria-label="Stock ledger events">
              {movements.map((entry) => (
                <li key={entry.id}>
                  Event {entry.id} · {plantTimestamp(entry.occurred_at)} · {entry.movement_type} ·{' '}
                  {entry.quantity_delta} {entry.uom} · Source{' '}
                  {entry.source_type}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </li>
              ))}
            </ol>
          )}
          <p className="text-sm text-muted">
            Up to 100 events per page; ledger rows are immutable.
          </p>
          <HistoryPagination label="Stock ledger pages" loading={movementLoading || movementError} canOlder={canOlder} canNewer={canNewer} onOlder={onOlder} onNewer={onNewer} />
          {onPrintLot && selectedLot && selectedItem && <LotLabelPanel code={selectedLot.lot_code} sku={selectedItem.sku} uom={selectedItem.base_uom} onPrint={onPrintLot} />}
        </article>
      ) : null}
    </section>
  )
}
