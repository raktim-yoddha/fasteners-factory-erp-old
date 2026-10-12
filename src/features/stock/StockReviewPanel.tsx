import { useState } from 'react'
import type { StockLot } from './useStockLots'
import type {
  MaterialCommand,
  ProcurementRecords,
} from '@/features/procurement/useProcurement'
import { CommandFeedback } from '@/components/CommandFeedback'
import { formatCommandError } from '@/lib/commandError'
import { StockBalanceSummary } from '@/components/StockBalanceSummary'
import type { StockPosition } from './useStockExplorer'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'

type Props = {
  companyId: string | null
  lots: StockLot[]
  positions: StockPosition[]
  items: MasterDataOptions['items']
  counts: ProcurementRecords['counts']
  permissions: string[]
  userId: string
  busy: boolean
  onCommand: (command: MaterialCommand) => Promise<string>
}
export function StockReviewPanel({
  companyId,
  lots,
  positions,
  items,
  counts,
  permissions,
  userId,
  busy,
  onCommand,
}: Props) {
  const [lotId, setLotId] = useState(''),
    [message, setMessage] = useState<string | null>(null)
  const lot = lots.find((entry) => entry.id === lotId)
  const unit = items.find((entry) => entry.id === lot?.item_id)?.base_uom
  async function submit(command: MaterialCommand, success: string) {
    try {
      const id = await onCommand(command)
      setMessage(`${success} Confirmation: ${id}`)
    } catch (cause) {
      setMessage(
        formatCommandError(
          cause,
          'the stock review could not be confirmed. Refresh and retry.',
        ),
      )
    }
  }
  return (
    <section className="record-panel" aria-labelledby="stock-review-title">
      <h3 id="stock-review-title" className="font-bold">
        Quality rejection and stock count review
      </h3>
      <p className="empty-state">
        Counts are proposals. A different authorized reviewer confirms a
        variance; corrections add ledger events.
      </p>
      <label className="form-label">
        Review lot
        <select
          aria-label="Review lot"
          className="form-input"
          value={lotId}
          onChange={(event) => setLotId(event.target.value)}
        >
          <option value="">Select lot</option>
          {lots.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.lot_code} · {entry.qc_status}
            </option>
          ))}
        </select>
      </label>
      <StockBalanceSummary
        position={positions.find((entry) => entry.lot_id === lotId)}
        uom={unit}
      />
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {permissions.includes('quality.release') ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (companyId && lot)
                void submit(
                  {
                    command: 'reject_stock_lot',
                    params: {
                      p_company_id: companyId,
                      p_lot_id: lot.id,
                      p_reason: String(
                        new FormData(event.currentTarget).get('reason') ?? '',
                      ),
                      p_expected_revision: lot.revision,
                    },
                  },
                  'Held lot rejected.',
                )
            }}
          >
            <h4>Reject a QC-held lot</h4>
            <label className="form-label">
              Rejection reason
              <textarea className="form-input py-2" name="reason" required />
            </label>
            <button
              className="secondary-button"
              disabled={busy || lot?.qc_status !== 'hold'}
              type="submit"
            >
              Confirm rejection
            </button>
          </form>
        ) : null}
        {permissions.includes('stock.count') ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              if (companyId && lot)
                void submit(
                  {
                    command: 'propose_stock_count',
                    params: {
                      p_company_id: companyId,
                      p_lot_id: lot.id,
                      p_counted_quantity: String(data.get('quantity') ?? ''),
                      p_reason: String(data.get('reason') ?? ''),
                      p_expected_revision: lot.revision,
                    },
                  },
                  'Stock count proposed; no stock posted.',
                )
            }}
          >
            <h4>Propose physical count</h4>
            <label className="form-label">
              Counted quantity ({unit ?? 'select lot'})
              <input
                className="form-input"
                name="quantity"
                inputMode="decimal"
                required
              />
            </label>
            <label className="form-label">
              Count reason
              <textarea className="form-input py-2" name="reason" required />
            </label>
            <button
              className="secondary-button"
              disabled={busy || !lot}
              type="submit"
            >
              Submit count proposal
            </button>
          </form>
        ) : null}
      </div>
      {counts.length === 0 ? (
        <p className="empty-state">No count proposals.</p>
      ) : (
        <ul className="mt-4 grid gap-3" aria-label="Stock count proposals">
          {counts.map((count) => (
            <li key={count.id} className="master-form">
              <p>
                <strong>
                  {lots.find((entry) => entry.id === count.lot_id)?.lot_code ??
                    'Lot unavailable'}
                </strong>{' '}
                · ◇ {count.status} · Ledger {count.expected_on_hand} · Counted{' '}
                {count.counted_quantity}{' '}
                {items.find(
                  (entry) =>
                    entry.id ===
                    lots.find((candidate) => candidate.id === count.lot_id)
                      ?.item_id,
                )?.base_uom ?? 'unit unavailable'}
              </p>
              <p>{count.reason}</p>
              {permissions.includes('stock.adjust') &&
              ['proposed', 'approved'].includes(count.status) ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (companyId)
                      void submit(
                        {
                          command: 'review_stock_count',
                          params: {
                            p_company_id: companyId,
                            p_proposal_id: count.id,
                            p_reverse: count.status === 'approved',
                            p_reason: String(
                              new FormData(event.currentTarget).get('reason') ??
                                '',
                            ),
                          },
                        },
                        count.status === 'approved'
                          ? 'Count correction reversed.'
                          : 'Count variance approved and posted.',
                      )
                  }}
                >
                  <label className="form-label">
                    Review reason
                    <input className="form-input" name="reason" required />
                  </label>
                  <button
                    className="secondary-button mt-3"
                    disabled={
                      busy ||
                      (count.status === 'proposed' &&
                        count.created_by === userId)
                    }
                    type="submit"
                  >
                    {count.status === 'approved'
                      ? 'Reverse count correction'
                      : 'Approve count variance'}
                  </button>
                  {count.status === 'proposed' &&
                  count.created_by === userId ? (
                    <p className="empty-state">
                      Blocked because a different reviewer must approve your
                      count.
                    </p>
                  ) : null}
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <CommandFeedback message={message} />
    </section>
  )
}
