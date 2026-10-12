export function HistoryPagination({ loading, canOlder, canNewer, onOlder, onNewer, label }: { loading: boolean; canOlder: boolean; canNewer: boolean; onOlder: () => void; onNewer: () => void; label: string }) {
  return <nav className="filter-bar" aria-label={label}>
    <button className="secondary-button" type="button" disabled={loading || !canNewer} onClick={onNewer}>Newer events</button>
    <button className="secondary-button" type="button" disabled={loading || !canOlder} onClick={onOlder}>Older events</button>
  </nav>
}
