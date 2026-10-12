import { useState } from 'react'
import { LotEvidencePanel } from './LotEvidencePanel'
import type { DocumentUpload, LotDocument } from './useLotDocuments'
import { ActionForm } from '@/components/ActionForm'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import type { StockLot } from '@/features/stock/useStockLots'
import type { StockPosition } from '@/features/stock/useStockExplorer'
import type { ProductionWorkspace } from '@/features/production/useProductionWorkspace'
import { CommandFeedback } from '@/components/CommandFeedback'
import { StockBalanceSummary } from '@/components/StockBalanceSummary'
import { formatCommandError } from '@/lib/commandError'
import { plantTimestamp } from '@/lib/decimal'
import {
  characteristicSchema,
  measurementSchema,
  type QualityCharacteristic,
  type QualityCommand,
  type QualityWorkspace,
} from './useQualityWorkspace'

type Props = {
  companyId: string | null
  data: QualityWorkspace | undefined
  production: ProductionWorkspace | undefined
  options: MasterDataOptions
  lots: StockLot[]
  positions: StockPosition[]
  permissions: string[]
  online: boolean
  busy: boolean
  loading: boolean
  error: boolean
  documents?: LotDocument[]
  userId?: string
  documentLoading?: boolean
  documentError?: boolean
  documentBusy?: boolean
  onUpload?: (input: DocumentUpload) => Promise<string>
  onDownload?: (id: string) => Promise<void>
  onCommand: (command: QualityCommand) => Promise<string>
}
const read = (form: HTMLFormElement, name: string) =>
  String(new FormData(form).get(name) ?? '').trim()
function Field({
  label,
  name,
  type = 'text',
  maxLength = 160,
}: {
  label: string
  name: string
  type?: string
  maxLength?: number
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
        maxLength={maxLength}
      />
    </label>
  )
}

function Criteria({ rows }: { rows: QualityCharacteristic[] }) {
  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li key={row.key} className="record-card">
          <strong>{row.label}</strong> · {row.key}
          <p className="text-sm">
            {row.type === 'numeric'
              ? `${row.min} to ${row.max} ${row.uom}`
              : `Expected: ${row.expected}`}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function QualityPanel({
  companyId,
  data,
  production,
  options,
  lots,
  positions,
  permissions,
  online,
  busy,
  loading,
  error,
  onCommand, documents = [], userId, documentLoading = false, documentError = false, documentBusy = false, onUpload, onDownload,
}: Props) {
  const [view, setView] = useState('Inspections')
  const [message, setMessage] = useState<string | null>(null)
  const [criteria, setCriteria] = useState<QualityCharacteristic[]>([])
  const [criterionType, setCriterionType] = useState<'numeric' | 'attribute'>(
    'numeric',
  )
  const [draftPlanId, setDraftPlanId] = useState('')
  const [reviewedPlanId, setReviewedPlanId] = useState<string | null>(null)
  const [kind, setKind] = useState<'incoming' | 'in_process' | 'final'>(
    'incoming',
  )
  const [lotId, setLotId] = useState('')
  const [jobId, setJobId] = useState('')
  const [planId, setPlanId] = useState('')
  const [supersedesId, setSupersedesId] = useState('')
  const [reviewLotId, setReviewLotId] = useState('')
  const [ncrId, setNcrId] = useState('')
  const [disposition, setDisposition] = useState<
    'reinspect' | 'scrap' | 'supplier_return' | 'rework'
  >('reinspect')
  const [traceLotId, setTraceLotId] = useState('')
  const disabled = !companyId || !online || busy || loading || error || !data
  const plans = data?.plans ?? []
  const plan = plans.find(
    (row) => row.id === planId && row.status === 'approved',
  )
  const draftPlan = plans.find(
    (row) => row.id === draftPlanId && row.status === 'draft',
  )
  const lot = lots.find((row) => row.id === lotId)
  const job = production?.jobs.find(
    (row) => row.id === jobId && row.status === 'in_progress',
  )
  const jobWork = production?.works.find((row) => row.id === job?.work_order_id)
  const targetItemId = kind === 'in_process' ? jobWork?.item_id : lot?.item_id
  const eligiblePlans = plans.filter(
    (row) => row.status === 'approved' && row.item_id === targetItemId,
  )
  const eligibleLots = lots.filter(
    (row) =>
      row.qc_status !== 'released' &&
      (kind === 'final') ===
        (data?.contexts?.find((context) => context.lot_id === row.id)?.requires_final ?? Boolean(production?.outputs.some((output) => output.lot_id === row.id))),
  )
  const history = (data?.inspections ?? []).filter((row) =>
    kind === 'in_process' ? row.job_card_id === jobId : row.lot_id === lotId,
  )
  const reviewLot = lots.find((row) => row.id === reviewLotId)
  const reviewUnit = options.items.find(
    (row) => row.id === reviewLot?.item_id,
  )?.base_uom
  const ncr = data?.ncrs.find((row) => row.id === ncrId)
  const ncrLot = lots.find((row) => row.id === ncr?.lot_id)
  const reworkPackages =
    production?.packages.filter(
      (row) =>
        row.status === 'approved' &&
        row.item_id === ncrLot?.item_id &&
        row.components.some(
          (component) => component.item_id === ncrLot?.item_id,
        ),
    ) ?? []
  const lotName = (id: string) =>
    lots.find((row) => row.id === id)?.lot_code ?? id
  const itemName = (id: string) =>
    options.items.find((row) => row.id === id)?.sku ?? id
  async function submit(command: QualityCommand, success: string) {
    try {
      const result = await onCommand(command)
      setMessage(`${success} Confirmation: ${result}`)
      return true
    } catch (cause) {
      setMessage(
        formatCommandError(
          cause,
          'the quality action could not be confirmed. Review the inputs, refresh and retry.',
        ),
      )
      return false
    }
  }
  function selectTarget(id: string) {
    if (kind === 'in_process') setJobId(id)
    else setLotId(id)
    setPlanId('')
    setSupersedesId('')
  }
  return (
    <section className="record-panel" aria-labelledby="quality-title">
      <h3 id="quality-title" className="font-bold">
        Quality and traceability
      </h3>
      <p className="empty-state">
        Use approved inspection criteria. Record every sample; the server
        confirms the result. Release is a separate stock action.
      </p>
      <CommandFeedback message={message} />
      {!companyId && (
        <p className="empty-state">Select a company to load quality records.</p>
      )}
      {!online && (
        <p className="feedback feedback-blocked" role="status">
          ⚠ Blocked because quality actions require an internet connection.
        </p>
      )}
      {loading && <p role="status">Loading quality records…</p>}
      {error && (
        <p className="feedback feedback-blocked" role="alert">
          ⚠ Blocked because quality records could not be loaded. Refresh and
          retry.
        </p>
      )}
      <div className="workflow-switch" aria-label="Quality workspaces">
        {['Inspections', 'Plans', 'NCRs', 'Traceability'].map((name) => (
          <button
            key={name}
            type="button"
            className="secondary-button"
            aria-pressed={view === name}
            onClick={() => setView(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {view === 'Plans' && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {permissions.includes('quality.manage') && (
            <div className="grid min-w-0 gap-4">
              <ActionForm
                title="Add inspection characteristic"
                disabled={disabled || criteria.length >= 50}
                onSubmit={(form) => {
                  const result = characteristicSchema.safeParse({
                    key: read(form, 'key'),
                    label: read(form, 'criterion_label'),
                    type: criterionType,
                    ...(criterionType === 'numeric'
                      ? {
                          uom: read(form, 'uom'),
                          min: read(form, 'min'),
                          max: read(form, 'max'),
                        }
                      : { expected: read(form, 'expected') }),
                  })
                  if (!result.success) {
                    setMessage(
                      `Blocked because ${result.error.issues[0]?.message ?? 'the criterion is invalid'}`,
                    )
                    return
                  }
                  if (criteria.some((row) => row.key === result.data.key)) {
                    setMessage(
                      'Blocked because each characteristic needs a unique key.',
                    )
                    return
                  }
                  setCriteria([...criteria, result.data])
                  form.reset()
                }}
              >
                <Field label="Characteristic key" name="key" maxLength={40} />
                <Field label="Characteristic label" name="criterion_label" />
                <label className="form-label">
                  Characteristic type
                  <select
                    aria-label="Characteristic type"
                    className="form-input"
                    value={criterionType}
                    onChange={(event) =>
                      setCriterionType(
                        event.target.value as typeof criterionType,
                      )
                    }
                  >
                    <option value="numeric">Numeric measurement</option>
                    <option value="attribute">Attribute value</option>
                  </select>
                </label>
                {criterionType === 'numeric' ? (
                  <>
                    <Field label="Measurement unit" name="uom" maxLength={32} />
                    <Field label="Minimum accepted measurement" name="min" />
                    <Field label="Maximum accepted measurement" name="max" />
                  </>
                ) : (
                  <Field label="Expected attribute value" name="expected" />
                )}
              </ActionForm>
              <ActionForm
                title="Save inspection plan draft"
                disabled={disabled || criteria.length === 0}
                onSubmit={(form) => {
                  void submit(
                    {
                      action: 'create_plan',
                      data: {
                        item_id: read(form, 'item_id'),
                        label: read(form, 'label'),
                        version: read(form, 'version'),
                        sample_size: Number(read(form, 'sample_size')),
                        characteristics: criteria,
                      },
                    },
                    'Inspection plan draft saved.',
                  ).then((confirmed) => {
                    if (confirmed) {
                      setCriteria([])
                      form.reset()
                    }
                  })
                }}
              >
                <label className="form-label">
                  Plan item
                  <select
                    aria-label="Plan item"
                    className="form-input"
                    name="item_id"
                    required
                    defaultValue=""
                  >
                    <option value="">Select item</option>
                    {options.items.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.sku} · {row.description}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="Inspection plan label" name="label" />
                <Field
                  label="Inspection plan version"
                  name="version"
                  maxLength={24}
                />
                <label className="form-label">
                  Required sample count
                  <input
                    aria-label="Required sample count"
                    className="form-input"
                    name="sample_size"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    required
                  />
                </label>
                <p className="text-sm text-muted">
                  Enter the approved sampling requirement. No factory tolerance
                  or sample count is assumed.
                </p>
                <Criteria rows={criteria} />
                {criteria.map((row) => (
                  <button
                    className="secondary-button"
                    type="button"
                    key={row.key}
                    onClick={() =>
                      setCriteria(
                        criteria.filter((entry) => entry.key !== row.key),
                      )
                    }
                  >
                    Remove {row.label}
                  </button>
                ))}
              </ActionForm>
            </div>
          )}
          <div className="grid min-w-0 gap-4">
            <h4 className="font-bold">Saved inspection plans</h4>
            {!plans.length && (
              <p className="empty-state">No inspection plans yet.</p>
            )}
            {plans.map((row) => (
              <article className="record-card" key={row.id}>
                <strong>
                  {row.label} · {row.version}
                </strong>
                <p>
                  {itemName(row.item_id)} · {row.status} · {row.sample_size}{' '}
                  samples per characteristic
                </p>
                <Criteria rows={row.characteristics} />
              </article>
            ))}
            {permissions.includes('quality.manage') && (
              <ActionForm
                title="Approve reviewed inspection plan"
                disabled={
                  disabled || !draftPlan || reviewedPlanId !== draftPlan.id
                }
                onSubmit={() => {
                  if (draftPlan)
                    void submit(
                      {
                        action: 'approve_plan',
                        data: { plan_id: draftPlan.id },
                      },
                      'Inspection plan approved.',
                    ).then((confirmed) => {
                      if (confirmed) setReviewedPlanId(null)
                    })
                }}
              >
                <label className="form-label">
                  Draft inspection plan
                  <select
                    aria-label="Draft inspection plan"
                    className="form-input"
                    value={draftPlanId}
                    onChange={(event) => {
                      setDraftPlanId(event.target.value)
                      setReviewedPlanId(null)
                    }}
                  >
                    <option value="">Select saved draft</option>
                    {plans
                      .filter((row) => row.status === 'draft')
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label} · {row.version} · {itemName(row.item_id)}
                        </option>
                      ))}
                  </select>
                </label>
                {draftPlan && (
                  <>
                    <p>{draftPlan.sample_size} samples per characteristic</p>
                    <Criteria rows={draftPlan.characteristics} />
                    <label className="form-label">
                      <input
                        type="checkbox"
                        checked={reviewedPlanId === draftPlan.id}
                        onChange={(event) =>
                          setReviewedPlanId(
                            event.target.checked ? draftPlan.id : null,
                          )
                        }
                      />
                      I reviewed the saved criteria, units, limits and sample
                      count.
                    </label>
                  </>
                )}
              </ActionForm>
            )}
          </div>
        </div>
      )}

      {view === 'Inspections' && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="grid min-w-0 gap-4">
            <label className="form-label">
              Inspection stage
              <select
                aria-label="Inspection stage"
                className="form-input"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as typeof kind)
                  setLotId('')
                  setJobId('')
                  setPlanId('')
                  setSupersedesId('')
                }}
              >
                <option value="incoming">Incoming material</option>
                <option value="in_process">In-process job card</option>
                <option value="final">Final production output</option>
              </select>
            </label>
            <label className="form-label">
              {kind === 'in_process' ? 'Inspection job card' : 'Inspection lot'}
              <select
                aria-label={
                  kind === 'in_process'
                    ? 'Inspection job card'
                    : 'Inspection lot'
                }
                className="form-input"
                value={kind === 'in_process' ? jobId : lotId}
                onChange={(event) => selectTarget(event.target.value)}
              >
                <option value="">
                  Select{' '}
                  {kind === 'in_process'
                    ? 'active job card'
                    : 'held or rejected lot'}
                </option>
                {kind === 'in_process'
                  ? production?.jobs
                      .filter((row) => row.status === 'in_progress')
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name} ·{' '}
                          {
                            production.works.find(
                              (work) => work.id === row.work_order_id,
                            )?.number
                          }{' '}
                          · operation {row.sequence}
                        </option>
                      ))
                  : eligibleLots.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.lot_code} · {itemName(row.item_id)} ·{' '}
                        {row.qc_status}
                      </option>
                    ))}
              </select>
            </label>
            {kind !== 'in_process' && (
              <StockBalanceSummary
                position={positions.find((row) => row.lot_id === lotId)}
                uom={
                  options.items.find((row) => row.id === lot?.item_id)?.base_uom
                }
              />
            )}
            {!targetItemId ? (
              <p className="empty-state">
                Choose a target to see its approved inspection plans.
              </p>
            ) : (
              !eligiblePlans.length && (
                <p className="feedback feedback-blocked">
                  ⚠ Blocked because this item has no approved inspection plan.
                </p>
              )
            )}
            <label className="form-label">
              Approved inspection plan
              <select
                aria-label="Approved inspection plan"
                className="form-input"
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
              >
                <option value="">Select approved plan</option>
                {eligiblePlans.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label} · {row.version}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Correction reference
              <select
                aria-label="Correction reference"
                className="form-input"
                value={supersedesId}
                onChange={(event) => setSupersedesId(event.target.value)}
              >
                <option value="">New inspection</option>
                {history.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.id} · {row.result} · {plantTimestamp(row.created_at)}
                  </option>
                ))}
              </select>
            </label>
            {permissions.includes('quality.inspect') && (
              <ActionForm
                key={`${planId}:${kind}:${lotId}:${jobId}:${supersedesId}`}
                title="Record inspection readings"
                disabled={
                  disabled ||
                  !plan ||
                  plan.item_id !== targetItemId ||
                  (kind === 'in_process'
                    ? !job
                    : !eligibleLots.some((row) => row.id === lotId))
                }
                onSubmit={(form) => {
                  if (!plan) return
                  const readings = plan.characteristics.map((row) => ({
                    key: row.key,
                    ...(row.type === 'numeric' ? { uom: row.uom } : {}),
                    values: Array.from(
                      { length: plan.sample_size },
                      (_, index) => read(form, `${row.key}_${index}`),
                    ),
                  }))
                  for (const criterion of plan.characteristics) {
                    if (
                      criterion.type === 'numeric' &&
                      readings
                        .find((row) => row.key === criterion.key)
                        ?.values.some(
                          (value) =>
                            !measurementSchema.safeParse(value).success,
                        )
                    ) {
                      setMessage(
                        `Blocked because ${criterion.label} requires exact decimal measurements.`,
                      )
                      return
                    }
                  }
                  const targetRevision =
                    kind === 'in_process' ? job?.revision : lot?.revision
                  if (!targetRevision) return
                  void submit(
                    {
                      action: 'inspect',
                      data: {
                        plan_id: plan.id,
                        lot_id: kind === 'in_process' ? null : lotId,
                        job_card_id: kind === 'in_process' ? jobId : null,
                        kind,
                        revision: targetRevision,
                        readings,
                        reason: read(form, 'reason'),
                        supersedes_id: supersedesId || null,
                      },
                    },
                    'Inspection readings recorded. Review the confirmed result in history.',
                  )
                }}
              >
                {plan?.characteristics.map((row) => (
                  <fieldset key={row.key} className="grid min-w-0 gap-3">
                    <legend className="font-bold">{row.label}</legend>
                    <p className="text-sm text-muted">
                      {row.type === 'numeric'
                        ? `Accepted range: ${row.min} to ${row.max} ${row.uom}`
                        : `Expected value: ${row.expected}`}
                    </p>
                    {Array.from({ length: plan.sample_size }, (_, index) => (
                      <label key={index} className="form-label">
                        {row.label} sample {index + 1}
                        {row.type === 'numeric' ? ` (${row.uom})` : ''}
                        <input
                          className="form-input"
                          aria-label={`${row.label} sample ${index + 1}${row.type === 'numeric' ? ` (${row.uom})` : ''}`}
                          name={`${row.key}_${index}`}
                          required
                          maxLength={160}
                          inputMode={
                            row.type === 'numeric' ? 'decimal' : 'text'
                          }
                        />
                      </label>
                    ))}
                  </fieldset>
                ))}
                <Field
                  label={
                    supersedesId
                      ? 'Inspection correction reason'
                      : 'Inspection evidence and reason'
                  }
                  name="reason"
                  maxLength={2000}
                />
              </ActionForm>
            )}
          </div>
          <div className="grid min-w-0 gap-4">
            <h4 className="font-bold">Confirmed inspection history</h4>
            {!history.length && (
              <p className="empty-state">
                No inspections for the selected target.
              </p>
            )}
            {history.map((row) => (
              <article className="record-card" key={row.id}>
                <strong>
                  {row.result === 'passed' ? '✓ Passed' : '⚠ Failed'} ·{' '}
                  {row.kind.replace('_', ' ')}
                </strong>
                <p>
                  {plans.find((entry) => entry.id === row.plan_id)?.label} ·{' '}
                  {plans.find((entry) => entry.id === row.plan_id)?.version}
                </p>
                <p>
                  {plantTimestamp(row.created_at)} · Inspector{' '}
                  {row.inspector_id}
                </p>
                <p>{row.reason}</p>
                {row.supersedes_id && (
                  <p>Correction of inspection {row.supersedes_id}</p>
                )}
                <ul>
                  {row.readings.map((reading) => (
                    <li key={reading.key}>
                      {reading.key}: {reading.values.join(', ')}{' '}
                      {reading.uom ?? ''}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted">Confirmation: {row.id}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      {view === 'NCRs' && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="grid min-w-0 gap-4">
            <label className="form-label">
              Containment lot
              <select
                aria-label="Containment lot"
                className="form-input"
                value={reviewLotId}
                onChange={(event) => setReviewLotId(event.target.value)}
              >
                <option value="">Select lot</option>
                {lots.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.lot_code} · {row.qc_status}
                  </option>
                ))}
              </select>
            </label>
            <StockBalanceSummary
              position={positions.find((row) => row.lot_id === reviewLotId)}
              uom={reviewUnit}
            />
            {permissions.includes('quality.review') && (
              <ActionForm
                title="Contain lot and create NCR"
                disabled={disabled || !reviewLot}
                onSubmit={(form) => {
                  if (reviewLot)
                    void submit(
                      {
                        action: 'create_ncr',
                        data: {
                          lot_id: reviewLot.id,
                          revision: reviewLot.revision,
                          quantity: read(form, 'quantity'),
                          reason: read(form, 'reason'),
                        },
                      },
                      'Lot contained and NCR recorded.',
                    )
                }}
              >
                <Field
                  label={`Affected quantity (${reviewUnit ?? 'unit unavailable'})`}
                  name="quantity"
                />
                <Field
                  label="Containment reason"
                  name="reason"
                  maxLength={2000}
                />
                <p className="text-sm text-muted">
                  The entire lot enters QC hold. The affected quantity is
                  recorded separately.
                </p>
              </ActionForm>
            )}
            {permissions.includes('quality.review') && (
              <ActionForm
                title="Approve NCR disposition"
                disabled={disabled || !ncr || ncr.status !== 'open'}
                onSubmit={(form) => {
                  if (!ncr) return
                  void submit(
                    {
                      action: 'resolve_ncr',
                      data: {
                        ncr_id: ncr.id,
                        revision: ncr.revision,
                        disposition,
                        reason: read(form, 'reason'),
                        ...(disposition === 'rework'
                          ? {
                              package_id: read(form, 'package_id'),
                              number: read(form, 'number'),
                              start_date: read(form, 'start_date'),
                              due_date: read(form, 'due_date'),
                            }
                          : {}),
                      },
                    },
                    'NCR disposition confirmed. Review its remaining physical work below.',
                  )
                }}
              >
                <label className="form-label">
                  Open NCR
                  <select
                    aria-label="Open NCR"
                    className="form-input"
                    value={ncrId}
                    onChange={(event) => {
                      setNcrId(event.target.value)
                      setDisposition('reinspect')
                    }}
                  >
                    <option value="">Select open NCR</option>
                    {data?.ncrs
                      .filter((row) => row.status === 'open')
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {lotName(row.lot_id)} · {row.quantity} {row.uom} ·{' '}
                          {row.id}
                        </option>
                      ))}
                  </select>
                </label>
                {ncr && (
                  <>
                    <p>
                      Contained: {ncr.quantity} {ncr.uom} · {ncr.reason}
                    </p>
                    <StockBalanceSummary
                      position={positions.find(
                        (row) => row.lot_id === ncr.lot_id,
                      )}
                      uom={ncr.uom}
                    />
                  </>
                )}
                <label className="form-label">
                  NCR disposition
                  <select
                    aria-label="NCR disposition"
                    className="form-input"
                    value={disposition}
                    onChange={(event) =>
                      setDisposition(event.target.value as typeof disposition)
                    }
                  >
                    <option value="reinspect">Require reinspection</option>
                    <option value="scrap">Post controlled scrap</option>
                    <option
                      value="supplier_return"
                      disabled={
                        !data?.receipts.some(
                          (row) => row.lot_id === ncr?.lot_id,
                        )
                      }
                    >
                      Authorize supplier return
                    </option>
                    <option value="rework" disabled={!reworkPackages.length}>
                      Create routed rework
                    </option>
                  </select>
                </label>
                {disposition === 'rework' && (
                  <>
                    <label className="form-label">
                      Approved rework package
                      <select
                        aria-label="Approved rework package"
                        className="form-input"
                        name="package_id"
                        required
                        defaultValue=""
                      >
                        <option value="">
                          Select self-component rework package
                        </option>
                        {reworkPackages.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field
                      label="Rework work-order number"
                      name="number"
                      maxLength={64}
                    />
                    <Field
                      label="Rework start date"
                      name="start_date"
                      type="date"
                    />
                    <Field
                      label="Rework due date"
                      name="due_date"
                      type="date"
                    />
                  </>
                )}
                <p className="text-sm text-muted">
                  Reinspection keeps stock held. Scrap posts a quantity-checked
                  ledger event. Stores completes an authorized supplier return;
                  Production completes routed rework.
                </p>
                <Field
                  label="Disposition approval reason"
                  name="reason"
                  maxLength={2000}
                />
              </ActionForm>
            )}
          </div>
          <div className="grid min-w-0 gap-4">
            <h4 className="font-bold">NCR containment and disposition</h4>
            {!data?.ncrs.length && (
              <p className="empty-state">No NCRs recorded.</p>
            )}
            {data?.ncrs.map((row) => (
              <article className="record-card" key={row.id}>
                <strong>
                  {row.status === 'resolved' ? '✓' : '⚠'} {lotName(row.lot_id)}{' '}
                  · {row.status.replaceAll('_', ' ')}
                </strong>
                <p>
                  {row.quantity} {row.uom} · {row.reason}
                </p>
                <p>
                  Disposition: {row.disposition ?? 'Awaiting authorized review'}
                </p>
                {row.review_reason && <p>Review: {row.review_reason}</p>}
                {row.rework_work_order_id && (
                  <p>
                    Rework order:{' '}
                    {production?.works.find(
                      (work) => work.id === row.rework_work_order_id,
                    )?.number ?? row.rework_work_order_id}
                  </p>
                )}
                {row.status === 'awaiting_return' && (
                  <p>
                    Blocked because the physical supplier return is not
                    complete. Stores records it in Purchasing.
                  </p>
                )}
                {row.status === 'awaiting_rework' && (
                  <p>
                    Blocked because routed rework is not complete. Continue in
                    Production.
                  </p>
                )}
                <p className="text-sm text-muted">Confirmation: {row.id}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      {view === 'Traceability' && (
        <div className="mt-4 grid min-w-0 gap-4">
          <label className="form-label">
            Trace lot
            <select
              aria-label="Trace lot"
              className="form-input"
              value={traceLotId}
              onChange={(event) => setTraceLotId(event.target.value)}
            >
              <option value="">Select lot</option>
              {lots.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.lot_code} · {itemName(row.item_id)}
                </option>
              ))}
            </select>
          </label>
          {!traceLotId ? (
            <p className="empty-state">
              Select a lot to see recorded source, output and shipment links.
            </p>
          ) : (
            <>
              {userId && onUpload && onDownload && permissions.includes('documents.read') && <LotEvidencePanel
                key={traceLotId} lots={lots} documents={documents} selectedLotId={traceLotId}
                edges={data?.genealogy ?? []} userId={userId} permissions={permissions} online={online}
                busy={documentBusy} loading={documentLoading} error={documentError} onUpload={onUpload} onDownload={onDownload} />}
              <h4 className="font-bold">Supplier evidence</h4>
              {data?.customerReceipts?.filter((row) => row.lot_id === traceLotId).map((row) => (
                <article className="record-card" key={row.lot_id}>
                  <strong>Customer return: {row.return_number}</strong>
                  <p>Original shipment: {row.shipment_number}</p>
                  <p>{row.quantity} {row.uom} · {row.reference}</p><p>{row.reason}</p>
                  <p className="text-sm text-muted">Returned custody requires its own inspection and disposition.</p>
                </article>
              ))}
              {data?.processReceipts?.filter((row) => row.lot_id === traceLotId).map((row) => (
                <article className="record-card" key={row.lot_id}>
                  <strong>Processor: {row.supplier_name}</strong>
                  <p>Vendor order: {row.vendor_order_number} · {row.process}</p>
                  <p>Processor return reference: {row.reference}</p>
                  <p>Certificate reference: {row.certificate_reference ?? 'Not supplied'}</p>
                  <p className="text-sm text-muted">A reference does not replace the private file or a fresh QC inspection.</p>
                </article>
              ))}
              {!data?.receipts.some((row) => row.lot_id === traceLotId) && (
                <p className="empty-state">
                  No direct supplier receipt for this lot. Follow its material
                  parents below.
                </p>
              )}
              {data?.receipts
                .filter((row) => row.lot_id === traceLotId)
                .map((row) => (
                  <article className="record-card" key={row.lot_id}>
                    <strong>{row.supplier_name}</strong>
                    <p>Supplier lot: {row.supplier_lot}</p>
                    <p>
                      Certificate reference:{' '}
                      {row.certificate_reference ?? 'Not supplied'}
                    </p>
                    <p className="text-sm text-muted">
                      A reference is recorded; it does not assert that a
                      certificate file was uploaded or verified.
                    </p>
                  </article>
                ))}
              <h4 className="font-bold">
                Material parents and production children
              </h4>
              {!data?.genealogy.some(
                (row) =>
                  row.parent_lot_id === traceLotId ||
                  row.child_lot_id === traceLotId,
              ) && (
                <p className="empty-state">
                  No production genealogy edges recorded for this lot.
                </p>
              )}
              {data?.genealogy
                .filter(
                  (row) =>
                    row.parent_lot_id === traceLotId ||
                    row.child_lot_id === traceLotId,
                )
                .map((row) => (
                  <article className="record-card" key={row.id}>
                    <p>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setTraceLotId(row.parent_lot_id)}
                      >
                        Source {lotName(row.parent_lot_id)}
                      </button>
                      {' → '}
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setTraceLotId(row.child_lot_id)}
                      >
                        Output {lotName(row.child_lot_id)}
                      </button>
                    </p>
                    {row.work_order_id ? <p>Work order: {production?.works.find((work) => work.id === row.work_order_id)?.number ?? row.work_order_id}</p>
                      : row.vendor_receipt_id ? <p>Vendor return: {row.quantity} {row.uom} · Confirmation: {row.vendor_receipt_id}</p>
                      : row.customer_return_id ? <p>Customer return: {row.quantity} {row.uom} · Confirmation: {row.customer_return_id}</p>
                      : <p>Lot split / merge: {row.quantity} {row.uom} · Confirmation: {row.transformation_id}</p>}
                    {row.source_issue_id && <p className="text-sm text-muted">Material issue: {row.source_issue_id}</p>}
                  </article>
                ))}
              <h4 className="font-bold">Shipment references</h4>
              {!data?.shipments.some((row) => row.lot_id === traceLotId) && (
                <p className="empty-state">
                  No shipment recorded for this lot.
                </p>
              )}
              {data?.shipments
                .filter((row) => row.lot_id === traceLotId)
                .map((row) => (
                  <article
                    className="record-card"
                    key={`${row.shipment_id}:${row.lot_id}`}
                  >
                    <strong>
                      {row.shipment_number} · {row.status}
                    </strong>
                    <p>
                      {row.quantity} {row.uom}
                    </p>
                    <p className="text-sm text-muted">
                      Shipment: {row.shipment_id}
                    </p>
                  </article>
                ))}
            </>
          )}
        </div>
      )}
    </section>
  )
}
