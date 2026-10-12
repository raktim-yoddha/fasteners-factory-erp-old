import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { vendorWorkspaceSchema, vendorCommandSchema, type VendorCommand } from './vendorJobworkContract'
export * from './vendorJobworkContract'
const id = z.uuid()

export function useVendorJobwork(companyId: string | null, permitted: boolean) {
  return useQuery({
    queryKey: ['vendor-jobwork', companyId], enabled: Boolean(companyId && supabase && permitted),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const result = await supabase.rpc('get_vendor_workspace', { p_company_id: companyId })
      if (result.error) throw result.error
      return vendorWorkspaceSchema.parse(result.data)
    },
  })
}
export function useVendorCommand(companyId: string | null) {
  const client = useQueryClient()
  const retry = useRef<{ request: string; key: string } | null>(null)
  return useMutation({
    mutationFn: async (input: VendorCommand) => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const command = vendorCommandSchema.parse(input)
      const request = JSON.stringify({ companyId, command })
      if (retry.current?.request !== request) retry.current = { request, key: crypto.randomUUID() }
      const result = await supabase.rpc('vendor_jobwork_command', {
        p_company_id: companyId, p_action: command.action, p_data: command.data, p_idempotency_key: retry.current.key,
      })
      if (result.error) throw result.error
      const confirmation = id.parse(result.data)
      retry.current = null
      return confirmation
    },
    onSuccess: async () => {
      await Promise.all(['vendor-jobwork', 'stock-lots', 'stock-explorer', 'stock-movements', 'production', 'quality', 'dashboard-summary', 'order-command-center', 'dispatch-records']
        .map((key) => client.invalidateQueries({ queryKey: [key] })))
    },
  })
}
