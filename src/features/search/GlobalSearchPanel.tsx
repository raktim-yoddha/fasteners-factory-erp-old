import type { GlobalSearchResult } from '@/features/search/useGlobalSearch'

type GlobalSearchPanelProps = {
  companyId: string | null
  query: string
  results: GlobalSearchResult[]
  loading: boolean
  error: boolean
  onQueryChange: (query: string) => void
  onOpenRecord?: (result: GlobalSearchResult) => void
}

export function GlobalSearchPanel({ companyId, query, results, loading, error, onQueryChange, onOpenRecord = () => undefined }: GlobalSearchPanelProps) {
  const canSearch = Boolean(companyId && query.trim().length >= 2)

  return (
    <section className="mt-6 rounded-xl border border-line bg-panel p-5" aria-labelledby="global-search-title">
      <h3 className="font-bold" id="global-search-title">Global search</h3>
      <p className="mt-1 text-sm leading-6 text-muted">Find records in the active company by identifier or name. Results always follow your existing permissions.</p>
      <label className="form-label mt-4 max-w-xl">Search records
        <input className="form-input" disabled={!companyId} id="global-search-input" onChange={(event) => onQueryChange(event.target.value)} placeholder="Enter at least 2 characters" value={query} />
      </label>
      {!companyId ? <p className="mt-3 text-sm text-muted">Select a company to search its records.</p> : null}
      {companyId && !canSearch ? <p className="mt-3 text-sm text-muted">Enter at least 2 characters to search.</p> : null}
      {loading ? <p className="mt-3 text-sm text-muted" role="status">Searching permitted records…</p> : null}
      {error ? <p className="mt-3 rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning" role="alert">Search could not be completed. Check your connection and permissions, then try again.</p> : null}
      {canSearch && !loading && !error && results.length === 0 ? <p className="mt-3 text-sm text-muted">No permitted records match this search.</p> : null}
      {canSearch && !loading && !error && results.length > 0 ? <ul className="mt-3 divide-y divide-line rounded-lg border border-line" aria-label="Search results">{results.map((result) => <li className="px-3 py-3" key={`${result.record_type}-${result.record_id}`}><button className="search-result" type="button" onClick={() => onOpenRecord(result)}><span className="text-xs font-semibold uppercase tracking-wide text-muted">{result.record_type}</span><span className="mt-1 block text-sm font-medium">{result.label}</span><span className="mt-1 block text-xs text-muted">Open permitted record</span></button></li>)}</ul> : null}
    </section>
  )
}
