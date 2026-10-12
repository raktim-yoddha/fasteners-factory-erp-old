import { z } from 'zod'
import { positiveDecimalSchema } from '@/lib/decimal'

export const transformationSchema = z.object({
  kind: z.enum(['split', 'merge']),
  sources: z.array(z.object({ lot_id: z.uuid(), revision: z.number().int().positive(), quantity: positiveDecimalSchema })).min(1).max(20),
  location_id: z.uuid(), lot_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9/-]{2,63}$/),
  uom: z.enum(['pcs', 'kg', 'm', 'set']), reason: z.string().trim().min(1).max(2000),
}).refine((value) => new Set(value.sources.map((row) => row.lot_id)).size === value.sources.length, 'Select each source lot once.')
  .refine((value) => value.kind === 'split' ? value.sources.length === 1 : value.sources.length >= 2, 'Split needs one source; merge needs at least two.')
export type LotTransformation = z.input<typeof transformationSchema>
