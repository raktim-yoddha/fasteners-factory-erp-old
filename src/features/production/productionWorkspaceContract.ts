import { z } from 'zod'
import { decimalSchema, positiveDecimalSchema } from '@/lib/decimal'

const id = z.uuid()
const unit = z.enum(['pcs', 'kg', 'm', 'set'])
const revision = z.number().int().positive()
const quantity = z.string()
const reason = z.string().trim().min(1).max(2000)
const number = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9/-]{2,63}$/)

export const productionWorkspaceSchema = z.object({
  packages: z.array(
    z.object({
      id,
      item_id: id,
      label: z.string(),
      bom_revision_id: id,
      routing_revision_id: id,
      status: z.string(),
      basis_quantity: quantity,
      uom: unit,
      components: z.array(
        z.object({
          item_id: id,
          quantity,
          uom: unit,
          scrap_allowance_pct: quantity,
        }),
      ),
      operations: z.array(
        z.object({
          sequence: z.number().int().positive(),
          work_centre_id: id,
          name: z.string(),
        }),
      ),
    }),
  ),
  demand: z.array(
    z.object({
      id,
      order_number: z.string(),
      item_id: id,
      ordered_quantity: quantity,
      uom: unit,
      promised_date: z.string().nullable(),
      planned_quantity: quantity,
      remaining_to_plan: quantity,
    }),
  ),
  works: z.array(
    z.object({
      id,
      number: z.string(),
      sales_order_line_id: id.nullable(),
      source_ncr_id: id.nullable(),
      approved_rework_lot_id: id.nullable(),
      item_id: id,
      quantity,
      uom: unit,
      status: z.string(),
      revision,
      start_date: z.string(),
      due_date: z.string(),
      bom_revision_id: id,
      routing_revision_id: id,
      drawing_revision_id: id.nullable(),
      customer_part_reference_id: id.nullable().optional(),
      item_specification_id: id.nullable().optional(),
      customer_part_number: z.string().nullable().optional(),
      customer_part_revision: z.string().nullable().optional(),
    }),
  ),
  jobs: z.array(
    z.object({
      id,
      work_order_id: id,
      sequence: z.number().int(),
      name: z.string(),
      work_centre_id: id,
      planned_quantity: quantity,
      good_quantity: quantity,
      scrap_quantity: quantity,
      uom: unit,
      status: z.string(),
      revision,
    }),
  ),
  requirements: z.array(
    z.object({
      work_order_id: id,
      item_id: id,
      required_quantity: quantity,
      uom: unit,
      consumed_quantity: quantity,
      wip_quantity: quantity,
      available_quantity: quantity,
      expected_receipts: quantity,
    }),
  ),
  issues: z.array(
    z.object({
      id,
      work_order_id: id,
      job_card_id: id,
      lot_id: id,
      item_id: id,
      quantity,
      remaining_quantity: quantity,
      uom: unit,
    }),
  ),
  outputs: z.array(
    z.object({ id, work_order_id: id, lot_id: id, quantity, uom: unit }),
  ),
  workCentres: z.array(z.object({ id, code: z.string(), name: z.string() })),
})
export type ProductionWorkspace = z.infer<typeof productionWorkspaceSchema>

export const productionCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_package'),
    data: z.object({
      item_id: id,
      revision_label: z.string().trim().min(1).max(24),
      basis_quantity: positiveDecimalSchema,
      components: z
        .array(
          z.object({
            item_id: id,
            quantity: positiveDecimalSchema,
            uom: unit,
            scrap_allowance_pct: decimalSchema.refine((value) => /^\d{1,3}(?:\.\d{1,4})?$/.test(value) && Number(value) <= 100, 'Use a scrap allowance from 0 to 100 with up to four decimal places.'),
          }),
        )
        .min(1)
        .max(100),
      operations: z
        .array(
          z.object({
            sequence: z.number().int().positive(),
            work_centre_id: id,
            name: z.string().trim().min(1).max(160),
          }),
        )
        .min(1)
        .max(50),
    }),
  }),
  z.object({
    action: z.literal('approve_package'),
    data: z.object({ package_id: id }),
  }),
  z.object({
    action: z.literal('create_work_order'),
    data: z.object({
      sales_order_line_id: id,
      package_id: id,
      number,
      quantity: positiveDecimalSchema,
      start_date: z.string().date(),
      due_date: z.string().date(),
    }),
  }),
  z.object({
    action: z.literal('release_work_order'),
    data: z.object({ work_order_id: id, revision }),
  }),
  z.object({
    action: z.literal('start_job'),
    data: z.object({ job_card_id: id, revision }),
  }),
  z.object({
    action: z.literal('complete_job'),
    data: z.object({
      job_card_id: id,
      revision,
      good_quantity: decimalSchema,
      scrap_quantity: decimalSchema,
      reason,
    }),
  }),
  z.object({
    action: z.literal('issue_material'),
    data: z.object({
      work_order_id: id,
      job_card_id: id,
      lot_id: id,
      quantity: positiveDecimalSchema,
      uom: unit,
      lot_revision: revision,
    }),
  }),
  z.object({
    action: z.literal('return_material'),
    data: z.object({
      issue_id: id,
      quantity: positiveDecimalSchema,
      reason,
      lot_revision: revision,
    }),
  }),
  z.object({
    action: z.literal('consume_material'),
    data: z.object({ issue_id: id, quantity: positiveDecimalSchema, reason }),
  }),
  z.object({
    action: z.literal('record_output'),
    data: z.object({
      work_order_id: id,
      location_id: id,
      lot_code: number,
      quantity: positiveDecimalSchema,
      uom: unit,
    }),
  }),
  z.object({
    action: z.literal('close_work_order'),
    data: z.object({ work_order_id: id, revision }),
  }),
])
export type ProductionCommand = z.input<typeof productionCommandSchema>
