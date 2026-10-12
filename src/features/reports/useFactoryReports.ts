import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { recordKinds } from '@/features/records/recordTypes'

export const reportDefinitions = [
  { kind: 'backlog', label: 'Order backlog', permission: 'sales.read', family: 'commercial-records' },
  { kind: 'shortages', label: 'Material shortages', permission: 'production.read', family: 'production' },
  { kind: 'wip', label: 'WIP aging', permission: 'production.read', family: 'production' },
  { kind: 'receipts', label: 'Outstanding purchase receipts', permission: 'purchase.read', family: 'procurement' },
  { kind: 'ncr', label: 'NCR aging', permission: 'quality.read', family: 'quality' },
  { kind: 'yield', label: 'Production output and scrap', permission: 'production.read', family: 'production' },
  { kind: 'vendor', label: 'Vendor custody aging', permission: 'jobwork.read', family: 'vendor-jobwork' },
  { kind: 'movements', label: 'Stock movements', permission: 'stock.read', family: 'stock-movements' },
] as const
export const reportFilterSchema = z.object({
  kind: z.enum(['backlog', 'shortages', 'wip', 'receipts', 'ncr', 'yield', 'vendor', 'movements']),
  from: z.union([z.literal(''), z.iso.date()]), to: z.union([z.literal(''), z.iso.date()]),
  search: z.string().trim().max(100), page: z.number().int().min(0).max(10000),
}).refine((value) => !value.from || !value.to || value.from <= value.to, { message: 'From date must be on or before To date.', path: ['from'] })
export type ReportFilters = z.infer<typeof reportFilterSchema>
export const factoryReportSchema = z.object({
  total: z.number().int().nonnegative(), page: z.number().int().nonnegative(), page_size: z.literal(50), as_of: z.string(),
  rows: z.array(z.object({
    key: z.string(), record_id: z.uuid(), record_kind: z.enum(recordKinds), label: z.string(), sku: z.string(),
    party: z.string().nullable(), status: z.string(), occurred_at: z.string(), due_date: z.string().nullable(),
    age_days: z.number().int().nonnegative(), overdue: z.boolean(),
    quantity: z.string().regex(/^-?\d+(?:\.\d+)?$/), quantity_label: z.string(), uom: z.string(), details: z.string(),
  })),
})
export type FactoryReport = z.infer<typeof factoryReportSchema>
export function useFactoryReport(companyId: string | null, filters: ReportFilters, allowed: boolean) {
  const definition = reportDefinitions.find((row) => row.kind === filters.kind)!
  return useQuery({
    // Reuse source invalidations so confirmed writes refresh a mounted report.
    queryKey: [definition.family, 'operations-report', companyId, filters],
    enabled: Boolean(companyId && supabase && allowed),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const input = reportFilterSchema.parse(filters)
      const { data, error } = await supabase.rpc('get_factory_report', {
        p_company_id: companyId, p_kind: input.kind, p_from: input.from || null,
        p_to: input.to || null, p_search: input.search, p_page: input.page,
      })
      if (error) throw error
      return factoryReportSchema.parse(data)
    },
  })
}
