import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { CommandFeedback } from '@/components/CommandFeedback'
import { CustomerPartSummary } from '@/components/CustomerPartSummary'
import { formatCommandError } from '@/lib/commandError'
import type { CustomerOption } from '@/features/sales/useCustomers'
import type { EngineeringRevisionOptions } from '@/features/sales/useEngineeringRevisionOptions'
import type { MasterDataOptions } from './useMasterDataOptions'
import { customerPartCommandSchema, type CustomerPart, type CustomerPartCommand } from './useCustomerParts'

type Props = {
  parts: CustomerPart[]; customers: CustomerOption[]; items: MasterDataOptions['items']; engineering: EngineeringRevisionOptions
  permissions: string[]; online: boolean; busy: boolean; loading: boolean; error: boolean
  onCommand: (command: CustomerPartCommand) => Promise<string>
}
export function CustomerPartsPanel({ parts, customers, items, engineering, permissions, online, busy, loading, error, onCommand }: Props) {
  const [itemId, setItemId] = useState('')
  const [search, setSearch] = useState('')
  const [showRetired, setShowRetired] = useState(false)
  const [referenceId, setReferenceId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const selected = parts.find((row) => row.id === referenceId)
  const disabled = !online || busy || loading || error || !permissions.includes('customer_parts.manage')
  const visible = parts.filter((row) => (showRetired || !row.retired_at) && `${row.customer_name} ${row.customer_code} ${row.part_number} ${row.part_revision} ${row.sku}`.toLowerCase().includes(search.trim().toLowerCase()))
  const field = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? '').trim()
  async function submit(command: CustomerPartCommand, form: HTMLFormElement) {
    const parsed = customerPartCommandSchema.safeParse(command)
    if (!parsed.success) { setMessage('Blocked because the customer, item, part number, description and reason must be recorded.'); return }
    setMessage(null)
    try {
      const id = await onCommand(parsed.data)
      setReferenceId(command.action === 'create' ? '' : id)
      if (command.action === 'create') setItemId('')
      form.reset()
      setMessage(command.action === 'create' ? 'Customer part reference confirmed. Its mapping is immutable.' : 'Customer part reference retired. Existing approved quotations and orders retain their original mapping.')
    } catch (cause) { setMessage(formatCommandError(cause, 'the customer part action could not be confirmed. Keep the inputs and retry.')) }
  }
  if (loading) return <p role="status">Loading customer part references…</p>
  if (error) return <p role="alert">Blocked because customer part references could not be loaded.</p>
  return <section className="record-panel" aria-labelledby="customer-parts-title">
    <h3 id="customer-parts-title" className="font-bold">Customer part references</h3>
    <p className="empty-state">Map the customer’s part number to the factory item and, when supplied, its approved drawing. Customer revision may be blank. Corrections retire the old mapping and create a new mapping version; confirmed history stays unchanged.</p>
    {!online && <p className="feedback feedback-blocked">Offline. Cached references are read-only.</p>}
    <CommandFeedback message={message} />
    <label className="form-label">Find customer part<input aria-label="Find customer part" className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={showRetired} onChange={(event) => setShowRetired(event.target.checked)} />Include retired references</label>
    {!visible.length && <p className="empty-state">No matching customer part reference is recorded.</p>}
    <ul className="grid gap-3" aria-label="Customer part reference records">{visible.map((row) => <li key={row.id} className="record-card">
      <strong>{row.customer_code} — {row.customer_name}</strong>
      <CustomerPartSummary number={row.part_number} revision={row.part_revision} />
      <p>{row.sku} · {row.description} · Mapping v{row.reference_version}</p>
      <p>Drawing: {row.drawing_label ?? 'Not specified'}</p>
      <p>{row.retired_at ? `⚠ Retired because ${row.retirement_reason}` : '✓ Active reference'}</p>
      {!row.retired_at && permissions.includes('customer_parts.manage') && <button className="secondary-button" type="button" disabled={disabled} onClick={() => setReferenceId(row.id)}>Retire {row.part_number}{row.part_revision ? ` Rev ${row.part_revision}` : ''} mapping v{row.reference_version}</button>}
    </li>)}</ul>
    {selected && !selected.retired_at && permissions.includes('customer_parts.manage') && <ActionForm key={selected.id} title="Retire customer part reference" disabled={disabled} lockInputs onSubmit={(form) => { void submit({ action: 'retire', referenceId: selected.id, reason: field(form, 'reason') }, form) }}>
      <p>Retire {selected.customer_code} · {selected.part_number} · Mapping v{selected.reference_version}. New quotations and draft approval will be blocked. Previously approved quotations and orders retain this exact mapping.</p>
      <label className="form-label">Reference retirement reason<textarea aria-label="Reference retirement reason" className="form-input" name="reason" maxLength={2000} required /></label>
    </ActionForm>}
    {permissions.includes('customer_parts.manage') && <ActionForm title="Record customer part reference" disabled={disabled} lockInputs onSubmit={(form) => { void submit({ action: 'create', data: {
      customer_id: field(form, 'customer'), item_id: itemId, part_number: field(form, 'part'), part_revision: field(form, 'revision'), description: field(form, 'description'), drawing_revision_id: field(form, 'drawing') || null, reason: field(form, 'reason'),
    } }, form) }}>
      <label className="form-label">Reference customer<select aria-label="Reference customer" className="form-input" name="customer" required defaultValue=""><option value="">Select customer</option>{customers.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</select></label>
      <label className="form-label">Reference factory item<select aria-label="Reference factory item" className="form-input" name="item" value={itemId} required onChange={(event) => setItemId(event.target.value)}><option value="">Select item</option>{items.map((row) => <option key={row.id} value={row.id}>{row.sku} — {row.description}</option>)}</select></label>
      <label className="form-label">Customer part number<input aria-label="Customer part number" className="form-input" name="part" maxLength={80} required /></label>
      <label className="form-label">Customer part revision (if supplied)<input aria-label="Customer part revision (if supplied)" className="form-input" name="revision" maxLength={24} /></label>
      <label className="form-label">Customer part description<input aria-label="Customer part description" className="form-input" name="description" maxLength={500} required /></label>
      <label className="form-label">Customer part drawing<select key={itemId} aria-label="Customer part drawing" className="form-input" name="drawing" defaultValue=""><option value="">Not supplied</option>{engineering.drawings.filter((row) => row.itemId === itemId).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
      <label className="form-label">Reference recording reason<textarea aria-label="Reference recording reason" className="form-input" name="reason" maxLength={2000} required /></label>
      <label className="flex items-center gap-2"><input type="checkbox" required />I checked the customer part, factory item and drawing reference</label>
    </ActionForm>}
  </section>
}
