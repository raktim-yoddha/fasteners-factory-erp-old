import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const id = z.uuid()
const position = z.object({
  lot_id: id,
  item_id: id,
  location_id: id,
  qc_status: z.string(),
  on_hand: z.string(),
  reserved: z.string(),
  available_to_promise: z.string(),
})
export type StockPosition = z.infer<typeof position>
const movement = z.object({
  id: z.string().regex(/^\d+$/),
  movement_type: z.string(),
  quantity_delta: z.string(),
  uom: z.string(),
  source_type: z.string(),
  source_id: id.nullable(),
  occurred_at: z.string(),
  reason: z.string().nullable(),
})
export type StockMovement = z.infer<typeof movement>
export function useStockExplorer(companyId: string | null) {
  return useQuery({
    queryKey: ['stock-explorer', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const { data, error } = await supabase
        .from('stock_positions')
        .select(
          'lot_id,item_id,location_id,qc_status,on_hand::text,reserved::text,available_to_promise::text',
        )
        .eq('company_id', companyId)
      if (error) throw error
      return z.array(position).parse(data)
    },
  })
}
export function useStockMovements(
  companyId: string | null,
  lotId: string | null,
  beforeId: string | null = null,
) {
  return useQuery({
    queryKey: ['stock-movements', companyId, lotId, beforeId],
    enabled: Boolean(companyId && lotId && supabase),
    queryFn: async () => {
      if (!supabase || !companyId || !lotId) throw new Error('Select a lot.')
      let query = supabase
        .from('stock_ledger_entries')
        .select(
          'id::text,movement_type,quantity_delta::text,uom,source_type,source_id,occurred_at,reason',
        )
        .eq('company_id', companyId)
        .eq('lot_id', lotId)
        .order('id', { ascending: false })
        .limit(101)
      if (beforeId) query=query.lt('id',z.string().regex(/^\d+$/).parse(beforeId))
      const { data,error }=await query
      if (error) throw error
      const rows=z.array(movement).parse(data)
      return { rows: rows.slice(0,100),hasMore: rows.length>100 }
    },
  })
}
