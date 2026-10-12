import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const plantSchema = z.object({ id: z.uuid(), name: z.string() })
const warehouseSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
})
const itemSchema = z.object({
  id: z.uuid(),
  sku: z.string(),
  description: z.string(),
  base_uom: z.enum(['pcs', 'kg', 'm', 'set']),
  specification: z.string().nullable().optional(),
  grade: z.string().nullable().optional(),
  dimensions: z.string().nullable().optional(),
  storage_requirements: z.string().nullable().optional(),
  reorder_quantity: z.string().nullable().optional(),
  preferred_supplier_id: z.uuid().nullable().optional(),
})
const locationSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
})

export type MasterDataOptions = {
  plants: z.infer<typeof plantSchema>[]
  warehouses: z.infer<typeof warehouseSchema>[]
  items: z.infer<typeof itemSchema>[]
  locations: z.infer<typeof locationSchema>[]
}

export function useMasterDataOptions(companyId: string | null) {
  return useQuery({
    queryKey: ['master-data-options', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async (): Promise<MasterDataOptions> => {
      if (!supabase || !companyId)
        throw new Error('A company is required to load master data.')
      const [plantsResult, warehousesResult, itemsResult, locationsResult] =
        await Promise.all([
          supabase
            .from('plants')
            .select('id, name')
            .eq('company_id', companyId)
            .order('name'),
          supabase
            .from('warehouses')
            .select('id, code, name')
            .eq('company_id', companyId)
            .eq('active', true)
            .order('name'),
          supabase
            .from('items')
            .select(
              'id, sku, description, base_uom,specification,grade,dimensions,storage_requirements,reorder_quantity::text,preferred_supplier_id',
            )
            .eq('company_id', companyId)
            .eq('active', true)
            .order('sku'),
          supabase
            .from('stock_locations')
            .select('id, code, name')
            .eq('company_id', companyId)
            .eq('active', true)
            .order('code'),
        ])
      if (plantsResult.error) throw plantsResult.error
      if (warehousesResult.error) throw warehousesResult.error
      if (itemsResult.error) throw itemsResult.error
      if (locationsResult.error) throw locationsResult.error
      return {
        plants: z.array(plantSchema).parse(plantsResult.data),
        warehouses: z.array(warehouseSchema).parse(warehousesResult.data),
        items: z.array(itemSchema).parse(itemsResult.data),
        locations: z.array(locationSchema).parse(locationsResult.data),
      }
    },
  })
}
