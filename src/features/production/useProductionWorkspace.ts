import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { productionWorkspaceSchema, productionCommandSchema, type ProductionCommand } from './productionWorkspaceContract'
export * from './productionWorkspaceContract'
const id = z.uuid()

export function useProductionWorkspace(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['production', companyId],
    enabled: Boolean(companyId && supabase && enabled),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const { data, error } = await supabase.rpc('get_production_workspace', {
        p_company_id: companyId,
      })
      if (error) throw error
      return productionWorkspaceSchema.parse(data)
    },
  })
}

export function useProductionCommand(companyId: string | null) {
  const queryClient = useQueryClient()
  const retry = useRef<{ request: string; key: string } | null>(null)
  return useMutation({
    mutationFn: async (input: ProductionCommand) => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const command = productionCommandSchema.parse(input)
      const request = JSON.stringify({ companyId, command })
      if (retry.current?.request !== request)
        retry.current = { request, key: crypto.randomUUID() }
      const { data, error } = await supabase.rpc('production_command', {
        p_company_id: companyId,
        p_action: command.action,
        p_data: command.data,
        p_idempotency_key: retry.current.key,
      })
      if (error) throw error
      const result = id.parse(data)
      retry.current = null
      return result
    },
    onSuccess: async () => {
      await Promise.all(
        [
          'production',
          'quality',
          'stock-lots',
          'stock-explorer',
          'stock-movements',
          'record-workspace',
          'global-search',
          'dashboard-summary',
          'order-command-center',
          'dispatch-records',
          'procurement',
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      )
    },
  })
}
