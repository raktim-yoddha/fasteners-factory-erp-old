import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { importBatchSchema, exportBatchSchema, transferCommandSchema, type TransferCommand } from './dataTransferContract'
export * from './dataTransferContract'
const id = z.uuid()

export function useDataImports(companyId: string|null,enabled: boolean) {
  return useQuery({ queryKey: ['data-imports',companyId],enabled: Boolean(supabase&&companyId&&enabled),queryFn: async () => {
    if (!supabase || !companyId) throw new Error('Select a company.')
    const result=await supabase.rpc('get_data_imports',{ p_company_id: companyId });if (result.error) throw result.error
    return z.array(importBatchSchema).parse(result.data)
  } })
}
export function useAccountingExports(companyId: string|null,enabled: boolean) {
  return useQuery({ queryKey: ['accounting-exports',companyId],enabled: Boolean(supabase&&companyId&&enabled),queryFn: async () => {
    if (!supabase || !companyId) throw new Error('Select a company.')
    const result=await supabase.rpc('get_accounting_exports',{ p_company_id: companyId });if (result.error) throw result.error
    return z.array(exportBatchSchema).parse(result.data)
  } })
}
export function useTransferCommand(companyId: string|null,actorId: string|null) {
  const client=useQueryClient(),retry=useRef<{ request: string;key: string }|null>(null)
  return useMutation({ mutationFn: async (input: TransferCommand) => {
    if (!supabase || !companyId || !actorId) throw new Error('Select a company and sign in.')
    const command=transferCommandSchema.parse(input),request=JSON.stringify({ companyId,actorId,command })
    if (retry.current?.request!==request) retry.current={ request,key: crypto.randomUUID() }
    const attempt=retry.current,base={ p_company_id: companyId,p_idempotency_key: attempt.key }
    const result=command.action==='preview' ? await supabase.rpc('preview_data_import',{ ...base,p_data: command.data })
      : command.action==='apply' ? await supabase.rpc('apply_data_import',{ ...base,p_batch_id: command.id,p_reason: command.reason })
      : command.action==='prepare_export' ? await supabase.rpc('prepare_accounting_export',{ ...base,p_from_date: command.from,p_to_date: command.to })
      : await supabase.rpc('approve_accounting_export',{ ...base,p_batch_id: command.id,p_reason: command.reason })
    if (result.error) throw result.error
    const confirmed=id.parse(result.data);if (retry.current===attempt) retry.current=null;return confirmed
  },onSuccess: () => { void Promise.all(['data-imports','accounting-exports','master-data-options','customers','procurement','stock-lots','stock-explorer','company-audit'].map((key) => client.invalidateQueries({ queryKey: [key] },{ throwOnError: false }))) } })
}
