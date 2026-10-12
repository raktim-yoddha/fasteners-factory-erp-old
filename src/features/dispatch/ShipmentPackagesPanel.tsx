import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ActionForm } from '@/components/ActionForm'
import { CustomerPartSummary } from '@/components/CustomerPartSummary'
import { CommandFeedback } from '@/components/CommandFeedback'
import { positiveDecimalSchema } from '@/lib/decimal'
import { formatCommandError } from '@/lib/commandError'
import type { PackingWorkspace, ShipmentPackageInput } from './useShipmentPackages'
import type { UnitConversion, ItemSpecification } from '@/features/master-data/useItemControls'
import { UnitConversionSelect } from '@/components/UnitConversionSelect'
import { ItemSpecificationSummary } from '@/components/ItemSpecificationSummary'
import { BarcodeLabel } from '@/components/BarcodeLabel'

type Props = {
  companyId: string | null; data?: PackingWorkspace; permissions: string[]; online: boolean;
  busy: boolean; loading: boolean; error: boolean;
  onAdd: (input: ShipmentPackageInput) => Promise<string>; onPrint: () => void;
  conversions?: UnitConversion[]; specifications?: ItemSpecification[];
}
function PackageLabels({ line, packages }: { line: PackingWorkspace['lines'][number]; packages: PackingWorkspace['packages'] }) {
  return packages.map((row) => <article className="record-card package-label" key={row.id}>
    <h4 className="font-bold">{line.status === 'cancelled' ? 'VOID · ' : ''}{row.package_code}</h4>
    {line.status!=='cancelled' && <BarcodeLabel value={row.package_code} />}
    <p>Shipment {line.shipment_number} · {line.status === 'draft' ? 'PREPARED · gate-out pending' : line.status}</p>
    <p>Item {line.sku}</p><p>Lot {line.lot_code}</p><p>Quantity {row.quantity} {row.uom}</p>
    {row.input_quantity && <p>Recorded {row.input_quantity} {row.input_uom} · approved conversion applied</p>}
    <CustomerPartSummary number={line.customer_part_number} revision={line.customer_part_revision} />
  </article>)
}
export function ShipmentPackagesPanel({ companyId, data, permissions, online, busy, loading, error, onAdd, onPrint, conversions = [], specifications = [] }: Props) {
  const [lineId, setLineId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [conversionId, setConversionId] = useState('')
  const conversion = conversions.find((row) => row.id === conversionId)
  const line = data?.lines.find((row) => row.id === lineId)
  const packages = data?.packages.filter((row) => row.shipment_line_id === lineId) ?? []
  const disabled = !companyId || !online || busy || loading || error || !permissions.includes('dispatch.manage') || !line || line.status !== 'draft' || !positiveDecimalSchema.safeParse(line.remaining_quantity).success || Boolean(conversionId && (!conversion || conversion.status !== 'approved' || conversion.item_id !== line?.item_id))
  async function add(form: HTMLFormElement) {
    if (!line) return
    const fields = new FormData(form)
    try {
      const confirmation = await onAdd({ shipment_line_id: line.id, shipment_revision: line.shipment_revision,
        quantity: String(fields.get('quantity') ?? ''), uom: conversion?.from_uom ?? line.uom, ...(conversionId ? { conversion_id: conversionId } : {}), package_code: String(fields.get('code') ?? '') })
      setMessage(`Package contents confirmed. Confirmation: ${confirmation}`)
      form.reset()
    } catch (cause) {
      setMessage(formatCommandError(cause, 'the package could not be confirmed. Keep its contents and code, and retry.'))
    }
  }
  return (
    <section className="record-panel" aria-labelledby="shipment-packages-title">
      <h3 className="font-bold" id="shipment-packages-title">Package contents and labels</h3>
      <p className="empty-state">Record each package's actual quantity in the base unit or select an approved alternate-unit basis. Every shipment line must be fully covered before gate-out once package tracking starts.</p>
      <CommandFeedback message={message} />
      {loading && <p role="status">Loading package contents…</p>}
      {error && <p role="alert" className="feedback feedback-blocked">Blocked because package records could not be loaded.</p>}
      {!online && <p className="feedback feedback-blocked">Blocked because package changes require an online connection.</p>}
      <label className="form-label">Package shipment line<select className="form-input" aria-label="Package shipment line" value={lineId} disabled={busy} onChange={(event) => { setLineId(event.target.value); setMessage(null); setConversionId('') }}>
        <option value="">Select packed item and lot</option>
        {data?.lines.map((row) => <option key={row.id} value={row.id}>{row.shipment_number} · {row.sku} · {row.lot_code} · {row.status}</option>)}
      </select></label>
      {line && <article className="detail-summary" aria-label="Package quantity balance">
        <strong>{line.shipment_number} · {line.status}</strong>
        <p>{line.sku} · Lot {line.lot_code}</p>
        <p>Packed {line.quantity} {line.uom} · In packages {line.packaged_quantity} {line.uom} · Unlabelled {line.remaining_quantity} {line.uom}</p>
        {line.item_specification_id && <ItemSpecificationSummary specification={specifications.find((row) => row.id === line.item_specification_id)} />}
        {line.status === 'cancelled' && <p>Cancelled packing history. These labels are void.</p>}
      </article>}
      <ActionForm title="Record package contents" disabled={disabled} onSubmit={(form) => { void add(form) }}>
        <label className="form-label">Package code<input className="form-input" name="code" required maxLength={64} /></label>
        <UnitConversionSelect label="Package quantity unit" conversions={conversions} itemId={line?.item_id} baseUnit={line?.uom} value={conversionId} onChange={setConversionId} />
        <label className="form-label">Package quantity ({conversion?.from_uom ?? line?.uom ?? 'select shipment'})<input className="form-input" aria-label="Package quantity" name="quantity" inputMode="decimal" required /></label>
        <p className="empty-state">Confirmed package contents stay in history. If packing is wrong, cancel it before gate-out and prepare corrected packing.</p>
      </ActionForm>
      <button className="secondary-button" type="button" disabled={busy || loading || error || !packages.length || line?.status === 'cancelled'} onClick={onPrint}>Print selected package labels</button>
      {!loading && !error && line && <div className="package-labels" aria-label="Selected package labels">
        <PackageLabels line={line} packages={packages} />
      </div>}
      {!loading && !error && line && packages.length > 0 && createPortal(
        <section className="package-print-sheet" aria-hidden="true"><PackageLabels line={line} packages={packages} /></section>, document.body,
      )}
    </section>
  )
}
