import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { plantDate } from '@/lib/decimal'
import type { EquipmentWorkspace, EquipmentCommand } from './useEquipment'

export type EquipmentPanelProps = { data: EquipmentWorkspace; permissions: string[]; disabled: boolean; onCommand: (command: EquipmentCommand) => Promise<string> }
export function EquipmentPanel({ data, permissions, disabled, onCommand }: EquipmentPanelProps) {
  const [assetId,setAssetId]=useState(''), [action,setAction]=useState<'calibration'|'maintenance'|'hold'|'clear_hold'>('calibration')
  const asset=data.assets.find((row) => row.id===assetId), canManage=permissions.includes('equipment.manage'), canPlan=permissions.includes('planning.manage')
  const eventActions = (['calibration','maintenance','hold','clear_hold'] as const).filter((value) => permissions.includes(value==='calibration' ? 'equipment.calibrate' : value==='maintenance' ? 'equipment.maintain' : 'equipment.manage'))
  const selectedAction=eventActions.includes(action) ? action : eventActions[0], needsDate=selectedAction==='calibration' || selectedAction==='maintenance'
  function submit(input: EquipmentCommand) { void onCommand(input).catch(() => undefined) }
  return <section className="record-panel" aria-labelledby="equipment-readiness-title">
    <h3 id="equipment-readiness-title" className="font-bold">Equipment readiness</h3>
    <p className="empty-state">Register actual machines, tools and gauges. Gauges need current passed calibration. Maintenance is required only when configured. Recorded holds block assigned jobs and inspections; clearing a hold preserves calibration and maintenance checks.</p>
    {canManage && <ActionForm title="Register equipment" disabled={disabled} lockInputs onSubmit={(form) => { const f=new FormData(form);submit({ action: 'create_asset', data: { code: String(f.get('code')).trim().toUpperCase(), name: String(f.get('name')), kind: f.get('kind') as 'machine'|'tool'|'gauge', work_centre_id: String(f.get('centre'))||null, requires_maintenance: f.get('maintenance')==='on', reason: String(f.get('reason')) } }) }}>
      <label className="form-label">Equipment code<input className="form-input" name="code" required maxLength={64} /></label>
      <label className="form-label">Equipment name<input className="form-input" name="name" required maxLength={160} /></label>
      <label className="form-label">Equipment kind<select className="form-input" name="kind"><option value="machine">Machine</option><option value="tool">Tool</option><option value="gauge">Gauge</option></select></label>
      <label className="form-label">Equipment work centre<select className="form-input" name="centre"><option value="">Shared equipment</option>{data.centres.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
      <label className="checkbox-label"><input name="maintenance" type="checkbox" /> Requires maintenance evidence</label>
      <label className="form-label">Registration reason<input className="form-input" name="reason" required maxLength={2000} /></label>
    </ActionForm>}
    <label className="form-label">Selected equipment<select aria-label="Selected equipment" className="form-input" value={assetId} disabled={disabled} onChange={(event) => setAssetId(event.target.value)}><option value="">Select equipment</option>{data.assets.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
    {asset && <>
      <p role="status" className={asset.blocked_reason ? 'feedback feedback-blocked' : 'feedback'}>{asset.blocked_reason ? `⚠ Blocked because ${asset.blocked_reason}` : '◇ Ready under recorded checks'}</p>
      {eventActions.length>0 && <>
        <label className="form-label">Equipment action<select className="form-input" value={selectedAction} disabled={disabled} onChange={(event) => setAction(event.target.value as typeof action)}>{eventActions.map((value) => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>
        <ActionForm key={`${assetId}-${selectedAction}`} title="Record equipment evidence" disabled={disabled || (selectedAction==='calibration' && asset.kind!=='gauge')} lockInputs onSubmit={(form) => { const f=new FormData(form), reason=String(f.get('reason'));if (!selectedAction) return
          if (selectedAction==='calibration' || selectedAction==='maintenance') submit({ action: selectedAction, data: { asset_id: assetId, checked_on: String(f.get('checked')), next_due: String(f.get('due')), passed: f.get('result')==='passed', reference: String(f.get('reference')), reason } })
          else submit({ action: selectedAction, data: { asset_id: assetId, reason } })
        }}>
          {needsDate && <><label className="form-label">Check date<input className="form-input" type="date" name="checked" defaultValue={plantDate()} max={plantDate()} required /></label><label className="form-label">Next due date<input className="form-input" type="date" name="due" required /></label><label className="form-label">Evidence result<select className="form-input" name="result"><option value="passed">Passed</option><option value="failed">Failed</option></select></label><label className="form-label">Evidence reference<input className="form-input" name="reference" required maxLength={500} /></label></>}
          <label className="form-label">Equipment evidence reason<input className="form-input" name="reason" required maxLength={2000} /></label>
        </ActionForm>
      </>}
      {canPlan && <ActionForm title="Assign equipment to job" disabled={disabled} lockInputs onSubmit={(form) => { const f=new FormData(form);submit({ action: 'assign_job_asset', data: { asset_id: assetId, job_card_id: String(f.get('job')), reason: String(f.get('reason')) } }) }}>
        <label className="form-label">Equipment job<select aria-label="Equipment job" className="form-input" name="job" required><option value="">Select pending job</option>{data.jobs.filter((row) => row.status==='pending' && (!asset.work_centre_id || row.work_centre_id===asset.work_centre_id)).map((row) => <option key={row.id} value={row.id}>{row.work_number} · {row.sequence} · {row.name}</option>)}</select></label>
        <label className="form-label">Assignment reason<input className="form-input" name="reason" required maxLength={2000} /></label>
      </ActionForm>}
      {permissions.includes('quality.manage') && asset.kind==='gauge' && <ActionForm title="Bind gauge to draft plan" disabled={disabled} lockInputs onSubmit={(form) => { const f=new FormData(form);submit({ action: 'link_gauge_plan', data: { asset_id: assetId, plan_id: String(f.get('plan')), reason: String(f.get('reason')) } }) }}>
        <label className="form-label">Gauge inspection plan<select aria-label="Gauge inspection plan" className="form-input" name="plan" required><option value="">Select draft plan</option>{data.plans.filter((row) => row.status==='draft').map((row) => <option key={row.id} value={row.id}>{row.label} · {row.version}</option>)}</select></label>
        <label className="form-label">Gauge binding reason<input className="form-input" name="reason" required maxLength={2000} /></label>
      </ActionForm>}
      <ul className="record-list" aria-label="Equipment job assignments">{data.assignments.filter((row) => row.asset_id===assetId).map((row) => { const job=data.jobs.find((j) => j.id===row.job_card_id);return <li key={row.id}><p>{job ? `${job.work_number} · ${job.name}` : `Job ${row.job_card_id}`}</p>{canPlan && job?.status==='pending' && <ActionForm title="Release equipment assignment" disabled={disabled} lockInputs onSubmit={(form) => submit({ action: 'release_job_asset', data: { assignment_id: row.id, reason: String(new FormData(form).get('reason')) } })}><label className="form-label">Assignment release reason<input className="form-input" name="reason" required /></label></ActionForm>}</li> })}</ul>
      <ul className="record-list" aria-label="Gauge plan bindings">{data.plan_gauges.filter((row) => row.asset_id===assetId).map((row) => { const plan=data.plans.find((p) => p.id===row.plan_id);return <li key={row.id}>Plan {plan?.label??row.plan_id} · {plan?.version} · {plan?.status}</li> })}</ul>
      <ol aria-label="Equipment evidence history">{data.events.filter((row) => row.asset_id===assetId).map((row) => <li key={row.id}>{row.checked_on} · {row.kind} · {row.passed===null ? '' : row.passed ? 'Passed' : 'Failed'}{row.next_due ? ` · Due ${row.next_due}` : ''} · {row.reference} · {row.reason}</li>)}</ol>
    </>}
    {data.assets.length===0 && <p className="empty-state">No equipment registered. Readiness is unconfigured until actual equipment is registered and assigned.</p>}
  </section>
}
