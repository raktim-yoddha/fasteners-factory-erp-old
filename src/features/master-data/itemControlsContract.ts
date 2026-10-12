import { z } from 'zod'
import { positiveDecimalSchema } from '@/lib/decimal'

const id = z.uuid()
const lifecycle = { id, company_id: id, item_id: id, version: z.number().int().positive(), status: z.enum(['draft','approved','retired']), evidence: z.string(), retirement_reason: z.string().nullable() }
export const specificationSchema = z.object({ ...lifecycle, product_type: z.string(), diameter_mm: z.string().nullable(), length_mm: z.string().nullable(), thread_pitch_mm: z.string().nullable(),
  thread_designation: z.string(), material_grade: z.string(), property_class: z.string(), coating: z.string(), standard_reference: z.string() })
export const conversionSchema = z.object({ ...lifecycle, from_uom: z.enum(['pcs','kg','m','set','box','bundle']), to_uom: z.enum(['pcs','kg','m','set']), from_quantity: z.string(), to_quantity: z.string() })
export type ItemSpecification = z.infer<typeof specificationSchema>
export type UnitConversion = z.infer<typeof conversionSchema>
export const itemControlsSchema = z.object({ specifications: z.array(specificationSchema), conversions: z.array(conversionSchema) })
const evidence = z.string().trim().min(1).max(2000)
const optionalMeasurement = z.union([positiveDecimalSchema, z.literal('')]).nullable()
export const itemControlCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_specification'), data: z.object({ item_id: id, product_type: z.string().trim().min(1).max(120), diameter_mm: optionalMeasurement, length_mm: optionalMeasurement, thread_pitch_mm: optionalMeasurement,
    thread_designation: z.string().trim().max(120), material_grade: z.string().trim().max(120), property_class: z.string().trim().max(120), coating: z.string().trim().max(120), standard_reference: z.string().trim().max(160), evidence }) }),
  z.object({ action: z.literal('create_conversion'), data: z.object({ item_id: id, from_uom: conversionSchema.shape.from_uom, from_quantity: positiveDecimalSchema, to_quantity: positiveDecimalSchema, evidence }) }),
  z.object({ action: z.enum(['approve_specification','retire_specification','approve_conversion','retire_conversion']), data: z.object({ id, reason: evidence }) }),
])
export type ItemControlCommand = z.input<typeof itemControlCommandSchema>
