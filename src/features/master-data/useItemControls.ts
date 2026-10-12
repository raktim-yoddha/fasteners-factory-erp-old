import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { itemControlsSchema, itemControlCommandSchema, type ItemControlCommand } from './itemControlsContract'
export * from './itemControlsContract'
const id = z.uuid()

export function useItemControls(companyId: string | null, allowed: boolean) {
  return useQuery({ queryKey: ['item-controls', companyId], enabled: Boolean(supabase && companyId && allowed), queryFn: async () => {
    if (!supabase || !companyId) throw new Error('Select a company.')
    const result = await supabase.rpc('get_item_controls', { p_company_id: companyId })
    if (result.error) throw result.error
    return itemControlsSchema.parse(result.data)
  } })
}
export function useItemControlCommand(companyId: string | null, actorId: string | null) {
  const client = useQueryClient()
  const retry = useRef<{ request: string; key: string } | null>(null)
  return useMutation({ mutationFn: async (input: ItemControlCommand) => {
    if (!supabase || !companyId || !actorId) throw new Error('Select a company and sign in.')
    const command = itemControlCommandSchema.parse(input), request = JSON.stringify({ companyId, actorId, command })
    if (retry.current?.request !== request) retry.current = { request, key: crypto.randomUUID() }
    const attempt = retry.current
    const result = await supabase.rpc('item_control_command', { p_company_id: companyId, p_action: command.action, p_data: command.data, p_idempotency_key: attempt.key })
    if (result.error) throw result.error
    const confirmed = id.parse(result.data)
    if (retry.current === attempt) retry.current = null
    return confirmed
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ['item-controls'] }, { throwOnError: false }) } })
}
