import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const rowSchema = z.object({
  sales_order_id: z.uuid(),
  sales_order_number: z.string(),
  customer_po_number: z.string(),
  sales_order_status: z.string(),
  promised_date: z.string().nullable(),
  active_reservation_count: z.coerce.number().int().nonnegative(),
  prepared_shipment_count: z.coerce.number().int().nonnegative(),
  dispatched_shipment_count: z.coerce.number().int().nonnegative(),
  stock_status: z.string(),
  packing_dispatch_status: z.string(),
  next_action: z.string()
})

export type OrderCommandCenterRow = z.infer<typeof rowSchema>

export function useOrderCommandCenter(companyId: string | null) {
  return useQuery({
    queryKey: ['order-command-center', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async (): Promise<OrderCommandCenterRow[]> => {
      if (!supabase || !companyId) throw new Error('A company is required to load the order command centre.')
      const { data, error } = await supabase.rpc('get_order_command_center', { p_company_id: companyId })
      if (error) throw error
      return z.array(rowSchema).parse(data)
    }
  })
}
