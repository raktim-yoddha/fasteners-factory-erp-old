import { z } from 'zod'
import { importKinds } from './importCsv'
const id=z.uuid(),reason=z.string().trim().min(1).max(2000)
export const importBatchSchema=z.object({ id,kind: z.enum(importKinds),source_name: z.string(),source_sha256: z.string(),rows: z.array(z.record(z.string(),z.string())),errors: z.array(z.object({ row: z.number().int().positive(),message: z.string() })),status: z.enum(['preview','applied']),created_at: z.string(),approval_reason: z.string().nullable(),records: z.array(z.object({ row_number: z.number().int().positive(),entity_type: z.string(),entity_id: id })) })
export type ImportBatch=z.infer<typeof importBatchSchema>
export const exportBatchSchema=z.object({ id,from_date: z.string(),to_date: z.string(),format_version: z.literal(1),status: z.enum(['draft','approved']),created_at: z.string(),approval_reason: z.string().nullable(),
  totals: z.array(z.object({ event_type: z.string(),currency: z.string(),record_count: z.number().int().nonnegative(),amount: z.string() })),
  rows: z.array(z.object({ event_type: z.string(),record_id: id,reference: z.string(),occurred_at: z.string(),party_code: z.string(),sku: z.string(),quantity: z.string(),uom: z.string(),currency: z.string(),unit_price: z.string(),amount: z.string() })) })
export type ExportBatch=z.infer<typeof exportBatchSchema>
export const transferCommandSchema=z.discriminatedUnion('action',[
  z.object({ action: z.literal('preview'),data: z.object({ kind: z.enum(importKinds),source_name: z.string().trim().min(1).max(160),source_sha256: z.string().regex(/^[a-f0-9]{64}$/),rows: z.array(z.record(z.string(),z.string())).min(1).max(500) }) }),
  z.object({ action: z.literal('apply'),id,reason }),
  z.object({ action: z.literal('prepare_export'),from: z.iso.date(),to: z.iso.date() }),
  z.object({ action: z.literal('approve_export'),id,reason }),
])
export type TransferCommand=z.input<typeof transferCommandSchema>
