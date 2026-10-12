import { equipmentCommandSchema } from '@/features/equipment/equipmentContract'
import { plantDate } from '@/lib/decimal'
import { type CommandContext, type CommandHandler } from './context'
import { add, decimal } from './exact'
import type { Row } from './database'

export function assetBlockReason(c: CommandContext, id: unknown): string | null {
  const asset = c.one('equipment_assets', id), events = c.rows('equipment_events', { asset_id: asset.id })
  const hold = events.filter((row) => row.kind === 'hold' || row.kind === 'clear_hold').at(-1)
  if (hold?.kind === 'hold') return `Equipment held: ${hold.reason}`
  for (const kind of [asset.kind === 'gauge' ? 'calibration' : null, asset.requires_maintenance ? 'maintenance' : null].filter(Boolean)) {
    const latest = events.filter((row) => row.kind === kind).sort((a, b) => String(a.checked_on).localeCompare(String(b.checked_on)) || Number(a.recorded_sequence) - Number(b.recorded_sequence)).at(-1)
    if (!latest) return `${kind} evidence is missing.`
    if (!latest.passed) return `Latest ${kind} failed.`
    if (String(latest.next_due) < plantDate()) return `${kind} expired on ${latest.next_due}.`
  }
  return null
}
export function activeAssignments(c: CommandContext) { return c.rows('job_equipment_assignments').filter((row) => !c.rows('job_equipment_releases', { assignment_id: row.id }).length) }
export function activeAllocations(c: CommandContext) { return c.rows('capacity_allocations').filter((row) => !c.rows('capacity_releases', { allocation_id: row.id }).length) }
export function equipmentWorkspace(c: CommandContext) {
  return { assets: c.rows('equipment_assets').map((row) => ({ ...row, blocked_reason: assetBlockReason(c, row.id) })), events: c.rows('equipment_events').map((row) => ({ ...row, recorded_sequence: String(row.recorded_sequence) })), centres: c.rows('work_centres'), jobs: c.rows('job_cards').filter((row) => row.status !== 'completed').map((row) => ({ ...row, work_number: c.one('work_orders', row.work_order_id).number })), assignments: activeAssignments(c), plans: c.rows('inspection_plans'), plan_gauges: c.rows('inspection_plan_gauges'), shifts: c.rows('capacity_shifts').map((row): Row => ({ ...row, available_minutes: String((Date.parse(String(row.ends_at)) - Date.parse(String(row.starts_at))) / 60000 - Number(row.break_minutes)), allocated_minutes: add(...activeAllocations(c).filter((entry) => entry.shift_id === row.id).map((entry) => entry.minutes)) })), allocations: activeAllocations(c) }
}
export const equipmentCommand: CommandHandler = (c, a) => {
  const command = equipmentCommandSchema.parse({ action: a.p_action, data: a.p_data }), d = command.data as Row
  let result: Row
  if (command.action === 'create_asset') {
    if (d.work_centre_id) c.one('work_centres', d.work_centre_id)
    result = c.insert('equipment_assets', d)
  } else if (['calibration', 'maintenance', 'hold', 'clear_hold'].includes(command.action)) {
    const asset = c.one('equipment_assets', d.asset_id)
    if (command.action === 'calibration' && asset.kind !== 'gauge') throw new Error('GAUGE_REQUIRED')
    if (d.checked_on && String(d.checked_on) > plantDate()) throw new Error('INVALID_DATE_RANGE')
    result = c.insert('equipment_events', { ...d, kind: command.action, checked_on: d.checked_on ?? plantDate(), reference: d.reference ?? d.reason })
  } else if (command.action === 'assign_job_asset') {
    const job = c.one('job_cards', d.job_card_id), asset = c.one('equipment_assets', d.asset_id); c.state(job, 'pending')
    if (asset.work_centre_id && asset.work_centre_id !== job.work_centre_id) throw new Error('EQUIPMENT_CONTEXT_MISMATCH')
    if (activeAssignments(c).some((row) => row.job_card_id === job.id && row.asset_id === asset.id)) throw new Error('EQUIPMENT_ALREADY_ASSIGNED')
    result = c.insert('job_equipment_assignments', d)
  } else if (command.action === 'release_job_asset') {
    const assignment = c.one('job_equipment_assignments', d.assignment_id); c.state(c.one('job_cards', assignment.job_card_id), 'pending')
    if (!activeAssignments(c).some((row) => row.id === assignment.id)) throw new Error('INVALID_TRANSITION')
    result = c.insert('job_equipment_releases', d)
  } else if (command.action === 'link_gauge_plan') {
    const asset = c.one('equipment_assets', d.asset_id); c.state(c.one('inspection_plans', d.plan_id), 'draft')
    if (asset.kind !== 'gauge') throw new Error('GAUGE_REQUIRED')
    result = c.insert('inspection_plan_gauges', d)
  } else if (command.action === 'create_shift') {
    c.one('work_centres', d.work_centre_id)
    const start = new Date(`${d.from_date}T${d.from_time}:00+05:30`), end = new Date(`${d.to_date}T${d.to_time}:00+05:30`), minutes = (end.getTime() - start.getTime()) / 60000
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440 || Number(d.break_minutes) >= minutes) throw new Error('INVALID_DATE_RANGE')
    const starts = start.toISOString(), ends = end.toISOString()
    if (c.rows('capacity_shifts', { work_centre_id: d.work_centre_id, status: 'active' }).some((row) => String(row.starts_at) < ends && String(row.ends_at) > starts)) throw new Error('CAPACITY_SHIFT_OVERLAP')
    result = c.insert('capacity_shifts', { ...d, starts_at: starts, ends_at: ends })
  } else if (command.action === 'release_allocation') {
    const allocation = c.one('capacity_allocations', d.allocation_id); c.state(c.one('job_cards', allocation.job_card_id), 'pending')
    if (!activeAllocations(c).some((row) => row.id === allocation.id)) throw new Error('INVALID_TRANSITION')
    result = c.insert('capacity_releases', d)
  } else {
    const shift = c.one('capacity_shifts', d.shift_id); c.state(shift, 'active')
    const position = equipmentWorkspace(c).shifts.find((row) => row.id === shift.id)!
    if (command.action === 'cancel_shift') {
      if (decimal(position.allocated_minutes) !== 0n) throw new Error('CAPACITY_ALLOCATIONS_EXIST')
      c.update('capacity_shifts', shift, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: c.actor, cancellation_reason: d.reason }); result = shift
    } else {
      const job = c.one('job_cards', d.job_card_id); c.state(job, 'pending')
      if (job.work_centre_id !== shift.work_centre_id) throw new Error('EQUIPMENT_CONTEXT_MISMATCH')
      if (decimal(add(position.allocated_minutes, d.minutes)) > decimal(position.available_minutes)) throw new Error('CAPACITY_EXCEEDED')
      result = c.insert('capacity_allocations', d)
    }
  }
  c.audit('equipment', result.id, `equipment.${command.action}`, d.reason); return result.id
}
