import { useState } from 'react'
import type { RecordKind } from '@/features/records/recordTypes'
import { isRecordKind, recordKindLabels } from '@/features/records/recordTypes'
import {
  recordKindLabel,
  useRecordWorkspace,
} from '@/features/records/useRecordWorkspace'
import { plantTimestamp } from '@/lib/decimal'
import { HistoryPagination } from '@/components/HistoryPagination'

type RecordWorkspacePanelProps = {
  companyId: string | null
  recordId: string | undefined
  recordType: string | undefined
  onBack: () => void
  onOpenRecord: (kind: RecordKind, id: string) => void
}

function formatTimestamp(value: string) {
  if (value === 'Not recorded') return value
  return plantTimestamp(value)
}

export function RecordWorkspacePanel({
  companyId,
  recordId,
  recordType,
  onBack,
  onOpenRecord,
}: RecordWorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<
    'summary' | 'timeline' | 'links' | 'attachments'
  >('summary')
  const kind = isRecordKind(recordType) ? recordType : null
  const [beforeId,setBeforeId]=useState<string|null>(null),[previous,setPrevious]=useState<(string|null)[]>([])
  const [afterLink,setAfterLink]=useState<{ kind: string;id: string }|null>(null),[previousLinks,setPreviousLinks]=useState<({ kind: string;id: string }|null)[]>([])
  const record = useRecordWorkspace(companyId, kind, recordId,beforeId,afterLink)

  if (!kind || !recordId)
    return (
      <section className="record-panel" aria-labelledby="record-title">
        <h2 id="record-title">Record route is not available</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Return to operations and open a permitted result through global
          search.
        </p>
        <button
          className="secondary-button mt-4"
          type="button"
          onClick={onBack}
        >
          Back to operations
        </button>
      </section>
    )
  if (record.isLoading)
    return (
      <section className="record-panel" aria-live="polite">
        <p>Loading permitted {recordKindLabels[kind].toLowerCase()} record…</p>
      </section>
    )
  if (record.isError)
    return (
      <section className="record-panel" role="alert">
        <h2>Record could not be loaded</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          The record may be unavailable, outside the active company, or not
          permitted for your role.
        </p>
        <button
          className="secondary-button mt-4"
          type="button"
          onClick={onBack}
        >
          Back to operations
        </button>
      </section>
    )
  if (!record.data)
    return (
      <section className="record-panel">
        <h2>Record is not available</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          It may have been removed, belong to another company, or be unavailable
          under your current permissions.
        </p>
        <button
          className="secondary-button mt-4"
          type="button"
          onClick={onBack}
        >
          Back to operations
        </button>
      </section>
    )

  const workspace = record.data
  return (
    <section className="record-panel" aria-labelledby="record-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand">{workspace.source}</p>
          <h2
            className="mt-1 text-2xl font-bold tracking-tight"
            id="record-title"
          >
            {workspace.title}
          </h2>
          <p className="mt-2 text-sm text-muted">
            State: <strong className="text-ink">{workspace.state}</strong> ·
            Last recorded: {formatTimestamp(workspace.lastRecordedAt)}
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          Back to operations
        </button>
      </div>
      <p className="mt-4 rounded-lg border border-line bg-canvas p-3 text-sm text-muted">
        Next workspace:{' '}
        <strong className="text-ink">{workspace.nextWorkspace}</strong>. This
        record page is read-only; use the operations workspace for any permitted
        action.
      </p>
      <div
        className="mt-5 flex gap-2 overflow-x-auto"
        role="tablist"
        aria-label="Record details"
      >
        {(['summary', 'timeline', 'links', 'attachments'] as const).map(
          (tab) => (
            <button
              key={tab}
              id={`record-tab-${tab}`}
              aria-controls={`record-section-${activeTab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              className={
                activeTab === tab ? 'nav-item nav-item-active' : 'nav-item'
              }
              role="tab"
              aria-selected={activeTab === tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => {
                const tabs = [
                  'summary',
                  'timeline',
                  'links',
                  'attachments',
                ] as const
                const index = tabs.indexOf(tab)
                const next =
                  event.key === 'ArrowRight'
                    ? tabs[(index + 1) % tabs.length]
                    : event.key === 'ArrowLeft'
                      ? tabs[(index + tabs.length - 1) % tabs.length]
                      : event.key === 'Home'
                        ? tabs[0]
                        : event.key === 'End'
                          ? tabs[tabs.length - 1]
                          : undefined
                if (next) {
                  event.preventDefault()
                  setActiveTab(next)
                  document.getElementById(`record-tab-${next}`)?.focus()
                }
              }}
            >
              {tab === 'links'
                ? 'Linked records'
                : tab[0]!.toUpperCase() + tab.slice(1)}
            </button>
          ),
        )}
      </div>
      <div
        role="tabpanel"
        id={`record-section-${activeTab}`}
        aria-labelledby={`record-tab-${activeTab}`}
      >
        {activeTab === 'summary' ? (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {workspace.summary.map((entry) => (
              <div
                className="rounded-lg border border-line bg-canvas p-4"
                key={entry.label}
              >
                <dt className="text-sm font-semibold text-muted">
                  {entry.label}
                </dt>
                <dd className="mt-1 break-words text-sm font-medium text-ink">
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {activeTab === 'timeline' ? (
          <div className="mt-5">
            <h3 className="font-bold">Permitted audit timeline</h3>
            <HistoryPagination label="Record timeline pages" loading={record.isFetching} canOlder={workspace.timelineHasMore??false} canNewer={previous.length>0} onOlder={() => { const last=workspace.timeline.at(-1)?.id;if (last) { setPrevious([...previous,beforeId]);setBeforeId(last) } }} onNewer={() => { setBeforeId(previous.at(-1)??null);setPrevious(previous.slice(0,-1)) }} />
            {workspace.timeline.length > 0 ? (
              <ol className="mt-3 space-y-3 border-l border-line pl-4">
                {workspace.timeline.map((event) => (
                  <li key={event.id}>
                    <p className="text-sm font-semibold">Event {event.id} · {event.action}</p>
                    <p className="mt-1 text-sm text-muted">
                      {formatTimestamp(event.occurred_at)}
                      {event.reason ? ` · ${event.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 rounded-lg border border-line bg-canvas p-3 text-sm text-muted">
                No audit entries are available under your current permissions.
              </p>
            )}
          </div>
        ) : null}
        {activeTab === 'links' ? (
          <div className="mt-5">
            <h3 className="font-bold">Related permitted records</h3>
            <nav className="filter-bar" aria-label="Linked record pages">
              <button className="secondary-button" type="button" disabled={record.isFetching || previousLinks.length===0} onClick={() => { setAfterLink(previousLinks.at(-1)??null);setPreviousLinks(previousLinks.slice(0,-1)) }}>Previous links</button>
              <button className="secondary-button" type="button" disabled={record.isFetching || !workspace.relatedHasMore} onClick={() => { const last=workspace.relatedRecords.at(-1);if (last) { setPreviousLinks([...previousLinks,afterLink]);setAfterLink({ kind: last.kind,id: last.id }) } }}>More links</button>
            </nav>
            {workspace.relatedRecords.length > 0 ? (
              <ul className="mt-3 divide-y divide-line rounded-lg border border-line" aria-label="Related records">
                {workspace.relatedRecords.map((related) => {
                  const relatedKind = isRecordKind(related.kind)
                    ? related.kind
                    : null
                  return (
                    <li
                      className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
                      key={`${related.kind}-${related.id}`}
                    >
                      <span>
                        <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                          {recordKindLabel(related.kind)}
                        </span>
                        <span className="text-sm font-medium">
                          {related.label}
                        </span>
                      </span>
                      {relatedKind ? (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => onOpenRecord(relatedKind, related.id)}
                        >
                          Open
                        </button>
                      ) : (
                        <span className="text-sm text-muted">
                          Details are not available yet
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-3 rounded-lg border border-line bg-canvas p-3 text-sm text-muted">
                No related records are available under your current permissions.
              </p>
            )}
          </div>
        ) : null}
        {activeTab === 'attachments' ? (
          <div className="mt-5 rounded-lg border border-line bg-canvas p-4">
            <h3 className="font-bold">Attachments and certificates</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Review private drawing files in Master data and lot certificates
              in Quality → Traceability. This record page does not display
              uploaded files or imply that their contents are approved.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
