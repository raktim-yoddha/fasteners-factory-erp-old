import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { equipmentWorkspaceSchema, equipmentCommandSchema, type EquipmentCommand } from './equipmentContract'
export * from './equipmentContract'
const id = z.uuid()

export function useEquipment(companyId: string|null, allowed: boolean) {
  return useQuery({ queryKey: ['equipment',companyId], enabled: Boolean(supabase && companyId && allowed), queryFn: async () => {
    if (!supabase || !companyId) throw new Error('Select a company.')
    const result = await supabase.rpc('get_equipment_workspace', { p_company_id: companyId })
    if (result.error) throw result.error
    return equipmentWorkspaceSchema.parse(result.data)
  } })
}
export function useEquipmentCommand(companyId: string|null, actorId: string) {
  const client = useQueryClient(), retry = useRef<{ request: string; key: string }|null>(null)
  return useMutation({ mutationFn: async (input: EquipmentCommand) => {
    if (!supabase || !companyId) throw new Error('Select a company.')
    const command = equipmentCommandSchema.parse(input), request = JSON.stringify({ companyId, actorId, command })
    if (retry.current?.request!==request) retry.current = { request, key: crypto.randomUUID() }
    const attempt = retry.current
    const result = await supabase.rpc('equipment_command', { p_company_id: companyId, p_action: command.action, p_data: command.data, p_idempotency_key: attempt.key })
    if (result.error) throw result.error
    const receipt = id.parse(result.data)
    if (retry.current===attempt) retry.current=null
    return receipt
  }, onSuccess: () => { void Promise.all(['equipment','production','quality','company-audit'].map((key) => client.invalidateQueries({ queryKey: [key] }, { throwOnError: false }))) } })
}
