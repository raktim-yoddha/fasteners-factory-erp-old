import { useState } from 'react'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import type { StockLot } from './useStockLots'
import type { StockPosition } from './useStockExplorer'
import { positiveDecimalSchema } from '@/lib/decimal'
import { formatCommandError } from '@/lib/commandError'
import { ActionForm } from '@/components/ActionForm'
import { CommandFeedback } from '@/components/CommandFeedback'
import { StockBalanceSummary } from '@/components/StockBalanceSummary'
import type { LotTransformation } from './useLotTransformations'

type Props = {
  companyId: string | null; lots: StockLot[]; positions: StockPosition[]; options: MasterDataOptions
  permissions: string[]; online: boolean; busy: boolean; loading: boolean; error: boolean
  onTransform: (input: LotTransformation) => Promise<string>
}
type Source = { lot_id: string; revision: number; quantity: string }
export function LotTransformPanel({ companyId, lots, positions, options, permissions, online, busy, loading, error, onTransform }: Props) {
  const [kind, setKind] = useState<'split' | 'merge'>('split')
  const [sources, setSources] = useState<Source[]>([])
  const [lotId, setLotId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const selected = lots.find((lot) => lot.id === lotId)
  const item = options.items.find((row) => row.id === (sources.length ? lots.find((lot) => lot.id === sources[0]?.lot_id)?.item_id : selected?.item_id))
  const blocked = !companyId || !online || busy || loading || error || !permissions.includes('stock.transform')
  const staleSource = sources.some((source) => {
    const current = lots.find((lot) => lot.id === source.lot_id)
    return !current || current.revision !== source.revision || current.qc_status !== 'released'
  })
  return <section className="record-panel" aria-labelledby="lot-transform-title">
    <h3 id="lot-transform-title" className="font-bold">Split or merge lots</h3>
    <p className="empty-state">Move released, unreserved quantities into a new QC-held lot. Source balances and history stay recorded. Merge requires matching item, unit, engineering revisions and order allocation.</p>
    <CommandFeedback message={message} />
    {error && <p role="alert" className="feedback feedback-blocked">Blocked because stock records could not be loaded.</p>}
    {staleSource && <p role="alert" className="feedback feedback-blocked">Blocked because a source lot changed. Remove it and add it again using current balances.</p>}
    <label className="form-label">Lot operation<select className="form-input" aria-label="Lot operation" value={kind} disabled={busy} onChange={(event) => { setKind(event.target.value as typeof kind); setSources([]); setLotId(''); setMessage(null) }}><option value="split">Split quantity into a new lot</option><option value="merge">Merge quantities into a new lot</option></select></label>
    <ActionForm title="Add source lot" disabled={blocked || !selected || (kind === 'split' && sources.length > 0) || sources.length >= 20}
      onSubmit={(form) => {
        if (!selected) return
        const quantity = positiveDecimalSchema.safeParse(String(new FormData(form).get('quantity') ?? ''))
        if (!quantity.success) { setMessage('Blocked because the source quantity must be a positive decimal with up to six places.'); return }
        if (sources.some((row) => row.lot_id === selected.id)) { setMessage('Blocked because each source lot may be selected once.'); return }
        setSources([...sources, { lot_id: selected.id, revision: selected.revision, quantity: quantity.data }]); setLotId(''); form.reset()
      }}>
      <label className="form-label">Transformation source lot<select aria-label="Transformation source lot" className="form-input" value={lotId} onChange={(event) => setLotId(event.target.value)} required><option value="">Select released source</option>{lots.filter((row) => row.qc_status === 'released' && !sources.some((source) => source.lot_id === row.id) && (!item || row.item_id === item.id || !sources.length)).map((row) => <option key={row.id} value={row.id}>{row.lot_code}</option>)}</select></label>
      {selected && <StockBalanceSummary position={positions.find((row) => row.lot_id === selected.id)} uom={options.items.find((row) => row.id === selected.item_id)?.base_uom} />}
      <label className="form-label">Source quantity ({options.items.find((row) => row.id === selected?.item_id)?.base_uom ?? 'select item'})<input aria-label="Transformation source quantity" className="form-input" name="quantity" inputMode="decimal" required /></label>
    </ActionForm>
    <ul className="grid gap-2 my-3">{sources.map((row) => <li className="record-card" key={row.lot_id}>{lots.find((lot) => lot.id === row.lot_id)?.lot_code} · {row.quantity} {item?.base_uom}<button className="secondary-button" type="button" disabled={busy} onClick={() => setSources(sources.filter((source) => source.lot_id !== row.lot_id))}>Remove source {lots.find((lot) => lot.id === row.lot_id)?.lot_code}</button></li>)}</ul>
    <ActionForm title={kind === 'split' ? 'Confirm lot split' : 'Confirm lot merge'} disabled={blocked || staleSource || !item || (kind === 'split' ? sources.length !== 1 : sources.length < 2)}
      onSubmit={(form) => {
        if (!item) return
        const fields = new FormData(form)
        void onTransform({kind,sources,location_id:String(fields.get('location')),lot_code:String(fields.get('code')),uom:item.base_uom,reason:String(fields.get('reason'))}).then((id) => {
          setMessage(`Lot ${kind} confirmed. New lot requires inspection and release. Confirmation: ${id}`); setSources([]); form.reset()
        }).catch((cause) => setMessage(formatCommandError(cause,'the lot operation could not be confirmed. Refresh source quantities and retry.')))
      }}>
      <label className="form-label">New lot code<input aria-label="Transformation lot code" className="form-input" name="code" required maxLength={64} /></label>
      <label className="form-label">New lot location<select aria-label="Transformation location" className="form-input" name="location" required defaultValue=""><option value="">Select physical destination</option>{options.locations.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</select></label>
      <label className="form-label">Split or merge reason<input aria-label="Transformation reason" className="form-input" name="reason" required maxLength={2000} /></label>
    </ActionForm>
  </section>
}
