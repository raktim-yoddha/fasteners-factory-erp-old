import { useState } from 'react'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import type { CommercialRecords, FeasibilityInput, QuotationAcceptanceInput, QuotationApprovalInput, QuotationInput } from '@/features/sales/useCommercialWorkflow'
import { formatCommandError } from '@/lib/commandError'

type CommercialWorkflowPanelProps = {
  companyId: string | null
  items: MasterDataOptions['items']
  records: CommercialRecords
  busy: boolean
  onFeasibility: (input: FeasibilityInput) => Promise<void>
  onQuotation: (input: QuotationInput) => Promise<void>
  onApprove: (input: QuotationApprovalInput) => Promise<void>
  onAccept: (input: QuotationAcceptanceInput) => Promise<void>
}

export function CommercialWorkflowPanel({ companyId, items, records, busy, onFeasibility, onQuotation, onApprove, onAccept }: CommercialWorkflowPanelProps) {
  const [rfqId, setRfqId] = useState('')
  const [feasibilityStatus, setFeasibilityStatus] = useState<FeasibilityInput['status']>('feasible')
  const [conditions, setConditions] = useState('')
  const [quotationRfqId, setQuotationRfqId] = useState('')
  const [quotationNumber, setQuotationNumber] = useState('')
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [approvalId, setApprovalId] = useState('')
  const [acceptanceId, setAcceptanceId] = useState('')
  const [salesOrderNumber, setSalesOrderNumber] = useState('')
  const [customerPoNumber, setCustomerPoNumber] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const reviewableRfqs = records.rfqs.filter((rfq) => ['new', 'awaiting_info', 'review_required'].includes(rfq.status))
  const qualifiedRfqs = records.rfqs.filter((rfq) => rfq.status === 'qualified')
  const draftQuotes = records.quotations.filter((quote) => quote.status === 'draft')
  const approvedQuotes = records.quotations.filter((quote) => quote.status === 'approved')
  const selectedItem = items.find((item) => item.id === itemId)

  async function submit(action: () => Promise<void>, success: string) { try { await action(); setMessage(success) } catch (error) { setMessage(formatCommandError(error, 'the server rejected this commercial action. Check the selected record and try again.')) } }

  return <section className="mt-6 rounded-xl border border-line bg-panel p-5" aria-labelledby="commercial-workflow-title">
    <h3 className="font-bold" id="commercial-workflow-title">Commercial workflow</h3>
    <p className="mt-1 text-sm leading-6 text-muted">Each stage is confirmed by a protected server command. Records stay in their own state until the next command succeeds.</p>
    <div className="mt-5 grid gap-6 xl:grid-cols-2">
      <form className="master-form" onSubmit={(event) => { event.preventDefault(); const rfq = reviewableRfqs.find((candidate) => candidate.id === rfqId); if (companyId && rfq) void submit(() => onFeasibility({ companyId, rfqId, status: feasibilityStatus, conditions, expectedRfqRevision: rfq.revision, idempotencyKey: crypto.randomUUID() }), 'Feasibility review recorded.') }}>
        <h4>1. Record feasibility</h4><label className="form-label">RFQ<select className="form-input" required value={rfqId} onChange={(event) => setRfqId(event.target.value)}><option value="">Select RFQ</option>{reviewableRfqs.map((rfq) => <option key={rfq.id} value={rfq.id}>{rfq.rfq_number} — {rfq.status}</option>)}</select></label><label className="form-label">Result<select className="form-input" value={feasibilityStatus} onChange={(event) => setFeasibilityStatus(event.target.value as FeasibilityInput['status'])}><option value="feasible">Feasible</option><option value="conditional">Conditional</option><option value="info_required">Information required</option><option value="not_feasible">Not feasible</option></select></label><label className="form-label">Conditions or reason<textarea className="form-input min-h-20 py-2" value={conditions} onChange={(event) => setConditions(event.target.value)} /></label><button className="secondary-button" disabled={!companyId || !rfqId || busy} type="submit">Record feasibility</button>
      </form>
      <form className="master-form" onSubmit={(event) => { event.preventDefault(); if (companyId && quotationRfqId && selectedItem) void submit(() => onQuotation({ companyId, rfqId: quotationRfqId, quotationNumber, currencyCode: 'INR', validUntil: new Date().toISOString().slice(0, 10), itemId, quantity, uom: selectedItem.base_uom, unitPrice, idempotencyKey: crypto.randomUUID() }), 'Quotation created as draft.') }}>
        <h4>2. Create quotation</h4><label className="form-label">Qualified RFQ<select className="form-input" required value={quotationRfqId} onChange={(event) => setQuotationRfqId(event.target.value)}><option value="">Select qualified RFQ</option>{qualifiedRfqs.map((rfq) => <option key={rfq.id} value={rfq.id}>{rfq.rfq_number}</option>)}</select></label><label className="form-label">Quotation number<input className="form-input" required value={quotationNumber} onChange={(event) => setQuotationNumber(event.target.value)} /></label><label className="form-label">Item<select className="form-input" required value={itemId} onChange={(event) => setItemId(event.target.value)}><option value="">Select item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.sku} — {item.description}</option>)}</select></label><label className="form-label">Quantity<input className="form-input" required inputMode="decimal" min="0.000001" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="form-label">Unit price (INR)<input className="form-input" required inputMode="decimal" min="0" type="number" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></label><button className="secondary-button" disabled={!companyId || !quotationRfqId || !selectedItem || busy} type="submit">Create quotation</button>
      </form>
      <form className="master-form" onSubmit={(event) => { event.preventDefault(); const quote = draftQuotes.find((candidate) => candidate.id === approvalId); if (companyId && quote) void submit(() => onApprove({ companyId, quotationId: quote.id, expectedRevision: quote.revision, idempotencyKey: crypto.randomUUID() }), 'Quotation approved.') }}>
        <h4>3. Approve quotation</h4><label className="form-label">Draft quotation<select className="form-input" required value={approvalId} onChange={(event) => setApprovalId(event.target.value)}><option value="">Select draft quotation</option>{draftQuotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.quotation_number}</option>)}</select></label><button className="secondary-button" disabled={!companyId || !approvalId || busy} type="submit">Approve quotation</button>
      </form>
      <form className="master-form" onSubmit={(event) => { event.preventDefault(); const quote = approvedQuotes.find((candidate) => candidate.id === acceptanceId); if (companyId && quote) void submit(() => onAccept({ companyId, quotationId: quote.id, salesOrderNumber, customerPoNumber, promisedDate: new Date().toISOString().slice(0, 10), expectedQuotationRevision: quote.revision, idempotencyKey: crypto.randomUUID() }), 'Sales order created.') }}>
        <h4>4. Accept into sales order</h4><label className="form-label">Approved quotation<select className="form-input" required value={acceptanceId} onChange={(event) => setAcceptanceId(event.target.value)}><option value="">Select approved quotation</option>{approvedQuotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.quotation_number}</option>)}</select></label><label className="form-label">Sales order number<input className="form-input" required value={salesOrderNumber} onChange={(event) => setSalesOrderNumber(event.target.value)} /></label><label className="form-label">Customer PO number<input className="form-input" required value={customerPoNumber} onChange={(event) => setCustomerPoNumber(event.target.value)} /></label><button className="primary-button" disabled={!companyId || !acceptanceId || busy} type="submit">Create sales order</button>
      </form>
    </div>
    {message ? <p className={message.startsWith('Blocked because') ? 'mt-4 rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning' : 'mt-4 rounded-lg border border-line bg-canvas p-3 text-sm'} role={message.startsWith('Blocked because') ? 'alert' : 'status'}>{message}</p> : null}
  </section>
}
