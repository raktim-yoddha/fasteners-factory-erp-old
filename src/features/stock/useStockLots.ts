import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const lotSchema = z.object({
  id: z.uuid(),
  item_id: z.uuid(),
  lot_code: z.string(),
  qc_status: z.enum(['released', 'hold', 'rejected']),
  revision: z.number().int(),
})
export type StockLot = z.infer<typeof lotSchema>

export function useStockLots(companyId: string | null) {
  return useQuery({
    queryKey: ['stock-lots', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async (): Promise<StockLot[]> => {
      if (!supabase || !companyId)
        throw new Error('A company is required to load stock lots.')
      const { data, error } = await supabase
        .from('stock_lots')
        .select('id, item_id, lot_code, qc_status, revision')
        .eq('company_id', companyId)
        .order('lot_code')
      if (error) throw error
      return z.array(lotSchema).parse(data)
    },
  })
}
