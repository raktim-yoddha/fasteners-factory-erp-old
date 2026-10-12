import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { customerReturnSchema, customerReturnWorkspaceSchema, type CustomerReturnInput } from './customerReturnsContract'
export * from './customerReturnsContract'
const id = z.uuid()

export function useCustomerReturns(companyId: string | null, allowed: boolean) {
  return useQuery({
    // Shipment posting and QC release already invalidate the stock-lots family.
    queryKey: ['stock-lots', 'customer-returns', companyId], enabled: Boolean(companyId && supabase && allowed),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const { data, error } = await supabase.rpc('get_customer_return_workspace', { p_company_id: companyId })
      if (error) throw error
      return customerReturnWorkspaceSchema.parse(data)
    },
  })
}
export function useReceiveCustomerReturn(companyId: string | null) {
  const queryClient = useQueryClient()
  const retry = useRef<{ request: string; key: string } | null>(null)
  return useMutation({
    mutationFn: async (input: CustomerReturnInput) => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const command = customerReturnSchema.parse(input)
      const request = JSON.stringify({ companyId, command })
      if (retry.current?.request !== request) retry.current = { request, key: crypto.randomUUID() }
      const { data, error } = await supabase.rpc('receive_customer_return', {
        p_company_id: companyId, p_data: command, p_idempotency_key: retry.current.key,
      })
      if (error) throw error
      const result = id.parse(data)
      retry.current = null
      return result
    },
    onSuccess: async () => {
      await Promise.all(['customer-returns', 'quality', 'production', 'stock-lots', 'stock-explorer',
        'stock-movements', 'record-workspace', 'dashboard-summary', 'operations-report']
        .map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
    },
  })
}
