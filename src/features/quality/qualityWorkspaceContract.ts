import { z } from 'zod'
import { positiveDecimalSchema } from '@/lib/decimal'

const id = z.uuid()
const revision = z.number().int().positive()
const reason = z.string().trim().min(1).max(2000)
const label = z.string().trim().min(1).max(160)
export const measurementSchema = z
  .string()
  .trim()
  .regex(
    /^-?\d{1,12}(?:\.\d{1,6})?$/,
    'Use a signed decimal with up to six decimal places.',
  )
export const characteristicSchema = z.discriminatedUnion('type', [
  z.object({
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    label,
    type: z.literal('numeric'),
    uom: z.string().trim().min(1).max(32),
    min: measurementSchema,
    max: measurementSchema,
  }),
  z.object({
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    label,
    type: z.literal('attribute'),
    expected: label,
  }),
])
export type QualityCharacteristic = z.infer<typeof characteristicSchema>
const reading = z.object({
  key: z.string(),
  uom: z.string().optional(),
  values: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
})
export const qualityWorkspaceSchema = z.object({
  customerReceipts: z.array(z.object({
    lot_id: id, return_number: z.string(), shipment_number: z.string(), reference: z.string(),
    reason: z.string(), quantity: z.string(), uom: z.string(),
  })).optional(),
  processReceipts: z.array(z.object({
    lot_id: id, vendor_order_number: z.string(), supplier_name: z.string(), process: z.string(),
    reference: z.string(), certificate_reference: z.string().nullable(),
  })).optional(),
  contexts: z.array(z.object({lot_id:id,requires_final:z.boolean(),sales_order_line_id:id.nullable()})).optional(),
  plans: z.array(
    z.object({
      id,
      item_id: id,
      label: z.string(),
      version: z.string(),
      sample_size: z.number().int().min(1).max(100),
      characteristics: z.array(characteristicSchema).min(1).max(50),
      status: z.enum(['draft', 'approved']),
    }),
  ),
  inspections: z.array(
    z.object({
      id,
      plan_id: id,
      lot_id: id.nullable(),
      job_card_id: id.nullable(),
      kind: z.enum(['incoming', 'in_process', 'final']),
      result: z.enum(['passed', 'failed']),
      lot_revision: revision.nullable(),
      reason: z.string(),
      inspector_id: id,
      created_at: z.string(),
      readings: z.array(reading),
      supersedes_id: id.nullable().optional(),
    }),
  ),
  ncrs: z.array(
    z.object({
      id,
      lot_id: id,
      inspection_id: id.nullable(),
      quantity: z.string(),
      uom: z.string(),
      reason: z.string(),
      status: z.string(),
      disposition: z.string().nullable(),
      revision,
      review_reason: z.string().nullable(),
      rework_work_order_id: id.nullable(),
    }),
  ),
  genealogy: z.array(
    z.object({
      id,
      parent_lot_id: id,
      child_lot_id: id,
      work_order_id: id.nullable(),
      source_issue_id: id.nullable(),
      transformation_id: id.nullable().optional(),
      vendor_receipt_id: id.nullable().optional(),
      customer_return_id: id.nullable().optional(),
      quantity: z.string().nullable().optional(),
      uom: z.string().nullable().optional(),
    }),
  ),
  receipts: z.array(
    z.object({
      lot_id: id,
      supplier_lot: z.string(),
      certificate_reference: z.string().nullable(),
      supplier_name: z.string(),
    }),
  ),
  shipments: z.array(
    z.object({
      lot_id: id,
      shipment_id: id,
      shipment_number: z.string(),
      status: z.string(),
      quantity: z.string(),
      uom: z.string(),
    }),
  ),
})
export type QualityWorkspace = z.infer<typeof qualityWorkspaceSchema>
export const qualityCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_plan'),
    data: z.object({
      item_id: id,
      label,
      version: z.string().trim().min(1).max(24),
      sample_size: z.number().int().min(1).max(100),
      characteristics: z
        .array(characteristicSchema)
        .min(1)
        .max(50)
        .refine(
          (rows) => new Set(rows.map((row) => row.key)).size === rows.length,
          'Each characteristic needs a unique key.',
        ),
    }),
  }),
  z.object({
    action: z.literal('approve_plan'),
    data: z.object({ plan_id: id }),
  }),
  z.object({
    action: z.literal('inspect'),
    data: z
      .object({
        plan_id: id,
        lot_id: id.nullable(),
        job_card_id: id.nullable(),
        kind: z.enum(['incoming', 'in_process', 'final']),
        revision,
        readings: z.array(reading).min(1).max(50),
        reason,
        supersedes_id: id.nullable(),
      })
      .refine(
        (value) => (value.lot_id === null) !== (value.job_card_id === null),
        'Choose one lot or one job card.',
      ),
  }),
  z.object({
    action: z.literal('create_ncr'),
    data: z.object({
      lot_id: id,
      revision,
      quantity: positiveDecimalSchema,
      reason,
    }),
  }),
  z.object({
    action: z.literal('resolve_ncr'),
    data: z
      .object({
        ncr_id: id,
        revision,
        disposition: z.enum([
          'reinspect',
          'scrap',
          'supplier_return',
          'rework',
        ]),
        reason,
        package_id: id.optional(),
        number: z
          .string()
          .trim()
          .regex(/^[A-Z0-9][A-Z0-9/-]{2,63}$/)
          .optional(),
        start_date: z.string().date().optional(),
        due_date: z.string().date().optional(),
      })
      .refine(
        (value) =>
          value.disposition !== 'rework' ||
          Boolean(
            value.package_id &&
            value.number &&
            value.start_date &&
            value.due_date,
          ),
        'Rework needs an approved package, work number and dates.',
      ),
  }),
])
export type QualityCommand = z.input<typeof qualityCommandSchema>
