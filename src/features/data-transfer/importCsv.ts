import { z } from 'zod'
import { parseCsv } from '@/lib/csv'
import { positiveDecimalSchema } from '@/lib/decimal'

export const importKinds=['customers','suppliers','items','opening_stock'] as const
export type ImportKind=typeof importKinds[number]
export const importHeaders: Record<ImportKind,string[]>={ customers: ['code','name'],suppliers: ['code','name'],items: ['sku','description','base_uom'],opening_stock: ['sku','location_code','lot_code','quantity','uom','reference'] }
const code=z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9/-]{2,63}$/), unit=z.enum(['pcs','kg','m','set'])
const schemas={ customers: z.object({ code,name: z.string().trim().min(1).max(160) }),suppliers: z.object({ code,name: z.string().trim().min(1).max(160) }),
  items: z.object({ sku: code,description: z.string().trim().min(1).max(500),base_uom: unit }),
  opening_stock: z.object({ sku: code,location_code: code,lot_code: code,quantity: positiveDecimalSchema,uom: unit,reference: z.string().trim().min(1).max(500) }) }
export const importRowSchemas = schemas
export function parseImportCsv(text: string,kind: ImportKind): Record<string,string>[] {
  const [header,...rows]=parseCsv(text), expected=importHeaders[kind]
  if (!header || header.map((key) => key.trim()).join(',')!==expected.join(',')) throw new Error(`Use these exact headers, in order: ${expected.join(',')}`)
  if (!rows.length) throw new Error('CSV needs at least one data row.')
  return rows.map((row,index) => {
    if (row.length!==expected.length) throw new Error(`Data row ${index+1}: expected ${expected.length} fields.`)
    const result=schemas[kind].safeParse(Object.fromEntries(expected.map((key,col) => [key,row[col]!])) )
    if (!result.success) throw new Error(`Data row ${index+1}: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
    return result.data
  })
}
