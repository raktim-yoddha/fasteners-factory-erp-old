import { useState } from 'react'
import type { CustomerOption } from '@/features/sales/useCustomers'
import type { CreateRfqInput } from '@/features/sales/useCreateRfq'

type CreateRfqPanelProps = {
  companyId: string | null
  customers: CustomerOption[]
  creating: boolean
  error: string | null
  onCreate: (input: CreateRfqInput) => void
}

export function CreateRfqPanel({ companyId, customers, creating, error, onCreate }: CreateRfqPanelProps) {
  const [rfqNumber, setRfqNumber] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [requirementSummary, setRequirementSummary] = useState('')
  const [requestedDescription, setRequestedDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [uom, setUom] = useState<CreateRfqInput['line']['uom']>('pcs')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!companyId) return
    onCreate({
      companyId,
      rfqNumber,
      customerId,
      requirementSummary,
      idempotencyKey: crypto.randomUUID(),
      line: { requestedDescription, quantity, uom }
    })
  }

  return (
    <section className="mt-6 rounded-xl border border-line bg-panel p-5" aria-labelledby="rfq-title">
      <h3 className="font-bold" id="rfq-title">Create RFQ</h3>
      <p className="mt-1 text-sm leading-6 text-muted">This creates one enquiry and one initial requested line. The server confirms the result before it appears in operations.</p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className="form-label">RFQ number
          <input className="form-input" required value={rfqNumber} onChange={(event) => setRfqNumber(event.target.value)} />
        </label>
        <label className="form-label">Customer
          <select className="form-input" required value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}
          </select>
        </label>
        <label className="form-label sm:col-span-2">Requirement summary
          <textarea className="form-input min-h-24 py-2" required value={requirementSummary} onChange={(event) => setRequirementSummary(event.target.value)} />
        </label>
        <label className="form-label">Requested line
          <input className="form-input" required value={requestedDescription} onChange={(event) => setRequestedDescription(event.target.value)} />
        </label>
        <label className="form-label">Quantity
          <input className="form-input" inputMode="decimal" min="0.000001" required type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </label>
        <label className="form-label">Unit
          <select className="form-input" value={uom} onChange={(event) => setUom(event.target.value as CreateRfqInput['line']['uom'])}>
            <option value="pcs">Pieces</option>
            <option value="kg">Kilograms</option>
            <option value="m">Metres</option>
            <option value="set">Sets</option>
          </select>
        </label>
        <div className="flex items-end sm:col-span-2">
          <button className="primary-button" disabled={!companyId || customers.length === 0 || creating} type="submit">
            {creating ? 'Creating RFQ…' : 'Create RFQ'}
          </button>
        </div>
      </form>
      {error ? <p className="mt-4 rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning" role="alert">{error}</p> : null}
    </section>
  )
}
