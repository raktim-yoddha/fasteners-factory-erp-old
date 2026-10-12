import { useState } from 'react'
import type { RecordKind } from '@/features/records/recordTypes'
import { plantTimestamp } from '@/lib/decimal'
import { reportDefinitions, reportFilterSchema } from './useFactoryReports'
import type { FactoryReport, ReportFilters } from './useFactoryReports'

type Props = {
  data?: FactoryReport; filters: ReportFilters; availableKinds: ReportFilters['kind'][];
  loading: boolean; error: boolean; online: boolean;
  onFilter: (filters: ReportFilters) => void; onPage: (page: number) => void;
  onRefresh: () => void; onOpenRecord: (kind: RecordKind, id: string) => void;
}
export function FactoryReportsPanel({ data, filters, availableKinds, loading, error, online, onFilter, onPage, onRefresh, onOpenRecord }: Props) {
  const [draft, setDraft] = useState(filters)
  const [validation, setValidation] = useState<string | null>(null)
  const label = reportDefinitions.find((row) => row.kind === filters.kind)!.label
  const validData = !error && data
  return (
    <section className="record-panel" aria-labelledby="factory-reports-title">
      <h3 className="font-bold" id="factory-reports-title">Factory reports</h3>
      <p className="empty-state">Current open balances and recorded events, in their own units. Dates filter when a record was created or a stock movement was posted, using plant time. These are not historical closing balances.</p>
      {!availableKinds.length ? <p className="feedback feedback-blocked">Blocked because your role has no report source access.</p> : <>
        <form className="filter-bar" aria-label="Factory report filters" onSubmit={(event) => {
          event.preventDefault()
          const parsed = reportFilterSchema.safeParse({ ...draft, page: 0 })
          if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? 'Check the report filters.'); return }
          setValidation(null)
          onFilter(parsed.data)
        }}>
          <label className="form-label">Report<select aria-label="Factory report" className="form-input" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as ReportFilters['kind'] })}>{reportDefinitions.filter((row) => availableKinds.includes(row.kind)).map((row) => <option key={row.kind} value={row.kind}>{row.label}</option>)}</select></label>
          <label className="form-label">Created / posted from<input className="form-input" type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
          <label className="form-label">Created / posted to<input className="form-input" type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
          <label className="form-label">Find record, item or party<input className="form-input" value={draft.search} maxLength={100} onChange={(event) => setDraft({ ...draft, search: event.target.value })} /></label>
          <button className="primary-button" type="submit" disabled={loading || !online}>Apply report filters</button>
          <button className="secondary-button" type="button" disabled={loading || !online} onClick={onRefresh}>Refresh report</button>
        </form>
        {validation && <p role="alert" className="feedback feedback-blocked">Blocked because {validation}</p>}
        {loading && <p role="status">Loading authorized report records…</p>}
        {error && <p role="alert" className="feedback feedback-blocked">Blocked because this report could not be loaded. Refresh or check company access.</p>}
        <h4 className="font-bold">{label}</h4>
        {validData && <>
          <p role="status">{data.total} matching records · Page {data.page + 1} · Checked {plantTimestamp(data.as_of)}{!online ? ' · Cached, read-only' : ''}</p>
          {!data.rows.length && <p className="empty-state">No matching records. Check the date range and search, or choose another report.</p>}
          <ul className="record-list" aria-label={`${label} records`}>
            {data.rows.map((row) => <li className="record-card" key={row.key}>
              <button className="secondary-button" type="button" onClick={() => onOpenRecord(row.record_kind, row.record_id)}>Open {row.label}</button>
              <p>{row.sku}{row.party ? ` · ${row.party}` : ''} · {row.status}</p>
              <p><strong>{row.quantity_label}: {row.quantity} {row.uom}</strong></p>
              <p>{plantTimestamp(row.occurred_at)} · Record age {row.age_days} days{row.due_date ? ` · Due ${row.due_date}` : ''}</p>
              {row.overdue && <p className="feedback feedback-blocked">Overdue since {row.due_date}; review the outstanding work or custody.</p>}
              <p>{row.details}</p>
            </li>)}
          </ul>
          <nav className="filter-bar" aria-label="Factory report pages">
            <button className="secondary-button" type="button" disabled={loading || !online || filters.page === 0} onClick={() => onPage(filters.page - 1)}>Previous report page</button>
            <button className="secondary-button" type="button" disabled={loading || !online || (filters.page + 1) * data.page_size >= data.total} onClick={() => onPage(filters.page + 1)}>Next report page</button>
          </nav>
        </>}
      </>}
    </section>
  )
}
