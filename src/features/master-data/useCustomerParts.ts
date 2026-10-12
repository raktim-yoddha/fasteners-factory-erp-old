import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { customerPartSchema, customerPartCommandSchema, type CustomerPartCommand } from './customerPartsContract'
export * from './customerPartsContract'

export function useCustomerParts(companyId: string | null, allowed: boolean) {
  return useQuery({
    queryKey: ['customer-parts', companyId], enabled: Boolean(supabase && companyId && allowed),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const result = await supabase.rpc('get_customer_part_workspace', { p_company_id: companyId })
      if (result.error) throw result.error
      return z.array(customerPartSchema).parse(result.data)
    },
  })
}
export function useCustomerPartCommand(companyId: string | null, actorId: string | null) {
  const client = useQueryClient()
  const retry = useRef<{ request: string; key: string } | null>(null)
  const invalidate = async () => {
    await Promise.all(['customer-parts','commercial-detail','commercial-records','record-workspace','production','dispatch-records'].map((key) => client.invalidateQueries({ queryKey: [key] })))
  }
  return useMutation({
    mutationFn: async (input: CustomerPartCommand) => {
      if (!supabase || !companyId || !actorId) throw new Error('Select a company and sign in.')
      const command = customerPartCommandSchema.parse(input)
      const request = JSON.stringify({ companyId, actorId, command })
      if (retry.current?.request !== request) retry.current = { request, key: crypto.randomUUID() }
      const attempt = retry.current
      const args = { p_company_id: companyId, p_idempotency_key: attempt.key }
      const result = command.action === 'create' ? await supabase.rpc('create_customer_part_reference', { ...args, p_data: command.data })
        : await supabase.rpc('retire_customer_part_reference', { ...args, p_reference_id: command.referenceId, p_reason: command.reason })
      if (result.error) throw result.error
      const id = z.uuid().parse(result.data)
      if (retry.current === attempt) retry.current = null
      return id
    }, onSuccess: invalidate, onError: invalidate,
  })
}
