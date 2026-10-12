import { z } from 'zod'

const value = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()])
export const querySchema = z.object({
  table: z.string().regex(/^[a-z_]+$/),
  fields: z.string().max(4000).default('*'),
  filters: z.array(z.object({ column: z.string().regex(/^[a-z_.]+$/), operator: z.enum(['eq', 'gt', 'lt']), value })).max(20).default([]),
  orders: z.array(z.object({ column: z.string().regex(/^[a-z_]+$/), ascending: z.boolean() })).max(5).default([]),
  limit: z.number().int().min(1).max(10000).optional(),
  single: z.enum(['one', 'maybe']).optional(),
  head: z.boolean().default(false),
  mutation: z.object({ kind: z.enum(['insert', 'update']), values: z.record(z.string(), z.unknown()) }).optional(),
})
export type LocalQuery = z.infer<typeof querySchema>
export const requestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('identity') }),
  z.object({ operation: z.literal('query'), query: querySchema }),
  z.object({ operation: z.literal('command'), name: z.string().regex(/^[a-z_]+$/), args: z.record(z.string(), z.unknown()) }),
  z.object({ operation: z.literal('file_read'), path: z.string().max(400) }),
  z.object({ operation: z.literal('file_write'), path: z.string().max(400), bytes: z.instanceof(Uint8Array), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ operation: z.literal('snapshot') }),
  z.object({ operation: z.literal('restore'), bytes: z.instanceof(Uint8Array), workspaceId: z.uuid() }),
  z.object({ operation: z.literal('cutover_preview'), companyId: z.uuid() }),
  z.object({ operation: z.literal('cutover_pending') }),
  z.object({ operation: z.literal('cutover_prepare'), companyId: z.uuid(), targetCompanyId: z.uuid(), cloudOwnerId: z.uuid(), reason: z.string().trim().min(1).max(2000) }),
  z.object({ operation: z.literal('cutover_attach_backup'), backupId: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ operation: z.literal('cutover_finish'), receipt: z.record(z.string(), z.unknown()) }),
])
export type LocalRequest = z.infer<typeof requestSchema>
export type LocalResponse = { data: unknown; error: { message: string; code: string } | null; count?: number }
