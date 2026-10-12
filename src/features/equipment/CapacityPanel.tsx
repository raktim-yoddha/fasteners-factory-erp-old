import { ActionForm } from '@/components/ActionForm'
import { displayDecimal, plantDate, plantTimestamp } from '@/lib/decimal'
import type { EquipmentPanelProps } from './EquipmentPanel'

export function CapacityPanel({ data, permissions, disabled, onCommand }: EquipmentPanelProps) {
  const canPlan=permissions.includes('planning.manage')
  return <section className="record-panel" aria-labelledby="capacity-title">
    <h3 id="capacity-title" className="font-bold">Shift capacity</h3>
    <p className="empty-state">Enter actual shifts and break minutes in plant time (Asia/Kolkata). Allocation minutes are explicit planning estimates. The server rejects overlapping shifts and allocations beyond the entered shift capacity.</p>
    {canPlan && <ActionForm title="Create capacity shift" disabled={disabled} lockInputs onSubmit={(form) => { const f=new FormData(form);void onCommand({ action: 'create_shift', data: { work_centre_id: String(f.get('centre')), label: String(f.get('label')), from_date: String(f.get('from_date')), from_time: String(f.get('from_time')), to_date: String(f.get('to_date')), to_time: String(f.get('to_time')), break_minutes: String(f.get('breaks')), reason: String(f.get('reason')) } }).catch(() => undefined) }}>
      <label className="form-label">Shift work centre<select aria-label="Shift work centre" className="form-input" name="centre" required><option value="">Select work centre</option>{data.centres.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
      <label className="form-label">Shift label<input className="form-input" name="label" required maxLength={120} /></label>
      <div className="filter-bar"><label className="form-label">Shift start date<input className="form-input" type="date" name="from_date" defaultValue={plantDate()} required /></label><label className="form-label">Shift start time<input className="form-input" type="time" name="from_time" required /></label><label className="form-label">Shift end date<input className="form-input" type="date" name="to_date" defaultValue={plantDate()} required /></label><label className="form-label">Shift end time<input className="form-input" type="time" name="to_time" required /></label></div>
      <label className="form-label">Break minutes<input className="form-input" name="breaks" type="number" min="0" step="1" defaultValue="0" required /></label>
      <label className="form-label">Shift reason<input className="form-input" name="reason" required maxLength={2000} /></label>
    </ActionForm>}
    {data.shifts.length===0 && <p className="empty-state">Capacity is unconfigured. Add an actual shift before allocating work.</p>}
    <ul className="record-list" aria-label="Capacity shifts">{data.shifts.map((shift) => <li key={shift.id}>
      <strong>{shift.label} · {data.centres.find((row) => row.id===shift.work_centre_id)?.code}</strong>
      <p>{plantTimestamp(shift.starts_at)} → {plantTimestamp(shift.ends_at)} · {shift.status}</p>
      <p>{displayDecimal(shift.available_minutes)} min capacity · {displayDecimal(shift.allocated_minutes)} min allocated · {shift.break_minutes} min breaks</p>
      {canPlan && shift.status==='active' && <>
        <ActionForm title="Allocate job minutes" disabled={disabled} lockInputs onSubmit={(form) => { const f=new FormData(form);void onCommand({ action: 'allocate', data: { shift_id: shift.id, job_card_id: String(f.get('job')), minutes: String(f.get('minutes')), reason: String(f.get('reason')) } }).catch(() => undefined) }}>
          <label className="form-label">Capacity job<select aria-label="Capacity job" className="form-input" name="job" required><option value="">Select pending job</option>{data.jobs.filter((row) => row.status==='pending' && row.work_centre_id===shift.work_centre_id).map((row) => <option key={row.id} value={row.id}>{row.work_number} · {row.sequence} · {row.name}</option>)}</select></label>
          <label className="form-label">Allocated minutes<input className="form-input" name="minutes" inputMode="decimal" required /></label>
          <label className="form-label">Allocation reason<input className="form-input" name="reason" required maxLength={2000} /></label>
        </ActionForm>
        <ActionForm title="Cancel capacity shift" disabled={disabled || !/^0(?:\.0+)?$/.test(shift.allocated_minutes)} lockInputs onSubmit={(form) => { void onCommand({ action: 'cancel_shift', data: { shift_id: shift.id, reason: String(new FormData(form).get('reason')) } }).catch(() => undefined) }}><label className="form-label">Shift cancellation reason<input className="form-input" name="reason" required maxLength={2000} /></label></ActionForm>
        {!/^0(?:\.0+)?$/.test(shift.allocated_minutes) && <p className="empty-state">Blocked because this shift has active allocations. Release pending allocations first.</p>}
      </>}
      <ul aria-label={`Allocations for ${shift.label}`}>{data.allocations.filter((row) => row.shift_id===shift.id).map((row) => { const job=data.jobs.find((j) => j.id===row.job_card_id);return <li key={row.id}><p>{job ? `${job.work_number} · ${job.name}` : `Job ${row.job_card_id}`} · {row.minutes} min</p>{canPlan && job?.status==='pending' && <ActionForm title="Release capacity allocation" disabled={disabled} lockInputs onSubmit={(form) => { void onCommand({ action: 'release_allocation', data: { allocation_id: row.id, reason: String(new FormData(form).get('reason')) } }).catch(() => undefined) }}><label className="form-label">Capacity release reason<input className="form-input" name="reason" required maxLength={2000} /></label></ActionForm>}</li> })}</ul>
    </li>)}</ul>
  </section>
}
