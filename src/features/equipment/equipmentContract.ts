import { z } from 'zod'

const id = z.uuid(), reason = z.string().trim().min(1).max(2000), date = z.iso.date()
const minutes = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/).refine((value) => /[1-9]/.test(value), 'Enter positive minutes.')
export const equipmentWorkspaceSchema = z.object({
  assets: z.array(z.object({ id, code: z.string(), name: z.string(), kind: z.enum(['machine','tool','gauge']), work_centre_id: id.nullable(), requires_maintenance: z.boolean(), blocked_reason: z.string().nullable() })),
  events: z.array(z.object({ id, asset_id: id, kind: z.enum(['calibration','maintenance','hold','clear_hold']), checked_on: date, next_due: date.nullable(), passed: z.boolean().nullable(), reference: z.string(), reason: z.string(), recorded_sequence: z.string() })),
  centres: z.array(z.object({ id, code: z.string(), name: z.string() })),
  jobs: z.array(z.object({ id, work_number: z.string(), name: z.string(), sequence: z.number(), work_centre_id: id, status: z.string() })),
  assignments: z.array(z.object({ id, job_card_id: id, asset_id: id })),
  plans: z.array(z.object({ id, label: z.string(), version: z.string(), status: z.string() })),
  plan_gauges: z.array(z.object({ id, plan_id: id, asset_id: id })),
  shifts: z.array(z.object({ id, work_centre_id: id, label: z.string(), starts_at: z.string(), ends_at: z.string(), break_minutes: z.number(), status: z.string(), available_minutes: z.string(), allocated_minutes: z.string() })),
  allocations: z.array(z.object({ id, shift_id: id, job_card_id: id, minutes: z.string() })),
})
export type EquipmentWorkspace = z.infer<typeof equipmentWorkspaceSchema>
export const emptyEquipment: EquipmentWorkspace = { assets: [], events: [], centres: [], jobs: [], assignments: [], plans: [], plan_gauges: [], shifts: [], allocations: [] }
export const equipmentCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_asset'), data: z.object({ code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9/-]{2,63}$/), name: z.string().trim().min(1).max(160), kind: z.enum(['machine','tool','gauge']), work_centre_id: id.nullable(), requires_maintenance: z.boolean(), reason }) }),
  ...(['calibration','maintenance'] as const).map((action) => z.object({ action: z.literal(action), data: z.object({ asset_id: id, checked_on: date, next_due: date, passed: z.boolean(), reference: z.string().trim().min(1).max(500), reason }).refine((data) => data.next_due>=data.checked_on, 'The next due date must follow the check.') })),
  ...(['hold','clear_hold'] as const).map((action) => z.object({ action: z.literal(action), data: z.object({ asset_id: id, reason }) })),
  z.object({ action: z.literal('assign_job_asset'), data: z.object({ asset_id: id, job_card_id: id, reason }) }),
  z.object({ action: z.literal('release_job_asset'), data: z.object({ assignment_id: id, reason }) }),
  z.object({ action: z.literal('link_gauge_plan'), data: z.object({ asset_id: id, plan_id: id, reason }) }),
  z.object({ action: z.literal('create_shift'), data: z.object({ work_centre_id: id, label: z.string().trim().min(1).max(120), from_date: date, from_time: z.iso.time({ precision: -1 }), to_date: date, to_time: z.iso.time({ precision: -1 }), break_minutes: z.coerce.number().int().nonnegative(), reason }) }),
  z.object({ action: z.literal('cancel_shift'), data: z.object({ shift_id: id, reason }) }),
  z.object({ action: z.literal('allocate'), data: z.object({ shift_id: id, job_card_id: id, minutes, reason }) }),
  z.object({ action: z.literal('release_allocation'), data: z.object({ allocation_id: id, reason }) }),
])
export type EquipmentCommand = z.input<typeof equipmentCommandSchema>
