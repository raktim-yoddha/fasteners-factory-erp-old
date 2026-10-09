import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type DashboardSummary = {
  rfqs: number
  salesOrders: number
  availableLots: number
  shipments: number
}

async function countRows(table: 'rfqs' | 'sales_orders' | 'shipments') {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

async function countAvailableLots() {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { count, error } = await supabase
    .from('stock_positions')
    .select('*', { count: 'exact', head: true })
    .eq('qc_status', 'released')
    .gt('available_to_promise', 0)
  if (error) throw error
  return count ?? 0
}

export function useDashboardSummary(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-summary'],
    enabled: enabled && Boolean(supabase),
    queryFn: async (): Promise<DashboardSummary> => {
      const [rfqs, salesOrders, availableLots, shipments] = await Promise.all([
        countRows('rfqs'),
        countRows('sales_orders'),
        countAvailableLots(),
        countRows('shipments')
      ])

      return { rfqs, salesOrders, availableLots, shipments }
    }
  })
}
