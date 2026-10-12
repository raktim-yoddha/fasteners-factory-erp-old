import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { CommandFeedback } from '@/components/CommandFeedback'
import { ItemSpecificationSummary } from '@/components/ItemSpecificationSummary'
import { formatCommandError } from '@/lib/commandError'
import type { MasterDataOptions } from './useMasterDataOptions'
import type { ItemControlCommand, ItemSpecification, UnitConversion } from './useItemControls'

type Props = { items: MasterDataOptions['items']; specifications: ItemSpecification[]; conversions: UnitConversion[];
  permissions: string[]; online: boolean; busy: boolean; loading: boolean; error: boolean; onCommand: (command: ItemControlCommand) => Promise<string> }
export function ItemControlsPanel({ items, specifications, conversions, permissions, online, busy, loading, error, onCommand }: Props) {
  const [itemId, setItemId] = useState(''), [section, setSection] = useState('specification'), [history, setHistory] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const item = items.find((row) => row.id === itemId)
  const canManage = permissions.includes('item_controls.manage'), canApprove = permissions.includes('item_controls.approve')
  const unavailable = !online || busy || loading || error
  async function submit(command: ItemControlCommand, form?: HTMLFormElement) {
    try { await onCommand(command); setMessage('Item control confirmed.'); form?.reset() }
    catch (cause) { setMessage(formatCommandError(cause, 'the item control could not be confirmed. Keep the details and retry.')) }
  }
  const value = (form: HTMLFormElement, key: string) => String(new FormData(form).get(key) ?? '').trim()
  return <section className="record-panel" aria-labelledby="item-controls-title">
    <h3 className="font-bold" id="item-controls-title">Specifications and units</h3>
    <p className="empty-state">Each SKU represents a distinct factory item. Record only verified properties; blank means unknown. Approved versions remain in history. New quotations pin the current approved specification.</p>
    <CommandFeedback message={message} />
    {loading && <p role="status">Loading item controls…</p>}
    {error && <p role="alert" className="feedback feedback-blocked">Blocked because item controls could not be loaded.</p>}
    {!online && <p className="feedback feedback-blocked">Blocked because item controls require an online connection.</p>}
    <label className="form-label">Controlled item<select aria-label="Controlled item" className="form-input" value={itemId} disabled={busy} onChange={(event) => { setItemId(event.target.value); setMessage(null) }}>
      <option value="">Select item</option>{items.map((row) => <option value={row.id} key={row.id}>{row.sku} — {row.description}</option>)}
    </select></label>
    <nav className="workflow-switch" aria-label="Item control steps">{[['specification','Specifications'],['conversion','Unit conversions']].map(([key,label]) =>
      <button type="button" className="secondary-button" key={key} aria-pressed={section === key} onClick={() => setSection(key!)}>{label}</button>)}</nav>
    <label className="checkbox-label"><input type="checkbox" checked={history} onChange={(event) => setHistory(event.target.checked)} /> Include retired item controls</label>
    {item && section === 'specification' && <>
      {canManage && <ActionForm title="Record specification draft" disabled={unavailable} lockInputs onSubmit={(form) => { void submit({ action: 'create_specification', data: {
        item_id: item.id, product_type: value(form,'type'), diameter_mm: value(form,'diameter') || null, length_mm: value(form,'length') || null, thread_pitch_mm: value(form,'pitch') || null,
        thread_designation: value(form,'thread'), material_grade: value(form,'material'), property_class: value(form,'class'), coating: value(form,'coating'), standard_reference: value(form,'standard'), evidence: value(form,'evidence'),
      } }, form) }}>
        {([['type','Product type',true],['diameter','Nominal diameter (mm)',false],['length','Length (mm)',false],['pitch','Thread pitch (mm)',false],['thread','Thread designation',false],['material','Material grade',false],['class','Property class',false],['coating','Coating / finish',false],['standard','Standard reference',false]] as const).map(([name,label,required]) =>
          <label className="form-label" key={name}>{label}<input className="form-input" name={name} required={required} maxLength={name === 'standard' ? 160 : 120} inputMode={['diameter','length','pitch'].includes(name) ? 'decimal' : 'text'} /></label>)}
        <label className="form-label">Specification evidence<textarea className="form-input" name="evidence" required maxLength={2000} /></label>
      </ActionForm>}
      <ul className="record-list" aria-label="Specification history">{specifications.filter((row) => row.item_id === item.id && (history || row.status !== 'retired')).map((row) =>
        <li className="record-card" key={row.id}><ItemSpecificationSummary specification={row} /><p>{row.status === 'retired' ? `⚠ Retired because ${row.retirement_reason}` : `${row.status === 'approved' ? '✓' : '○'} ${row.status}`}</p><p>Evidence: {row.evidence}</p>
          {canApprove && row.status !== 'retired' && <ActionForm title={`${row.status === 'draft' ? 'Approve' : 'Retire'} specification v${row.version}`} disabled={unavailable} lockInputs onSubmit={(form) => { void submit({ action: row.status === 'draft' ? 'approve_specification' : 'retire_specification', data: { id: row.id, reason: value(form,'reason') } }, form) }}>
            <label className="form-label">{row.status === 'draft' ? 'Specification approval reason' : 'Specification retirement reason'}<input className="form-input" name="reason" required maxLength={2000} /></label>
          </ActionForm>}
        </li>)}</ul>
    </>}
    {item && section === 'conversion' && <>
      <p className="empty-state">Base unit: {item.base_uom}. Enter an observed or approved packing basis, including its source and scope. Weight-to-piece bases require measured evidence. No universal factor is supplied.</p>
      {canManage && <ActionForm title="Record conversion draft" disabled={unavailable} lockInputs onSubmit={(form) => { void submit({ action: 'create_conversion', data: { item_id: item.id, from_uom: value(form,'unit') as UnitConversion['from_uom'], from_quantity: value(form,'from'), to_quantity: value(form,'to'), evidence: value(form,'evidence') } }, form) }}>
        <label className="form-label">Alternate unit<select aria-label="Alternate unit" className="form-input" name="unit" required defaultValue=""><option value="">Select unit</option>{['pcs','kg','m','set','box','bundle'].filter((unit) => unit !== item.base_uom).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        <label className="form-label">Measured alternate quantity<input className="form-input" inputMode="decimal" name="from" required /></label>
        <label className="form-label">Equivalent quantity ({item.base_uom})<input className="form-input" inputMode="decimal" name="to" required /></label>
        <label className="form-label">Conversion measurement / packing evidence<textarea className="form-input" name="evidence" required maxLength={2000} /></label>
      </ActionForm>}
      <ul className="record-list" aria-label="Unit conversion history">{conversions.filter((row) => row.item_id === item.id && (history || row.status !== 'retired')).map((row) =>
        <li className="record-card" key={row.id}><strong>Basis v{row.version}: {row.from_quantity} {row.from_uom} = {row.to_quantity} {row.to_uom}</strong>
          <p>{row.status === 'retired' ? `⚠ Retired because ${row.retirement_reason}` : `${row.status === 'approved' ? '✓' : '○'} ${row.status}`}</p><p>Evidence: {row.evidence}</p>
          {canApprove && row.status !== 'retired' && <ActionForm title={`${row.status === 'draft' ? 'Approve' : 'Retire'} ${row.from_uom} conversion v${row.version}`} disabled={unavailable} lockInputs onSubmit={(form) => { void submit({ action: row.status === 'draft' ? 'approve_conversion' : 'retire_conversion', data: { id: row.id, reason: value(form,'reason') } }, form) }}>
            <label className="form-label">{row.status === 'draft' ? 'Conversion approval reason' : 'Conversion retirement reason'}<input className="form-input" name="reason" required maxLength={2000} /></label>
          </ActionForm>}
        </li>)}</ul>
    </>}
  </section>
}
