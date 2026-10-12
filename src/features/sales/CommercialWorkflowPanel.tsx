import { useState } from 'react'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import type { EngineeringRevisionOptions } from '@/features/sales/useEngineeringRevisionOptions'
import type {
  CommercialRecords,
  FeasibilityInput,
  QuotationAcceptanceInput,
  QuotationApprovalInput,
  QuotationInput,
} from '@/features/sales/useCommercialWorkflow'
import { formatCommandError } from '@/lib/commandError'
import { CommandFeedback } from '@/components/CommandFeedback'
import { RevisionSummary } from '@/components/RevisionSummary'
import { positiveDecimalSchema, priceSchema, plantDate } from '@/lib/decimal'
import type { CommercialDetail } from './useCommercialDetail'
import { CustomerPartSummary } from '@/components/CustomerPartSummary'
import type { CustomerPart } from '@/features/master-data/useCustomerParts'
import type { ItemSpecification } from '@/features/master-data/useItemControls'
import { ItemSpecificationSummary } from '@/components/ItemSpecificationSummary'

type CommercialWorkflowPanelProps = {
  companyId: string | null
  items: MasterDataOptions['items']
  engineering: EngineeringRevisionOptions
  records: CommercialRecords
  focusedRfqId?: string | null
  onLoadRfq?: (id: string) => void
  permissions?: string[]
  detail?: CommercialDetail
  onPrint?: () => void
  customerParts?: CustomerPart[]
  specifications?: ItemSpecification[]
  busy: boolean
  onFeasibility: (input: FeasibilityInput) => Promise<void>
  onQuotation: (input: QuotationInput) => Promise<void>
  onApprove: (input: QuotationApprovalInput) => Promise<void>
  onAccept: (input: QuotationAcceptanceInput) => Promise<void>
}

export function CommercialWorkflowPanel({
  companyId,
  items,
  engineering,
  records,
  busy,
  focusedRfqId,
  detail,
  onLoadRfq,
  permissions,
  onPrint,
  customerParts = [],
  specifications = [],
  onFeasibility,
  onQuotation,
  onApprove,
  onAccept,
}: CommercialWorkflowPanelProps) {
  const [additionalLines, setAdditionalLines] = useState<
    NonNullable<QuotationInput['additionalLines']>
  >([])
  const [step, setStep] = useState('feasibility')
  const [validUntil, setValidUntil] = useState(plantDate())
  const [promisedDate, setPromisedDate] = useState(plantDate())
  const [currency, setCurrency] = useState('INR')
  const [pricingSource, setPricingSource] = useState('')
  const [rfqId, setRfqId] = useState(focusedRfqId ?? '')
  const [feasibilityLineId, setFeasibilityLineId] = useState('')
  const [feasibilityItemId, setFeasibilityItemId] = useState('')
  const [quotationLineId, setQuotationLineId] = useState('')
  const [feasibilityStatus, setFeasibilityStatus] =
    useState<FeasibilityInput['status']>('feasible')
  const [conditions, setConditions] = useState('')
  const [drawingRevisionId, setDrawingRevisionId] = useState('')
  const [feasibilityBomRevisionId, setFeasibilityBomRevisionId] = useState('')
  const [feasibilityRoutingRevisionId, setFeasibilityRoutingRevisionId] =
    useState('')
  const [quotationRfqId, setQuotationRfqId] = useState(focusedRfqId ?? '')
  const [quotationNumber, setQuotationNumber] = useState('')
  const [itemId, setItemId] = useState('')
  const [customerPartId, setCustomerPartId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [quotationBomRevisionId, setQuotationBomRevisionId] = useState('')
  const [quotationRoutingRevisionId, setQuotationRoutingRevisionId] =
    useState('')
  const [approvalId, setApprovalId] = useState('')
  const [acceptanceId, setAcceptanceId] = useState('')
  const [salesOrderNumber, setSalesOrderNumber] = useState('')
  const [customerPoNumber, setCustomerPoNumber] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const reviewableRfqs = records.rfqs.filter((rfq) =>
    ['new', 'awaiting_info', 'review_required', 'qualified'].includes(rfq.status),
  )
  const qualifiedRfqs = records.rfqs.filter((rfq) => rfq.status === 'qualified')
  const draftQuotes = records.quotations.filter(
    (quote) => quote.status === 'draft',
  )
  const approvedQuotes = records.quotations.filter(
    (quote) => quote.status === 'approved',
  )
  const selectedItem = items.find((item) => item.id === itemId)
  const itemBomRevisions = engineering.boms.filter(
    (revision) => revision.itemId === itemId,
  )
  const itemRoutingRevisions = engineering.routings.filter(
    (revision) => revision.itemId === itemId,
  )

  const review = quotationLineId ? detail?.lineReviews?.find((row) => row.rfq_line_id === quotationLineId) : detail?.review
  const lineBlocked = Boolean(detail?.lineReviews?.length && (!quotationLineId || !review || !['feasible','conditional'].includes(review.status) || ('item_id' in review && review.item_id !== itemId)))
  const quoteCustomerId = records.rfqs.find((row) => row.id === quotationRfqId)?.customer_id
  const eligibleParts = customerParts.filter((row) => !row.retired_at && row.customer_id === quoteCustomerId && row.item_id === itemId && (!row.drawing_revision_id || row.drawing_revision_id === review?.drawing_revision_id))
  const partBlocked = Boolean(customerPartId && !eligibleParts.some((row) => row.id === customerPartId))
  const reviewLines =
    detail?.quoteLines.filter(
      (line) =>
        line.quotation_id === (step === 'approval' ? approvalId : acceptanceId),
    ) ?? []
  const permitted =
    !permissions ||
    permissions.includes(
      step === 'feasibility'
        ? 'engineering.feasibility.manage'
        : step === 'approval'
          ? 'quotation.approve'
          : 'sales.manage',
    )

  async function submit(action: () => Promise<void>, success: string) {
    try {
      await action()
      setMessage(success)
    } catch (error) {
      setMessage(
        formatCommandError(
          error,
          'the server rejected this commercial action. Check the selected record and try again.',
        ),
      )
    }
  }

  return (
    <section
      className="mt-6 rounded-xl border border-line bg-panel p-5"
      aria-labelledby="commercial-workflow-title"
    >
      <h3 className="font-bold" id="commercial-workflow-title">
        Commercial workflow
      </h3>
      <p className="mt-1 text-sm leading-6 text-muted">
        Each stage is confirmed by a protected server command. Records stay in
        their own state until the next command succeeds.
      </p>
      <div className="workflow-switch" aria-label="Commercial steps">
        {[
          ['feasibility', 'Feasibility'],
          ['quotation', 'Quotation'],
          ['approval', 'Approval'],
          ['acceptance', 'Order acceptance'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={step === value ? 'nav-item nav-item-active' : 'nav-item'}
            aria-pressed={step === value}
            onClick={() => setStep(value!)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-6">
        {step === 'feasibility' ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              const rfq = reviewableRfqs.find(
                (candidate) => candidate.id === rfqId,
              )
              if (companyId && rfq)
                void submit(
                  () =>
                    onFeasibility({
                      companyId,
                      rfqId,
                      rfqLineId: feasibilityLineId || undefined,
                      itemId: feasibilityItemId || undefined,
                      status: feasibilityStatus,
                      drawingRevisionId: drawingRevisionId || null,
                      bomRevisionId: feasibilityBomRevisionId || null,
                      routingRevisionId: feasibilityRoutingRevisionId || null,
                      conditions,
                      expectedRfqRevision: rfq.revision,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  'Feasibility review recorded.',
                )
            }}
          >
            <h4>1. Record feasibility</h4>
            <label className="form-label">
              RFQ
              <select
                aria-label="RFQ"
                className="form-input"
                required
                value={rfqId}
                onChange={(event) => { setRfqId(event.target.value); setFeasibilityLineId(''); setFeasibilityItemId(''); onLoadRfq?.(event.target.value) }}
              >
                <option value="">Select RFQ</option>
                {reviewableRfqs.map((rfq) => (
                  <option key={rfq.id} value={rfq.id}>
                    {rfq.rfq_number} — {rfq.status}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">Feasibility scope<select aria-label="Feasibility scope" className="form-input" value={feasibilityLineId} onChange={(event) => { setFeasibilityLineId(event.target.value); setFeasibilityItemId(detail?.lines.find((row) => row.id === event.target.value)?.item_id ?? ''); setDrawingRevisionId(''); setFeasibilityBomRevisionId(''); setFeasibilityRoutingRevisionId('') }}>
              <option value="">Entire RFQ (same item only)</option>{detail?.lines.map((row,index) => <option key={row.id} value={row.id}>Line {index+1} · {row.requested_description} · {row.quantity} {row.uom}</option>)}
            </select></label>
            {feasibilityLineId && <label className="form-label">Feasibility factory item<select aria-label="Feasibility factory item" className="form-input" value={feasibilityItemId} onChange={(event) => setFeasibilityItemId(event.target.value)} required={['feasible','conditional'].includes(feasibilityStatus)}>
              <option value="">Unresolved item</option>{items.filter((row) => !detail?.lines.find((line) => line.id === feasibilityLineId)?.item_id || detail?.lines.find((line) => line.id === feasibilityLineId)?.item_id === row.id).map((row) => <option key={row.id} value={row.id}>{row.sku} — {row.description}</option>)}
            </select></label>}
            <label className="form-label">
              Result
              <select
                aria-label="Result"
                className="form-input"
                value={feasibilityStatus}
                onChange={(event) =>
                  setFeasibilityStatus(
                    event.target.value as FeasibilityInput['status'],
                  )
                }
              >
                <option value="feasible">Feasible</option>
                <option value="conditional">Conditional</option>
                <option value="info_required">Information required</option>
                <option value="not_feasible">Not feasible</option>
              </select>
            </label>
            <label className="form-label">
              Drawing revision
              <select
                aria-label="Drawing revision"
                className="form-input"
                value={drawingRevisionId}
                onChange={(event) => setDrawingRevisionId(event.target.value)}
              >
                <option value="">None</option>
                {engineering.drawings.map((revision) => (
                  <option key={revision.id} value={revision.id}>
                    {revision.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              BOM revision
              <select
                aria-label="BOM revision"
                className="form-input"
                value={feasibilityBomRevisionId}
                onChange={(event) =>
                  setFeasibilityBomRevisionId(event.target.value)
                }
              >
                <option value="">None</option>
                {engineering.boms.map((revision) => (
                  <option key={revision.id} value={revision.id}>
                    {revision.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Routing revision
              <select
                aria-label="Routing revision"
                className="form-input"
                value={feasibilityRoutingRevisionId}
                onChange={(event) =>
                  setFeasibilityRoutingRevisionId(event.target.value)
                }
              >
                <option value="">None</option>
                {engineering.routings.map((revision) => (
                  <option key={revision.id} value={revision.id}>
                    {revision.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Conditions or reason
              <textarea
                className="form-input min-h-20 py-2"
                required={feasibilityStatus !== 'feasible'}
                maxLength={2000}
                value={conditions}
                onChange={(event) => setConditions(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              disabled={!permitted || !companyId || !rfqId || busy}
              type="submit"
            >
              Record feasibility
            </button>
          </form>
        ) : null}
        {step === 'quotation' ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (companyId && quotationRfqId && selectedItem && !partBlocked && !lineBlocked)
                void submit(
                  () =>
                    onQuotation({
                      companyId,
                      rfqId: quotationRfqId,
                      quotationNumber,
                      currencyCode: currency,
                      validUntil,
                      itemId,
                      bomRevisionId:
                        review?.bom_revision_id ||
                        quotationBomRevisionId ||
                        null,
                      routingRevisionId:
                        review?.routing_revision_id ||
                        quotationRoutingRevisionId ||
                        null,
                      quantity,
                      uom: selectedItem.base_uom,
                      unitPrice,
                      pricingSource,
                      customerPartReferenceId: customerPartId || null,
                      rfqLineId: quotationLineId || undefined,
                      additionalLines,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  'Quotation created as draft.',
                )
            }}
          >
            <h4>2. Create quotation</h4>
            <p className="text-sm text-muted">
              Blocked until an RFQ is qualified. Pricing is operator-entered and
              requires approval.
            </p>
            <RevisionSummary
              engineering={engineering}
              drawingId={review?.drawing_revision_id}
              bomId={review?.bom_revision_id || quotationBomRevisionId}
              routingId={
                review?.routing_revision_id || quotationRoutingRevisionId
              }
            />
            <label className="form-label">
              Valid until
              <input
                className="form-input"
                required
                type="date"
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
              />
            </label>
            <label className="form-label">
              Currency
              <input
                className="form-input"
                required
                pattern="[A-Z]{3}"
                maxLength={3}
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value.toUpperCase())
                }
              />
            </label>
            <label className="form-label">
              Pricing source
              <input
                className="form-input"
                required
                placeholder="Reviewed price list or manual quotation basis"
                value={pricingSource}
                onChange={(event) => setPricingSource(event.target.value)}
              />
            </label>
            <label className="form-label">
              Qualified RFQ
              <select
                aria-label="Qualified RFQ"
                className="form-input"
                required
                value={quotationRfqId}
                onChange={(event) => {
                  setQuotationRfqId(event.target.value)
                  setCustomerPartId('')
                  setAdditionalLines([])
                  setQuotationLineId('')
                  onLoadRfq?.(event.target.value)
                }}
              >
                <option value="">Select qualified RFQ</option>
                {qualifiedRfqs.map((rfq) => (
                  <option key={rfq.id} value={rfq.id}>
                    {rfq.rfq_number}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Quotation number
              <input
                className="form-input"
                required
                value={quotationNumber}
                onChange={(event) => setQuotationNumber(event.target.value)}
              />
            </label>
            {Boolean(detail?.lineReviews?.length) && <label className="form-label">Qualified enquiry line<select aria-label="Qualified enquiry line" className="form-input" value={quotationLineId} required onChange={(event) => {
              setQuotationLineId(event.target.value); setItemId(detail?.lineReviews?.find((row) => row.rfq_line_id === event.target.value)?.item_id ?? ''); setCustomerPartId(''); setQuotationBomRevisionId(''); setQuotationRoutingRevisionId('')
            }}><option value="">Select reviewed line</option>{detail?.lines.filter((row) => detail?.lineReviews?.some((review) => review.rfq_line_id === row.id && ['feasible','conditional'].includes(review.status))).map((row,index) => <option key={row.id} value={row.id}>Line {index+1} · {row.requested_description} · {row.quantity} {row.uom}</option>)}</select></label>}
            {lineBlocked && <p role="alert" className="feedback feedback-blocked">Blocked because this quotation needs a feasible enquiry line matching the selected item.</p>}
            <label className="form-label">
              Item
              <select
                aria-label="Item"
                className="form-input"
                required
                value={itemId}
                onChange={(event) => {
                  setItemId(event.target.value)
                  setCustomerPartId('')
                  setQuotationBomRevisionId('')
                  setQuotationRoutingRevisionId('')
                }}
              >
                <option value="">Select item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} — {item.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Quotation customer part
              <select aria-label="Quotation customer part" className="form-input" value={customerPartId} onChange={(event) => setCustomerPartId(event.target.value)}>
                <option value="">No customer part reference</option>{eligibleParts.map((row) => <option key={row.id} value={row.id}>{row.part_number}{row.part_revision ? ` Rev ${row.part_revision}` : ' · Unversioned'} · Mapping v{row.reference_version}</option>)}
              </select>
            </label>
            <p className="empty-state">References match this RFQ’s customer and factory item. A specified drawing must match the feasibility review. None means no customer part was supplied.</p>
            {partBlocked && <p role="alert" className="feedback feedback-blocked">Blocked because the selected customer reference is retired or does not match this customer, item and drawing. Select an active reference or explicitly choose none.</p>}
            <label className="form-label">
              BOM revision
              <select
                aria-label="BOM revision"
                className="form-input"
                disabled={Boolean(review?.bom_revision_id)}
                value={review?.bom_revision_id ?? quotationBomRevisionId}
                onChange={(event) =>
                  setQuotationBomRevisionId(event.target.value)
                }
              >
                <option value="">None</option>
                {itemBomRevisions.map((revision) => (
                  <option key={revision.id} value={revision.id}>
                    {revision.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Routing revision
              <select
                aria-label="Routing revision"
                className="form-input"
                disabled={Boolean(review?.routing_revision_id)}
                value={
                  review?.routing_revision_id ?? quotationRoutingRevisionId
                }
                onChange={(event) =>
                  setQuotationRoutingRevisionId(event.target.value)
                }
              >
                <option value="">None</option>
                {itemRoutingRevisions.map((revision) => (
                  <option key={revision.id} value={revision.id}>
                    {revision.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Quantity ({selectedItem?.base_uom ?? 'select item'})
              <input
                className="form-input"
                required
                inputMode="decimal"
                min="0.000001"
                step="any"
                type="number"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label className="form-label">
              Unit price ({currency})
              <input
                className="form-input"
                required
                inputMode="decimal"
                min="0"
                step="any"
                type="number"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              type="button"
              disabled={
                !selectedItem ||
                partBlocked ||
                lineBlocked ||
                !positiveDecimalSchema.safeParse(quantity).success ||
                !priceSchema.safeParse(unitPrice).success ||
                !pricingSource.trim()
              }
              onClick={() => {
                if (selectedItem) {
                  setAdditionalLines([
                    ...additionalLines,
                    {
                      itemId,
                      quantity,
                      uom: selectedItem.base_uom,
                      unitPrice,
                      pricingSource,
                      customerPartReferenceId: customerPartId || null,
                      rfqLineId: quotationLineId || undefined,
                      bomRevisionId:
                        review?.bom_revision_id ||
                        quotationBomRevisionId ||
                        null,
                      routingRevisionId:
                        review?.routing_revision_id ||
                        quotationRoutingRevisionId ||
                        null,
                    },
                  ])
                  setQuantity('')
                  setUnitPrice('')
                }
              }}
            >
              Add another quotation line
            </button>
            {additionalLines.length ? (
              <ul>
                {additionalLines.map((line, index) => (
                  <li key={index}>
                    {items.find((item) => item.id === line.itemId)?.sku} —{' '}
                    {String(line.quantity)} {line.uom} ·{' '}
                    {String(line.unitPrice)} {currency}
                    <CustomerPartSummary number={customerParts.find((row) => row.id === line.customerPartReferenceId)?.part_number} revision={customerParts.find((row) => row.id === line.customerPartReferenceId)?.part_revision} />
                    <button
                      className="secondary-button ml-2"
                      type="button"
                      onClick={() =>
                        setAdditionalLines(
                          additionalLines.filter(
                            (_, position) => position !== index,
                          ),
                        )
                      }
                    >
                      Remove quote line {index + 1}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              className="secondary-button"
              disabled={!companyId || !quotationRfqId || !selectedItem || partBlocked || lineBlocked || busy}
              type="submit"
            >
              Create quotation
            </button>
          </form>
        ) : null}
        {step === 'approval' ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              const quote = draftQuotes.find(
                (candidate) => candidate.id === approvalId,
              )
              if (companyId && quote)
                void submit(
                  () =>
                    onApprove({
                      companyId,
                      quotationId: quote.id,
                      expectedRevision: quote.revision,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  'Quotation approved.',
                )
            }}
          >
            <h4>3. Approve quotation</h4>
            <p className="text-sm text-muted">
              Review the quotation lines and pinned revisions below before
              approval. Open its RFQ in the inbox to load them.
            </p>
            <label className="form-label">
              Draft quotation
              <select
                aria-label="Draft quotation"
                className="form-input"
                required
                value={approvalId}
                onChange={(event) => {
                  setApprovalId(event.target.value)
                  const quote = records.quotations.find(
                    (entry) => entry.id === event.target.value,
                  )
                  if (quote) onLoadRfq?.(quote.rfq_id)
                }}
              >
                <option value="">Select draft quotation</option>
                {draftQuotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    {quote.quotation_number}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary-button"
              disabled={
                !companyId ||
                !approvalId ||
                (Boolean(permissions) && !reviewLines.length) ||
                busy
              }
              type="submit"
            >
              Approve quotation
            </button>
          </form>
        ) : null}
        {step === 'acceptance' ? (
          <form
            className="master-form"
            onSubmit={(event) => {
              event.preventDefault()
              const quote = approvedQuotes.find(
                (candidate) => candidate.id === acceptanceId,
              )
              if (companyId && quote)
                void submit(
                  () =>
                    onAccept({
                      companyId,
                      quotationId: quote.id,
                      salesOrderNumber,
                      customerPoNumber,
                      promisedDate,
                      expectedQuotationRevision: quote.revision,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  'Sales order created.',
                )
            }}
          >
            <h4>4. Accept into sales order</h4>
            <p className="text-sm text-muted">
              Acceptance copies the approved quotation lines and exact revision
              IDs. No live master revision is substituted.
            </p>
            <label className="form-label">
              Promised date
              <input
                className="form-input"
                required
                type="date"
                value={promisedDate}
                onChange={(event) => setPromisedDate(event.target.value)}
              />
            </label>
            <label className="form-label">
              Approved quotation
              <select
                aria-label="Approved quotation"
                className="form-input"
                required
                value={acceptanceId}
                onChange={(event) => {
                  setAcceptanceId(event.target.value)
                  const quote = records.quotations.find(
                    (entry) => entry.id === event.target.value,
                  )
                  if (quote) onLoadRfq?.(quote.rfq_id)
                }}
              >
                <option value="">Select approved quotation</option>
                {approvedQuotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    {quote.quotation_number}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Sales order number
              <input
                className="form-input"
                required
                value={salesOrderNumber}
                onChange={(event) => setSalesOrderNumber(event.target.value)}
              />
            </label>
            <label className="form-label">
              Customer PO number
              <input
                className="form-input"
                required
                value={customerPoNumber}
                onChange={(event) => setCustomerPoNumber(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              disabled={
                !companyId ||
                !acceptanceId ||
                (Boolean(permissions) && !reviewLines.length) ||
                busy
              }
              type="submit"
            >
              Create sales order
            </button>
          </form>
        ) : null}
      </div>
      {['approval', 'acceptance'].includes(step) ? (
        <div className="printable-quotation">
          <h4 className="font-bold">Quotation review</h4>
          <p>
            {records.quotations.find(
              (quote) =>
                quote.id === (step === 'approval' ? approvalId : acceptanceId),
            )?.quotation_number ?? 'Select a quotation'}{' '}
            · Valid until{' '}
            {records.quotations.find(
              (quote) =>
                quote.id === (step === 'approval' ? approvalId : acceptanceId),
            )?.valid_until ?? 'not recorded'}
          </p>
          {reviewLines.length === 0 ? (
            <p className="empty-state">
              Open the matching RFQ in the inbox to review quotation lines.
            </p>
          ) : (
            reviewLines.map((line) => (
              <article className="detail-summary" key={line.id}>
                <p>
                  {items.find((item) => item.id === line.item_id)
                    ?.description ?? 'Item unavailable'}{' '}
                  — {line.quantity} {line.uom} · Unit price {line.unit_price}{' '}
                  {
                    records.quotations.find(
                      (quote) => quote.id === line.quotation_id,
                    )?.currency_code
                  }
                </p>
                <p>Price source: {line.pricing_source}</p>
                <CustomerPartSummary number={customerParts.find((row) => row.id === line.customer_part_reference_id)?.part_number} revision={customerParts.find((row) => row.id === line.customer_part_reference_id)?.part_revision} />
                {line.item_specification_id && <ItemSpecificationSummary specification={specifications.find((row) => row.id === line.item_specification_id)} />}
                <RevisionSummary
                  engineering={engineering}
                  drawingId={line.drawing_revision_id}
                  bomId={line.bom_revision_id}
                  routingId={line.routing_revision_id}
                />
              </article>
            ))
          )}
          {step === 'acceptance' && reviewLines.length > 0 && acceptanceId ? (
            <button
              className="secondary-button no-print"
              type="button"
              onClick={onPrint}
            >
              Print approved quotation
            </button>
          ) : null}
        </div>
      ) : null}
      <CommandFeedback message={message} />
    </section>
  )
}
