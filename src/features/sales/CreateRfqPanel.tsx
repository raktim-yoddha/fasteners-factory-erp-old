import { useState } from 'react'
import type { CustomerOption } from '@/features/sales/useCustomers'
import type { CreateRfqInput } from '@/features/sales/useCreateRfq'
import { positiveDecimalSchema } from '@/lib/decimal'

type CreateRfqPanelProps = {
  companyId: string | null
  customers: CustomerOption[]
  creating: boolean
  error: string | null
  onCreate: (input: CreateRfqInput) => void
}

export function CreateRfqPanel({
  companyId,
  customers,
  creating,
  error,
  onCreate,
}: CreateRfqPanelProps) {
  const [rfqNumber, setRfqNumber] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [requirementSummary, setRequirementSummary] = useState('')
  const [requestedDescription, setRequestedDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [requiredBy, setRequiredBy] = useState('')
  const [additionalLines, setAdditionalLines] = useState<
    CreateRfqInput['line'][]
  >([])
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
      ...(additionalLines.length ? { additionalLines } : {}),
      line: {
        requestedDescription,
        quantity,
        uom,
        ...(requiredBy ? { requiredBy } : {}),
      },
    })
  }

  return (
    <section
      className="mt-6 rounded-xl border border-line bg-panel p-5"
      aria-labelledby="rfq-title"
    >
      <h3 className="font-bold" id="rfq-title">
        Create RFQ
      </h3>
      <p className="mt-1 text-sm leading-6 text-muted">
        Create one enquiry with its requested lines. Records appear after the
        active workspace confirms the transaction.
      </p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className="form-label">
          RFQ number
          <input
            className="form-input"
            required
            value={rfqNumber}
            onChange={(event) => setRfqNumber(event.target.value)}
          />
        </label>
        <label className="form-label">
          Customer
          <select
            aria-label="Customer"
            className="form-input"
            required
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.code} — {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label sm:col-span-2">
          Requirement summary
          <textarea
            className="form-input min-h-24 py-2"
            required
            value={requirementSummary}
            onChange={(event) => setRequirementSummary(event.target.value)}
          />
        </label>
        <label className="form-label">
          Requested line
          <input
            className="form-input"
            required
            value={requestedDescription}
            onChange={(event) => setRequestedDescription(event.target.value)}
          />
        </label>
        <label className="form-label">
          Quantity
          <input
            className="form-input"
            inputMode="decimal"
            min="0.000001"
            required
            step="any"
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label className="form-label">
          Unit
          <select
            aria-label="Unit"
            className="form-input"
            value={uom}
            onChange={(event) =>
              setUom(event.target.value as CreateRfqInput['line']['uom'])
            }
          >
            <option value="pcs">Pieces</option>
            <option value="kg">Kilograms</option>
            <option value="m">Metres</option>
            <option value="set">Sets</option>
          </select>
        </label>
        <div className="flex items-end sm:col-span-2">
          <label className="form-label mr-4">
            Target date
            <input
              className="form-input"
              type="date"
              value={requiredBy}
              onChange={(event) => setRequiredBy(event.target.value)}
            />
          </label>
          <button
            className="primary-button"
            disabled={!companyId || customers.length === 0 || creating}
            type="submit"
          >
            {creating ? 'Creating RFQ…' : 'Create RFQ'}
          </button>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={
            !requestedDescription.trim() ||
            !positiveDecimalSchema.safeParse(quantity).success
          }
          onClick={() => {
            setAdditionalLines([
              ...additionalLines,
              {
                requestedDescription,
                quantity,
                uom,
                requiredBy: requiredBy || null,
              },
            ])
            setRequestedDescription('')
            setQuantity('')
          }}
        >
          Add another requested line
        </button>
        {additionalLines.length ? (
          <ul className="sm:col-span-2">
            {additionalLines.map((line, index) => (
              <li key={index}>
                {line.requestedDescription} — {String(line.quantity)} {line.uom}
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
                  Remove line {index + 1}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
      {error ? (
        <p
          className="mt-4 rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  )
}
