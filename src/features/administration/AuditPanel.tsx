import { useState } from 'react'
import { plantTimestamp } from '@/lib/decimal'
import type { AuditFilter, AuditPage } from './useAdministration'

export function AuditPanel({ data, filter, loading, error, onFilter, onPrevious, canPrevious }: {
  data?: AuditPage;filter: AuditFilter;loading: boolean;error: string|null;onFilter: (filter: AuditFilter) => void;onPrevious: () => void;canPrevious: boolean;
}) {
  const [search,setSearch]=useState(filter.search),[from,setFrom]=useState(filter.fromDate),[to,setTo]=useState(filter.toDate)
  return <section className="record-panel" aria-labelledby="audit-title"><h3 id="audit-title" className="font-bold">Audit history</h3>
    <p className="empty-state">Server-confirmed events, newest first. Dates use plant time (Asia/Kolkata). Showing up to 50 events per page.</p>
    <form className="filter-bar" onSubmit={(event) => { event.preventDefault();onFilter({ search,beforeId: null,fromDate: from,toDate: to }) }}>
      <label className="form-label">Find audit event<input className="form-input" value={search} maxLength={160} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="form-label">Audit from date<input className="form-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="form-label">Audit to date<input className="form-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button className="secondary-button" disabled={loading} type="submit">Filter audit history</button>
    </form>
    {loading && <p role="status">Loading audit history…</p>}{error && <p role="alert" className="feedback feedback-blocked">Blocked because {error}</p>}
    {!loading && !error && <ul className="record-list" aria-label="Audit events">{data?.rows.map((row) => <li className="record-card" key={row.id}>
      <strong>{row.action}</strong><p>{plantTimestamp(row.occurred_at)} · {row.entity_type}</p><p className="break-all">Record {row.entity_id??'not recorded'} · Actor {row.actor_id??'system'}</p>
      {row.reason && <p>Reason: {row.reason}</p>}{Object.keys(row.metadata).length>0 && <details><summary>Recorded details</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(row.metadata,null,2)}</pre></details>}
    </li>)}</ul>}
    {!loading && !error && data?.rows.length===0 && <p>No events match these filters.</p>}
    <nav className="filter-bar" aria-label="Audit pages"><button className="secondary-button" type="button" disabled={loading || !canPrevious} onClick={onPrevious}>Newer audit events</button>
      <button className="secondary-button" type="button" disabled={loading || Boolean(error) || !data?.has_more} onClick={() => onFilter({ ...filter,beforeId: data?.rows.at(-1)?.id??null })}>Older audit events</button></nav>
  </section>
}
