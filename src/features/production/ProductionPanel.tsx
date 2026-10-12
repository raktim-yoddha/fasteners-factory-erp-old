import { useState, type ReactNode } from 'react'
import { DrawingFileSummary } from './DrawingFilesPanel'
import { CustomerPartSummary } from '@/components/CustomerPartSummary'
import { ItemSpecificationSummary } from '@/components/ItemSpecificationSummary'
import type { ItemSpecification } from '@/features/master-data/useItemControls'
import type { DrawingWorkspace } from './useDrawingWorkspace'
import { ActionForm } from '@/components/ActionForm'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import type { StockLot } from '@/features/stock/useStockLots'
import type { StockPosition } from '@/features/stock/useStockExplorer'
import type {
  ProductionCommand,
  ProductionWorkspace,
} from './useProductionWorkspace'
import { CommandFeedback } from '@/components/CommandFeedback'
import { RevisionSummary } from '@/components/RevisionSummary'
import { StockBalanceSummary } from '@/components/StockBalanceSummary'
import { formatCommandError } from '@/lib/commandError'
import { plantDate } from '@/lib/decimal'

type Props = {
  companyId: string | null
  data: ProductionWorkspace | undefined
  options: MasterDataOptions
  lots: StockLot[]
  positions: StockPosition[]
  permissions: string[]
  online: boolean
  busy: boolean
  loading: boolean
  error: boolean
  onCommand: (command: ProductionCommand) => Promise<string>
  drawingPanel?: ReactNode
  drawingData?: DrawingWorkspace
  specifications?: ItemSpecification[]
  onDownloadDrawing?: (id: string) => Promise<void>
}
const read = (form: HTMLFormElement, name: string) =>
  String(new FormData(form).get(name) ?? '').trim()
type Unit = 'pcs' | 'kg' | 'm' | 'set'
type ComponentLine = {
  item_id: string
  quantity: string
  uom: Unit
  scrap_allowance_pct: string
}
type OperationLine = { sequence: number; work_centre_id: string; name: string }
function TextField({
  label,
  name,
  type = 'text',
  defaultValue,
  min,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string
  min?: string
}) {
  return (
    <label className="form-label">
      {label}
      <input
        className="form-input"
        aria-label={label}
        name={name}
        type={type}
        required
        defaultValue={defaultValue}
        min={min}
        inputMode={
          type === 'text' && /quantity|allowance/i.test(label)
            ? 'decimal'
            : undefined
        }
      />
    </label>
  )
}

export function ProductionPanel({
  companyId,
  data,
  options,
  lots,
  positions,
  permissions,
  online,
  busy,
  loading,
  error,
  onCommand,
  drawingPanel,
  drawingData,
  onDownloadDrawing,
  specifications = [],
}: Props) {
  const [tab, setTab] = useState('Demand')
  const [workId, setWorkId] = useState('')
  const [jobId, setJobId] = useState('')
  const [packageId, setPackageId] = useState('')
  const [reviewedPackageId, setReviewedPackageId] = useState<string | null>(
    null,
  )
  const [demandId, setDemandId] = useState('')
  const [packageItemId, setPackageItemId] = useState('')
  const [componentItemId, setComponentItemId] = useState('')
  const [lotId, setLotId] = useState('')
  const [issueId, setIssueId] = useState('')
  const [components, setComponents] = useState<ComponentLine[]>([])
  const [operations, setOperations] = useState<OperationLine[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const works = data?.works ?? [],
    packages = data?.packages ?? [],
    jobs = data?.jobs ?? [],
    demand = data?.demand ?? []
  const work = works.find((row) => row.id === workId)
  const job = jobs.find(
    (row) => row.id === jobId && row.work_order_id === workId,
  )
  const predecessorPending = Boolean(
    job &&
    jobs.some(
      (row) =>
        row.work_order_id === workId &&
        row.sequence < job.sequence &&
        row.status !== 'completed',
    ),
  )
  const selectedDemand = demand.find((row) => row.id === demandId)
  const selectedPackage = packages.find((row) => row.id === packageId)
  const componentItem = options.items.find((row) => row.id === componentItemId)
  const lot = lots.find((row) => row.id === lotId)
  const lotIssueAllowed = Boolean(
    lot &&
    (lot.qc_status === 'released' ||
      (lot.qc_status === 'hold' && lot.id === work?.approved_rework_lot_id)),
  )
  const issue = data?.issues.find(
    (row) => row.id === issueId && row.work_order_id === workId,
  )
  const issueLot = lots.find((row) => row.id === issue?.lot_id)
  const unitForLot = options.items.find(
    (row) => row.id === lot?.item_id,
  )?.base_uom
  const blocked = !companyId || !online || busy
  const can = (permission: string) =>
    !blocked && permissions.includes(permission)
  const itemLabel = (itemId: string) => {
    const item = options.items.find((row) => row.id === itemId)
    return item ? `${item.sku} — ${item.description}` : itemId
  }
  async function submit(command: ProductionCommand, label: string) {
    setMessage(null)
    try {
      const id = await onCommand(command)
      setMessage(`${label} confirmed. Reference: ${id}`)
    } catch (cause) {
      setMessage(
        formatCommandError(
          cause,
          'the production action could not be confirmed. Refresh and retry.',
        ),
      )
    }
  }
  if (loading)
    return (
      <section className="record-panel" role="status">
        Loading production records…
      </section>
    )
  if (error)
    return (
      <section className="record-panel" role="alert">
        Blocked because production records could not be loaded. Check company
        access and retry.
      </section>
    )
  return (
    <section className="record-panel" aria-labelledby="production-title">
      <h3 id="production-title" className="font-bold">
        Production planning and execution
      </h3>
      <p className="empty-state">
        Plan accepted demand, pin engineering, account for materials and record
        output into QC hold. Quantities remain in their recorded units.
      </p>
      {!online && (
        <p role="status">
          Blocked because production actions require an internet connection.
        </p>
      )}
      <CommandFeedback message={message} />
      <div className="workflow-switch" aria-label="Production workspaces">
        {['Engineering', 'Demand', 'Shop floor', 'Materials', 'Output'].map(
          (name) => (
            <button
              key={name}
              type="button"
              className="secondary-button"
              aria-pressed={tab === name}
              onClick={() => {
                setTab(name)
                setMessage(null)
              }}
            >
              {name}
            </button>
          ),
        )}
      </div>

      {tab === 'Engineering' && (
        <>
          {drawingPanel}
          <h4 className="font-bold">Engineering package</h4>
          <p className="empty-state">
            Enter component quantities for the explicit output basis. No
            conversion, rate or inspection criterion is inferred. Approval
            freezes the BOM and routing.
          </p>
          <label className="form-label">
            Package output item
            <select
              className="form-input"
              aria-label="Package output item"
              value={packageItemId}
              onChange={(event) => setPackageItemId(event.target.value)}
            >
              <option value="">Select item</option>
              {options.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} · {item.base_uom}
                </option>
              ))}
            </select>
          </label>
          <ActionForm
            title="Add component"
            disabled={!can('master_data.manage') || components.length >= 100}
            onSubmit={(form) => {
              if (!componentItem) return
              setComponents((previous) => [
                ...previous,
                {
                  item_id: componentItem.id,
                  quantity: read(form, 'quantity'),
                  uom: componentItem.base_uom,
                  scrap_allowance_pct: read(form, 'scrap'),
                },
              ])
            }}
          >
            <label className="form-label">
              Component item
              <select
                className="form-input"
                aria-label="Component item"
                required
                value={componentItemId}
                onChange={(event) => setComponentItemId(event.target.value)}
              >
                <option value="">Select item</option>
                {options.items
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} · {item.base_uom}
                    </option>
                  ))}
              </select>
            </label>
            <TextField
              label="Component quantity per output basis"
              name="quantity"
            />
            <TextField
              label="Scrap allowance percent"
              name="scrap"
              defaultValue="0"
            />
          </ActionForm>
          {components.map((line, index) => (
            <p key={`${line.item_id}-${index}`}>
              {itemLabel(line.item_id)} · {line.quantity} {line.uom} · Allowance{' '}
              {line.scrap_allowance_pct}%{' '}
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                aria-label={`Remove component ${index + 1}`}
                onClick={() =>
                  setComponents((previous) =>
                    previous.filter((_, i) => i !== index),
                  )
                }
              >
                Remove
              </button>
            </p>
          ))}
          <ActionForm
            title="Add routing operation"
            disabled={!can('master_data.manage') || operations.length >= 50}
            onSubmit={(form) =>
              setOperations((previous) => [
                ...previous,
                {
                  sequence: Number(read(form, 'sequence')),
                  work_centre_id: read(form, 'centre'),
                  name: read(form, 'name'),
                },
              ])
            }
          >
            <TextField
              label="Operation sequence"
              name="sequence"
              type="number"
              min="1"
            />
            <TextField label="Operation name" name="name" />
            <label className="form-label">
              Operation work centre
              <select
                className="form-input"
                aria-label="Operation work centre"
                name="centre"
                required
              >
                <option value="">Select work centre</option>
                {data?.workCentres.map((centre) => (
                  <option key={centre.id} value={centre.id}>
                    {centre.code} — {centre.name}
                  </option>
                ))}
              </select>
            </label>
          </ActionForm>
          {operations.map((line, index) => (
            <p key={`${line.sequence}-${index}`}>
              {line.sequence}. {line.name} ·{' '}
              {
                data?.workCentres.find(
                  (centre) => centre.id === line.work_centre_id,
                )?.code
              }{' '}
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                aria-label={`Remove operation ${index + 1}`}
                onClick={() =>
                  setOperations((previous) =>
                    previous.filter((_, i) => i !== index),
                  )
                }
              >
                Remove
              </button>
            </p>
          ))}
          <ActionForm
            title="Create engineering package"
            disabled={
              !can('master_data.manage') ||
              !packageItemId ||
              !components.length ||
              !operations.length
            }
            onSubmit={(form) =>
              void submit(
                {
                  action: 'create_package',
                  data: {
                    item_id: packageItemId,
                    revision_label: read(form, 'revision'),
                    basis_quantity: read(form, 'basis'),
                    components,
                    operations,
                  },
                },
                'Engineering package',
              )
            }
          >
            <TextField label="Package revision label" name="revision" />
            <TextField
              label="Output basis quantity"
              name="basis"
              defaultValue="1"
            />
            <p>
              Output unit:{' '}
              {options.items.find((item) => item.id === packageItemId)
                ?.base_uom ?? 'Select output item'}
            </p>
          </ActionForm>
          <label className="form-label">
            Review engineering package
            <select
              className="form-input"
              aria-label="Review engineering package"
              value={packageId}
              onChange={(event) => {
                setPackageId(event.target.value)
                setReviewedPackageId(null)
              }}
            >
              <option value="">Select package</option>
              {packages.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} · {entry.status}
                </option>
              ))}
            </select>
          </label>
          {selectedPackage && (
            <>
              <p>
                {itemLabel(selectedPackage.item_id)} · Output basis{' '}
                {selectedPackage.basis_quantity} {selectedPackage.uom} ·{' '}
                {selectedPackage.status}
              </p>
              <RevisionSummary
                engineering={{
                  drawings: [],
                  boms: [
                    {
                      id: selectedPackage.bom_revision_id,
                      itemId: selectedPackage.item_id,
                      label: selectedPackage.label,
                    },
                  ],
                  routings: [
                    {
                      id: selectedPackage.routing_revision_id,
                      itemId: selectedPackage.item_id,
                      label: selectedPackage.label,
                    },
                  ],
                }}
                bomId={selectedPackage.bom_revision_id}
                routingId={selectedPackage.routing_revision_id}
              />
              <h4 className="font-bold">Saved component requirements</h4>
              <div className="max-w-full overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption>Component quantities per saved output basis</caption>
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Quantity</th>
                      <th>Scrap allowance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPackage.components.map((line, index) => (
                      <tr key={`${line.item_id}-${index}`}>
                        <td>{itemLabel(line.item_id)}</td>
                        <td>
                          {line.quantity} {line.uom}
                        </td>
                        <td>{line.scrap_allowance_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4 className="font-bold">Saved routing operations</h4>
              <ol>
                {selectedPackage.operations.map((line) => (
                  <li key={line.sequence}>
                    {line.sequence}. {line.name} ·{' '}
                    {data?.workCentres.find(
                      (centre) => centre.id === line.work_centre_id,
                    )?.code ?? line.work_centre_id}
                  </li>
                ))}
              </ol>
              {selectedPackage.status === 'draft' && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={reviewedPackageId === selectedPackage.id}
                    onChange={(event) =>
                      setReviewedPackageId(
                        event.target.checked ? selectedPackage.id : null,
                      )
                    }
                  />
                  I reviewed the saved output basis, components and routing.
                </label>
              )}
              <button
                type="button"
                className="primary-button"
                disabled={
                  !can('master_data.manage') ||
                  selectedPackage.status !== 'draft' ||
                  reviewedPackageId !== selectedPackage.id
                }
                onClick={() =>
                  void submit(
                    {
                      action: 'approve_package',
                      data: { package_id: selectedPackage.id },
                    },
                    'Engineering approval',
                  )
                }
              >
                Approve engineering package
              </button>
            </>
          )}
        </>
      )}

      {tab === 'Demand' && (
        <>
          <h4 className="font-bold">Accepted demand</h4>
          {!demand.length && (
            <p className="empty-state">
              No accepted demand is available under your access.
            </p>
          )}
          <div className="max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption>
                Planning quantities stay separate by item and unit
              </caption>
              <thead>
                <tr>
                  <th>Order / item</th>
                  <th>Promise</th>
                  <th>Ordered</th>
                  <th>Planned</th>
                  <th>Remaining to plan</th>
                </tr>
              </thead>
              <tbody>
                {demand.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.order_number} · {itemLabel(row.item_id)}
                    </td>
                    <td>{row.promised_date ?? 'Not set'}</td>
                    <td>
                      {row.ordered_quantity} {row.uom}
                    </td>
                    <td>
                      {row.planned_quantity} {row.uom}
                    </td>
                    <td>
                      {row.remaining_to_plan} {row.uom}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ActionForm
            title="Create work order"
            disabled={
              !can('planning.manage') ||
              !selectedDemand ||
              !selectedPackage ||
              selectedPackage.status !== 'approved' ||
              selectedPackage.item_id !== selectedDemand.item_id
            }
            onSubmit={(form) => {
              if (!selectedDemand || !selectedPackage) return
              void submit(
                {
                  action: 'create_work_order',
                  data: {
                    sales_order_line_id: selectedDemand.id,
                    package_id: selectedPackage.id,
                    number: read(form, 'number'),
                    quantity: read(form, 'quantity'),
                    start_date: read(form, 'start'),
                    due_date: read(form, 'due'),
                  },
                },
                'Work order',
              )
            }}
          >
            <label className="form-label">
              Demand line
              <select
                className="form-input"
                aria-label="Demand line"
                required
                value={demandId}
                onChange={(event) => {
                  setDemandId(event.target.value)
                  setPackageId('')
                }}
              >
                <option value="">Select accepted demand</option>
                {demand.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.order_number} · {itemLabel(row.item_id)} ·{' '}
                    {row.remaining_to_plan} {row.uom}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Approved production package
              <select
                className="form-input"
                aria-label="Approved production package"
                required
                value={packageId}
                onChange={(event) => setPackageId(event.target.value)}
              >
                <option value="">Select approved package</option>
                {packages
                  .filter(
                    (row) =>
                      row.status === 'approved' &&
                      row.item_id === selectedDemand?.item_id,
                  )
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label} · Basis {row.basis_quantity} {row.uom}
                    </option>
                  ))}
              </select>
            </label>
            {selectedDemand &&
              !packages.some(
                (row) =>
                  row.status === 'approved' &&
                  row.item_id === selectedDemand.item_id,
              ) && (
                <p role="status">
                  Blocked because this item has no approved production package.
                </p>
              )}
            <TextField label="Work order number" name="number" />
            <TextField label="Planned output quantity" name="quantity" />
            <TextField
              label="Planned start date"
              name="start"
              type="date"
              defaultValue={plantDate()}
            />
            <TextField
              key={selectedDemand?.id ?? 'no-demand'}
              label="Work order due date"
              name="due"
              type="date"
              defaultValue={selectedDemand?.promised_date ?? plantDate()}
            />
          </ActionForm>
          <h4 className="font-bold">Work-centre workload</h4>
          {data?.workCentres.map((centre) => (
            <p key={centre.id}>
              {centre.code} — {centre.name}:{' '}
              {
                jobs.filter(
                  (row) =>
                    row.work_centre_id === centre.id &&
                    row.status !== 'completed',
                ).length
              }{' '}
              open job cards. Capacity is not configured.
            </p>
          ))}
        </>
      )}

      {tab !== 'Engineering' && (
        <>
          <label className="form-label">
            Production work order
            <select
              className="form-input"
              aria-label="Production work order"
              value={workId}
              onChange={(event) => {
                setWorkId(event.target.value)
                setJobId('')
                setIssueId('')
                setLotId('')
              }}
            >
              <option value="">Select work order</option>
              {works.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.number} · {row.status} · {row.quantity} {row.uom}
                </option>
              ))}
            </select>
          </label>
          {work && (
            <>
              <p>
                {itemLabel(work.item_id)} · {work.quantity} {work.uom} ·{' '}
                {work.status} · Start {work.start_date} · Due {work.due_date}
              </p>
              <RevisionSummary
                engineering={{ drawings: [], boms: [], routings: [] }}
                drawingId={work.drawing_revision_id}
                bomId={work.bom_revision_id}
                routingId={work.routing_revision_id}
              />
              <CustomerPartSummary number={work.customer_part_number} revision={work.customer_part_revision} />
              {work.item_specification_id && <ItemSpecificationSummary specification={specifications.find((row) => row.id === work.item_specification_id)} />}
              {work.drawing_revision_id && onDownloadDrawing && <DrawingFileSummary key={work.drawing_revision_id}
                data={drawingData} revisionId={work.drawing_revision_id} online={online} busy={busy} onDownload={onDownloadDrawing} />}
              {work.source_ncr_id && (
                <p className="empty-state">
                  Approved rework from NCR {work.source_ncr_id}. Authorized
                  source lot:{' '}
                  {lots.find(
                    (entry) => entry.id === work.approved_rework_lot_id,
                  )?.lot_code ??
                    work.approved_rework_lot_id ??
                    'See Quality'}
                  . This authorization applies only to that source lot.
                </p>
              )}
            </>
          )}
        </>
      )}

      {tab === 'Shop floor' && (
        <>
          {work && (
            <button
              className="primary-button"
              type="button"
              disabled={!can('planning.manage') || work.status !== 'draft'}
              onClick={() =>
                void submit(
                  {
                    action: 'release_work_order',
                    data: { work_order_id: work.id, revision: work.revision },
                  },
                  'Work order release',
                )
              }
            >
              Release work order
            </button>
          )}
          <div className="max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption>Job cards for the selected work order</caption>
              <thead>
                <tr>
                  <th>Step / centre</th>
                  <th>Planned</th>
                  <th>Good</th>
                  <th>Scrap</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {jobs
                  .filter((row) => row.work_order_id === workId)
                  .map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.sequence}. {row.name} ·{' '}
                        {
                          data?.workCentres.find(
                            (centre) => centre.id === row.work_centre_id,
                          )?.code
                        }
                      </td>
                      <td>
                        {row.planned_quantity} {row.uom}
                      </td>
                      <td>
                        {row.good_quantity} {row.uom}
                      </td>
                      <td>
                        {row.scrap_quantity} {row.uom}
                      </td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <label className="form-label">
            Shop-floor job card
            <select
              className="form-input"
              aria-label="Shop-floor job card"
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
            >
              <option value="">Select job</option>
              {jobs
                .filter((row) => row.work_order_id === workId)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.sequence}. {row.name} · {row.status}
                  </option>
                ))}
            </select>
          </label>
          {job && (
            <>
              <p>
                Job plan {job.planned_quantity} {job.uom}; recorded good{' '}
                {job.good_quantity} {job.uom}; scrap {job.scrap_quantity}{' '}
                {job.uom}. The server checks the remaining quantity.
              </p>
              <button
                type="button"
                className="primary-button"
                disabled={
                  !can('production.execute') ||
                  job.status !== 'pending' ||
                  work?.status === 'draft' ||
                  work?.status === 'closed' ||
                  predecessorPending
                }
                onClick={() =>
                  void submit(
                    {
                      action: 'start_job',
                      data: { job_card_id: job.id, revision: job.revision },
                    },
                    'Job start',
                  )
                }
              >
                Start job
              </button>
              {predecessorPending && (
                <p role="status">
                  Blocked because the preceding routing operation is not
                  completed.
                </p>
              )}
            </>
          )}
          <ActionForm
            title="Record job completion"
            disabled={
              !can('production.execute') || !job || job.status !== 'in_progress'
            }
            onSubmit={(form) => {
              if (!job) return
              void submit(
                {
                  action: 'complete_job',
                  data: {
                    job_card_id: job.id,
                    revision: job.revision,
                    good_quantity: read(form, 'good'),
                    scrap_quantity: read(form, 'scrap'),
                    reason: read(form, 'reason'),
                  },
                },
                'Job quantities',
              )
            }}
          >
            <p className="empty-state">
              Enter quantities for this entry only. The server adds them to
              recorded totals and completes the job once its planned quantity is
              accounted for.
            </p>
            <TextField label="Job good quantity" name="good" />
            <TextField
              label="Job scrap quantity"
              name="scrap"
              defaultValue="0"
            />
            <TextField label="Job completion reason" name="reason" />
          </ActionForm>
        </>
      )}

      {tab === 'Materials' && (
        <>
          <h4 className="font-bold">Material requirements and custody</h4>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption>Server-derived material balances by base unit</caption>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Required</th>
                  <th>Available in stores</th>
                  <th>Expected receipts</th>
                  <th>Issued WIP</th>
                  <th>Consumed</th>
                </tr>
              </thead>
              <tbody>
                {data?.requirements
                  .filter((row) => row.work_order_id === workId)
                  .map((row) => (
                    <tr key={row.item_id}>
                      <td>{itemLabel(row.item_id)}</td>
                      <td>
                        {row.required_quantity} {row.uom}
                      </td>
                      <td>
                        {row.available_quantity} {row.uom}
                      </td>
                      <td>
                        {row.expected_receipts} {row.uom}
                      </td>
                      <td>
                        {row.wip_quantity} {row.uom}
                      </td>
                      <td>
                        {row.consumed_quantity} {row.uom}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="empty-state">
            Issue uses released, unreserved stock. Issued material remains WIP
            until an explicit consumption or return event; stores availability
            excludes that quantity.
          </p>
          <ActionForm
            title="Issue material to job"
            disabled={
              !can('stock.issue') ||
              !work ||
              !job ||
              !lot ||
              !lotIssueAllowed ||
              work.status === 'draft' ||
              work.status === 'closed' ||
              job.status === 'completed' ||
              !unitForLot
            }
            onSubmit={(form) => {
              if (!work || !job || !lot || !unitForLot) return
              void submit(
                {
                  action: 'issue_material',
                  data: {
                    work_order_id: work.id,
                    job_card_id: job.id,
                    lot_id: lot.id,
                    quantity: read(form, 'quantity'),
                    uom: unitForLot,
                    lot_revision: lot.revision,
                  },
                },
                'Material issue',
              )
            }}
          >
            <label className="form-label">
              Material job card
              <select
                className="form-input"
                aria-label="Material job card"
                required
                value={jobId}
                onChange={(event) => setJobId(event.target.value)}
              >
                <option value="">Select job</option>
                {jobs
                  .filter((row) => row.work_order_id === workId)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.sequence}. {row.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-label">
              Material stock lot
              <select
                className="form-input"
                aria-label="Material stock lot"
                required
                value={lotId}
                onChange={(event) => setLotId(event.target.value)}
              >
                <option value="">Select lot</option>
                {lots
                  .filter((row) =>
                    data?.requirements.some(
                      (requirement) =>
                        requirement.work_order_id === workId &&
                        requirement.item_id === row.item_id,
                    ),
                  )
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.lot_code} · {row.qc_status}
                    </option>
                  ))}
              </select>
            </label>
            {lot && (
              <StockBalanceSummary
                position={positions.find(
                  (position) => position.lot_id === lot.id,
                )}
                uom={unitForLot}
              />
            )}
            {lot && !lotIssueAllowed && (
              <p role="status">
                Blocked because this material lot is{' '}
                {lot.qc_status === 'hold' ? 'on QC hold' : 'rejected'}.
              </p>
            )}
            {lot && lot.qc_status === 'hold' && lotIssueAllowed && (
              <p role="status">
                This held source lot is authorized for the selected NCR rework
                order. It remains unavailable for normal demand and dispatch.
              </p>
            )}
            <TextField label="Material issue quantity" name="quantity" />
          </ActionForm>
          <label className="form-label">
            Issued material reference
            <select
              className="form-input"
              aria-label="Issued material reference"
              value={issueId}
              onChange={(event) => setIssueId(event.target.value)}
            >
              <option value="">Select issue</option>
              {data?.issues
                .filter((row) => row.work_order_id === workId)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {lots.find((entry) => entry.id === row.lot_id)?.lot_code ??
                      row.lot_id}{' '}
                    · Remaining WIP {row.remaining_quantity} {row.uom}
                  </option>
                ))}
            </select>
          </label>
          {issue && (
            <>
              <p>
                Originally issued {issue.quantity} {issue.uom}; unaccounted WIP{' '}
                {issue.remaining_quantity} {issue.uom}. Return and consumption
                cannot exceed remaining material.
              </p>
              <StockBalanceSummary
                position={positions.find(
                  (position) => position.lot_id === issue.lot_id,
                )}
                uom={issue.uom}
              />
            </>
          )}
          <ActionForm
            title="Return unused material"
            disabled={
              !can('stock.issue') ||
              !issue ||
              !issueLot ||
              work?.status === 'draft' ||
              work?.status === 'closed'
            }
            onSubmit={(form) => {
              if (!issue || !issueLot) return
              void submit(
                {
                  action: 'return_material',
                  data: {
                    issue_id: issue.id,
                    quantity: read(form, 'quantity'),
                    reason: read(form, 'reason'),
                    lot_revision: issueLot.revision,
                  },
                },
                'Material return',
              )
            }}
          >
            <p className="empty-state">
              Unused material returns to its source lot on QC hold; Quality must
              approve it before it is available again.
            </p>
            <TextField label="Material return quantity" name="quantity" />
            <TextField label="Material return reason" name="reason" />
          </ActionForm>
          <ActionForm
            title="Record material consumption"
            disabled={
              !can('stock.issue') ||
              !issue ||
              work?.status === 'draft' ||
              work?.status === 'closed'
            }
            onSubmit={(form) => {
              if (!issue) return
              void submit(
                {
                  action: 'consume_material',
                  data: {
                    issue_id: issue.id,
                    quantity: read(form, 'quantity'),
                    reason: read(form, 'reason'),
                  },
                },
                'Material consumption',
              )
            }}
          >
            <TextField label="Material consumed quantity" name="quantity" />
            <TextField label="Material consumption reason" name="reason" />
          </ActionForm>
        </>
      )}

      {tab === 'Output' && (
        <>
          <ActionForm
            title="Record production output"
            disabled={
              !can('production.execute') ||
              !work ||
              work.status === 'closed' ||
              work.status === 'draft' ||
              jobs.some(
                (row) =>
                  row.work_order_id === work.id && row.status !== 'completed',
              )
            }
            onSubmit={(form) => {
              if (!work) return
              void submit(
                {
                  action: 'record_output',
                  data: {
                    work_order_id: work.id,
                    location_id: read(form, 'location'),
                    lot_code: read(form, 'lot'),
                    quantity: read(form, 'quantity'),
                    uom: work.uom,
                  },
                },
                'Held output lot',
              )
            }}
          >
            <TextField label="Production output lot code" name="lot" />
            <TextField label="Production output quantity" name="quantity" />
            <p>
              Output unit: {work?.uom ?? 'Select work order'}. Every new output
              lot enters QC hold.
            </p>
            <label className="form-label">
              Production output location
              <select
                className="form-input"
                aria-label="Production output location"
                name="location"
                required
              >
                <option value="">Select location</option>
                {options.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} — {location.name}
                  </option>
                ))}
              </select>
            </label>
          </ActionForm>
          <h4 className="font-bold">Recorded output lots</h4>
          {data?.outputs
            .filter((row) => row.work_order_id === workId)
            .map((row) => (
              <p key={row.id}>
                {lots.find((entry) => entry.id === row.lot_id)?.lot_code ??
                  row.lot_id}{' '}
                · {row.quantity} {row.uom} · QC{' '}
                {lots.find((entry) => entry.id === row.lot_id)?.qc_status ??
                  'See Quality'}
              </p>
            ))}
          <p className="empty-state">
            Close requires completed jobs, accounted materials, recorded output
            and Quality release. A blocked close keeps all work and event
            history available.
          </p>
          {work && (
            <button
              type="button"
              className="primary-button"
              disabled={
                !can('planning.manage') ||
                work.status === 'closed' ||
                work.status === 'draft'
              }
              onClick={() =>
                void submit(
                  {
                    action: 'close_work_order',
                    data: { work_order_id: work.id, revision: work.revision },
                  },
                  'Work order close',
                )
              }
            >
              Close work order
            </button>
          )}
        </>
      )}
    </section>
  )
}
