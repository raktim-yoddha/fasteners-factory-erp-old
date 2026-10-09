import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const plantSchema = z.object({ id: z.uuid(), name: z.string() })
const warehouseSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string() })

export type MasterDataOptions = {
  plants: z.infer<typeof plantSchema>[]
  warehouses: z.infer<typeof warehouseSchema>[]
}

export function useMasterDataOptions(companyId: string | null) {
  return useQuery({
    queryKey: ['master-data-options', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async (): Promise<MasterDataOptions> => {
      if (!supabase || !companyId) throw new Error('A company is required to load master data.')
      const [plantsResult, warehousesResult] = await Promise.all([
        supabase.from('plants').select('id, name').eq('company_id', companyId).order('name'),
        supabase.from('warehouses').select('id, code, name').eq('company_id', companyId).eq('active', true).order('name')
      ])
      if (plantsResult.error) throw plantsResult.error
      if (warehousesResult.error) throw warehousesResult.error
      return { plants: z.array(plantSchema).parse(plantsResult.data), warehouses: z.array(warehouseSchema).parse(warehousesResult.data) }
    }
  })
}
