import { useState } from 'react'
import type { MasterDataOptions } from './useMasterDataOptions'
import type { CreateMasterDataCommand } from './useCreateMasterData'
import type { ProcurementRecords } from '@/features/procurement/useProcurement'
import { CommandFeedback } from '@/components/CommandFeedback'
import { formatCommandError } from '@/lib/commandError'

type Props = {
  companyId: string | null
  options: MasterDataOptions
  suppliers: ProcurementRecords['suppliers']
  canManage: boolean
  busy: boolean
  onCreate: (command: CreateMasterDataCommand) => Promise<void>
}
export function MaterialDetailsPanel({
  companyId,
  options,
  suppliers,
  canManage,
  busy,
  onCreate,
}: Props) {
  const [itemId, setItemId] = useState(''),
    [supplierId, setSupplierId] = useState(''),
    [message, setMessage] = useState<string | null>(null)
  const item = options.items.find((entry) => entry.id === itemId),
    supplier = suppliers.find((entry) => entry.id === supplierId)
  async function save(command: CreateMasterDataCommand) {
    try {
      await onCreate(command)
      setMessage('Master details confirmed.')
    } catch (cause) {
      setMessage(
        formatCommandError(cause, 'the master details could not be saved.'),
      )
    }
  }
  return (
    <section className="record-panel" aria-labelledby="material-details-title">
      <h3 className="font-bold" id="material-details-title">
        Material and supplier details
      </h3>
      <p className="empty-state">
        Record verified specifications and requirements. Blank means not
        recorded. Controlled specifications and approved conversion bases are managed in Master data → Specifications and units.
      </p>
      <label className="form-label">
        Material master
        <select
          aria-label="Material master"
          className="form-input"
          value={itemId}
          onChange={(event) => setItemId(event.target.value)}
        >
          <option value="">Select material</option>
          {options.items.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.sku} — {entry.description}
            </option>
          ))}
        </select>
      </label>
      {item ? (
        <form
          key={item.id}
          className="master-form mt-3"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget),
              value = (name: string) => String(data.get(name) ?? '')
            if (companyId)
              void save({
                kind: 'materialDetails',
                companyId,
                itemId: item.id,
                specification: value('specification'),
                grade: value('grade'),
                dimensions: value('dimensions'),
                storageRequirements: value('storage'),
                reorderQuantity: value('reorder'),
                preferredSupplierId: value('supplier') || null,
              })
          }}
        >
          <fieldset
            className="grid gap-3 border-0 p-0"
            disabled={!canManage || busy}
          >
            <p>Base unit: {item.base_uom}. No automatic conversion.</p>
            {(
              [
                ['specification', 'Specification', item.specification],
                ['grade', 'Grade', item.grade],
                ['dimensions', 'Dimensions (include units)', item.dimensions],
                ['storage', 'Storage requirements', item.storage_requirements],
                [
                  'reorder',
                  `Reorder quantity (${item.base_uom}) — if verified`,
                  item.reorder_quantity,
                ],
              ] as const
            ).map(([name, label, value]) => (
              <label key={name} className="form-label">
                {label}
                <input
                  className="form-input"
                  name={name}
                  defaultValue={value ?? ''}
                />
              </label>
            ))}
            <label className="form-label">
              Preferred supplier
              <select
                aria-label="Preferred supplier"
                className="form-input"
                name="supplier"
                defaultValue={item.preferred_supplier_id ?? ''}
              >
                <option value="">Not specified</option>
                {suppliers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button" type="submit">
              Save material details
            </button>
          </fieldset>
        </form>
      ) : null}
      <label className="form-label mt-4">
        Supplier master
        <select
          aria-label="Supplier master"
          className="form-input"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        >
          <option value="">Select supplier</option>
          {suppliers.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.code} — {entry.name}
            </option>
          ))}
        </select>
      </label>
      {supplier ? (
        <form
          key={supplier.id}
          className="master-form mt-3"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            if (companyId)
              void save({
                kind: 'supplierDetails',
                companyId,
                supplierId: supplier.id,
                qualificationNote: String(data.get('qualification') ?? ''),
                certificateRequirements: String(data.get('certificate') ?? ''),
              })
          }}
        >
          <fieldset
            className="grid gap-3 border-0 p-0"
            disabled={!canManage || busy}
          >
            <label className="form-label">
              Recorded qualification evidence
              <textarea
                className="form-input py-2"
                name="qualification"
                defaultValue={supplier.qualification_note ?? ''}
              />
            </label>
            <label className="form-label">
              Recorded certificate requirements
              <textarea
                className="form-input py-2"
                name="certificate"
                defaultValue={supplier.certificate_requirements ?? ''}
              />
            </label>
            <button className="secondary-button" type="submit">
              Save supplier requirements
            </button>
          </fieldset>
        </form>
      ) : null}
      {!canManage ? (
        <p className="empty-state">
          Read-only. Ask a master-data owner to change requirements.
        </p>
      ) : null}
      <CommandFeedback message={message} />
    </section>
  )
}
