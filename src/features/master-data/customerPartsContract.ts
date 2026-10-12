import { z } from 'zod'

export const customerPartSchema = z.object({
  id: z.uuid(), company_id: z.uuid(), customer_id: z.uuid(), item_id: z.uuid(), part_number: z.string(), part_revision: z.string(),
  reference_version: z.number().int().positive(), description: z.string(), drawing_revision_id: z.uuid().nullable(), drawing_label: z.string().nullable(),
  customer_name: z.string(), customer_code: z.string(), sku: z.string(), created_by: z.uuid(), created_at: z.string(),
  retired_at: z.string().nullable(), retired_by: z.uuid().nullable(), retirement_reason: z.string().nullable(),
})
export type CustomerPart = z.infer<typeof customerPartSchema>
const reason = z.string().trim().min(1).max(2000)
export const customerPartCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), data: z.object({ customer_id: z.uuid(), item_id: z.uuid(), part_number: z.string().trim().min(1).max(80).toUpperCase(),
    part_revision: z.string().trim().max(24).toUpperCase().default(''), description: z.string().trim().min(1).max(500), drawing_revision_id: z.uuid().nullable(), reason }) }),
  z.object({ action: z.literal('retire'), referenceId: z.uuid(), reason }),
])
export type CustomerPartCommand = z.input<typeof customerPartCommandSchema>
