import { useState } from 'react'
import type { CommercialRecords } from './useCommercialWorkflow'
import type { CustomerOption } from './useCustomers'
import type { CommercialDetail } from './useCommercialDetail'
import { plantDate, plantTimestamp } from '@/lib/decimal'

type Props = {
  records: CommercialRecords
  customers: CustomerOption[]
  selectedId: string | null
  currentUserId: string
  loading: boolean
  error: boolean
  detail?: CommercialDetail
  detailLoading: boolean
  detailError: boolean
  onSelect: (id: string) => void
}

export function CommercialInbox({
  records,
  customers,
  selectedId,
  currentUserId,
  loading,
  error,
  detail,
  detailLoading,
  detailError,
  onSelect,
}: Props) {
  const [query, setQuery] = useState('')
  const [customer, setCustomer] = useState('')
  const [state, setState] = useState('')
  const [due, setDue] = useState('')
  const [mine, setMine] = useState(false)
  const [age, setAge] = useState('')
  const today = plantDate()
  const rows = records.rfqs.filter(
    (rfq) =>
      (!customer || rfq.customer_id === customer) &&
      (!state || rfq.status === state) &&
      (!mine || rfq.created_by === currentUserId) &&
      (!due ||
        Boolean(
          rfq.due_date &&
          (due === 'overdue' ? rfq.due_date < today : rfq.due_date === today),
        )) &&
      (!age ||
        Boolean(
          rfq.created_at &&
          Date.parse(today) - Date.parse(rfq.created_at.slice(0, 10)) >=
            Number(age) * 86_400_000,
        )) &&
      `${rfq.rfq_number} ${rfq.requirement_summary ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  const selected = records.rfqs.find((rfq) => rfq.id === selectedId)
  return (
    <section className="record-panel" aria-labelledby="inbox-title">
      <h3 id="inbox-title" className="font-bold">
        RFQ inbox
      </h3>
      <div className="filter-bar">
        <label className="form-label">
          Find enquiry
          <input
            className="form-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Number or requirement"
          />
        </label>
        <label className="form-label">
          Filter customer
          <select
            aria-label="Filter customer"
            className="form-input"
            value={customer}
            onChange={(event) => setCustomer(event.target.value)}
          >
            <option value="">All customers</option>
            {customers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          Feasibility state
          <select
            aria-label="Feasibility state"
            className="form-input"
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="">All states</option>
            <option value="new">New</option>
            <option value="awaiting_info">Missing information</option>
            <option value="review_required">Review required</option>
            <option value="qualified">Qualified</option>
            <option value="lost">Not feasible / lost</option>
          </select>
        </label>
        <label className="form-label">
          Due date
          <select
            aria-label="Due date"
            className="form-input"
            value={due}
            onChange={(event) => setDue(event.target.value)}
          >
            <option value="">Any date</option>
            <option value="today">Due today</option>
            <option value="overdue">Overdue</option>
          </select>
        </label>
        <label className="form-label">
          Enquiry age
          <select
            aria-label="Enquiry age"
            className="form-input"
            value={age}
            onChange={(event) => setAge(event.target.value)}
          >
            <option value="">Any age</option>
            <option value="7">7 days or older</option>
            <option value="30">30 days or older</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={mine}
            onChange={(event) => setMine(event.target.checked)}
          />
          Created by me
        </label>
      </div>
      {loading ? (
        <p role="status">Loading enquiries…</p>
      ) : error ? (
        <p role="alert">
          Blocked because enquiries could not be loaded. Retry or check company
          access.
        </p>
      ) : rows.length === 0 ? (
        <p className="empty-state">
          No matching enquiries. Clear filters or create an RFQ below.
        </p>
      ) : (
        <ul className="record-list" aria-label="Enquiries">
          {rows.map((rfq) => (
            <li key={rfq.id}>
              <button
                className="record-list-button"
                type="button"
                aria-pressed={rfq.id === selectedId}
                onClick={() => onSelect(rfq.id)}
              >
                <strong>{rfq.rfq_number}</strong>
                <span>
                  {customers.find((entry) => entry.id === rfq.customer_id)
                    ?.name ?? 'Customer unavailable'}
                </span>
                <span>
                  ◇ {rfq.status.replaceAll('_', ' ')} · Due{' '}
                  {rfq.due_date ?? 'not set'}
                </span>
                {rfq.status === 'awaiting_info' ? (
                  <span>
                    Blocked because information is required. Open to review
                    questions.
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <article
          className="detail-summary"
          aria-labelledby="selected-rfq-title"
        >
          <h4 id="selected-rfq-title" className="font-bold">
            {selected.rfq_number} — request detail
          </h4>
          <p>{selected.requirement_summary}</p>
          <p className="text-sm text-muted">
            Created{' '}
            {selected.created_at
              ? plantTimestamp(selected.created_at)
              : 'not recorded'}{' '}
            · Owner:{' '}
            {selected.created_by === currentUserId
              ? 'You'
              : 'Another permitted operator'}
          </p>
          {detailLoading ? (
            <p role="status">Loading request lines…</p>
          ) : detailError ? (
            <p role="alert">
              Blocked because request details could not be loaded.
            </p>
          ) : (
            <>
              <ul>
                {detail?.lines.map((line) => (
                  <li key={line.id}>
                    {line.requested_description} — {line.quantity} {line.uom} ·
                    Target {line.required_by ?? 'not set'}
                  </li>
                ))}
              </ul>
              <p>
                <strong>Feasibility:</strong>{' '}
                {detail?.review?.status.replaceAll('_', ' ') ?? 'Not reviewed'}
                {detail?.review?.conditions
                  ? ` · ${detail.review.conditions}`
                  : ''}
              </p>
            </>
          )}
        </article>
      ) : null}
    </section>
  )
}
