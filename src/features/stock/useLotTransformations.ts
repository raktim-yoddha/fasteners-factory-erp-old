import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { transformationSchema, type LotTransformation } from './lotTransformationsContract'
export * from './lotTransformationsContract'
export function useLotTransformation(companyId: string | null) {
  const client = useQueryClient()
  const retry = useRef<{ request: string; key: string } | null>(null)
  return useMutation({
    mutationFn: async (input: LotTransformation) => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const { kind, ...data } = transformationSchema.parse(input)
      const request = JSON.stringify({ companyId, kind, data })
      if (retry.current?.request !== request) retry.current = { request, key: crypto.randomUUID() }
      const result = await supabase.rpc('transform_stock_lot', { p_company_id: companyId, p_kind: kind, p_data: data, p_idempotency_key: retry.current.key })
      if (result.error) throw result.error
      const confirmation = z.uuid().parse(result.data)
      retry.current = null
      return confirmation
    },
    onSuccess: async () => {
      await Promise.all(['stock-lots', 'stock-explorer', 'stock-movements', 'production', 'quality', 'record-workspace', 'global-search', 'order-command-center']
        .map((key) => client.invalidateQueries({ queryKey: [key] })))
    },
  })
}
