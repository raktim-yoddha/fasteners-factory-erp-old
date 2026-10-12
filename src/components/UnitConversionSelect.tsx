import type { UnitConversion } from '@/features/master-data/useItemControls'

export function UnitConversionSelect({ conversions, itemId, baseUnit, value, onChange, label }: {
  conversions: UnitConversion[]; itemId?: string; baseUnit?: string; value: string; onChange: (id: string) => void; label: string;
}) {
  const selected = conversions.find((row) => row.id === value && row.item_id === itemId && row.status === 'approved')
  return <>
    <label className="form-label">{label}<select aria-label={label} className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Base unit ({baseUnit ?? 'select item'})</option>
      {conversions.filter((row) => row.item_id === itemId && row.status === 'approved' && row.to_uom === baseUnit).map((row) =>
        <option key={row.id} value={row.id}>{row.from_uom} · v{row.version} · {row.from_quantity} {row.from_uom} = {row.to_quantity} {row.to_uom}</option>)}
    </select></label>
    {selected && <p className="empty-state">Approved basis: {selected.from_quantity} {selected.from_uom} = {selected.to_quantity} {selected.to_uom}. Evidence: {selected.evidence}. The server checks the exact base quantity before posting.</p>}
    {value && !selected && <p role="alert" className="feedback feedback-blocked">Blocked because this conversion is unavailable or retired. Select an approved basis.</p>}
  </>
}
