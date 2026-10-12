import { useState } from 'react'
import type { GlobalSearchResult } from './useGlobalSearch'

export function ScannerPanel({ disabled, busy, onLookup, onOpen }: { disabled: boolean;busy: boolean;onLookup: (value: string) => Promise<GlobalSearchResult[]>;onOpen: (result: GlobalSearchResult) => void }) {
  const [query,setQuery]=useState(''),[results,setResults]=useState<GlobalSearchResult[]|null>(null),[failed,setFailed]=useState(false)
  async function lookup() {
    setFailed(false);setResults(null)
    try { setResults(await onLookup(query)) } catch { setFailed(true) }
  }
  return <details className="record-panel">
    <summary className="secondary-button">Scan an identifier</summary>
    <p className="empty-state">Focus the field, scan with a keyboard scanner and press Enter, or paste a code. Exact matches only, in the active company. Open the record to review its state before any operation.</p>
    <form className="master-form" onSubmit={(event) => { event.preventDefault();if (!disabled && !busy && query.trim()) void lookup() }}>
      <label className="form-label">Scanned identifier<input className="form-input" autoComplete="off" value={query} disabled={disabled || busy} onChange={(event) => { setQuery(event.target.value);setResults(null);setFailed(false) }} /></label>
      <button className="primary-button" type="submit" disabled={disabled || busy || !query.trim()}>Find scanned record</button>
    </form>
    {busy && <p role="status">Looking up the scanned identifier…</p>}
    {failed && <p className="feedback feedback-blocked" role="alert">Blocked because the identifier could not be looked up. Keep the code and retry.</p>}
    {results?.length===0 && <p role="status">No permitted exact match. Check the code and active company.</p>}
    {results && results.length>1 && <p className="empty-state">Multiple records use this code. Select the intended record.</p>}
    {results && results.length>0 && <ul className="record-list" aria-label="Scanned records">{results.map((row) => <li key={`${row.record_type}-${row.record_id}-${row.label}`}><button className="record-list-button" type="button" onClick={() => onOpen(row)}>{row.record_type} · {row.label} · Open record</button></li>)}</ul>}
  </details>
}
