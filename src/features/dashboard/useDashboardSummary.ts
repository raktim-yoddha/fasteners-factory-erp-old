import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type DashboardSummary = {
  rfqs: number
  salesOrders: number
  availableLots: number
  shipments: number
}

async function countRows(table: 'rfqs' | 'sales_orders' | 'shipments', companyId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('company_id', companyId)
  if (error) throw error
  return count ?? 0
}

async function countAvailableLots(companyId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { count, error } = await supabase
    .from('stock_positions')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('qc_status', 'released')
    .gt('available_to_promise', 0)
  if (error) throw error
  return count ?? 0
}

export function useDashboardSummary(companyId: string | null) {
  return useQuery({
    queryKey: ['dashboard-summary', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async (): Promise<DashboardSummary> => {
      if (!companyId) throw new Error('A company is required to load the dashboard summary.')
      const [rfqs, salesOrders, availableLots, shipments] = await Promise.all([
        countRows('rfqs', companyId),
        countRows('sales_orders', companyId),
        countAvailableLots(companyId),
        countRows('shipments', companyId)
      ])

      return { rfqs, salesOrders, availableLots, shipments }
    }
  })
}
