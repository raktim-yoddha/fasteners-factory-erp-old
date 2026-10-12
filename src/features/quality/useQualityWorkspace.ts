import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { qualityWorkspaceSchema, qualityCommandSchema, type QualityCommand } from './qualityWorkspaceContract'
export * from './qualityWorkspaceContract'
const id = z.uuid()

export function useQualityWorkspace(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['quality', companyId],
    enabled: Boolean(companyId && supabase && enabled),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const { data, error } = await supabase.rpc('get_quality_workspace', {
        p_company_id: companyId,
      })
      if (error) throw error
      return qualityWorkspaceSchema.parse(data)
    },
  })
}

export function useQualityCommand(companyId: string | null) {
  const queryClient = useQueryClient()
  const retry = useRef<{ request: string; key: string } | null>(null)
  return useMutation({
    mutationFn: async (input: QualityCommand) => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const command = qualityCommandSchema.parse(input)
      const request = JSON.stringify({ companyId, command })
      if (retry.current?.request !== request)
        retry.current = { request, key: crypto.randomUUID() }
      // ADR 0017: quality records and transitions are confirmed by one server command.
      const { data, error } = await supabase.rpc('quality_command', {
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
