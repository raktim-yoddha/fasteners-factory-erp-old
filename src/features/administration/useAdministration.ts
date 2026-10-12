import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

export const roles = ['admin','management','sales','engineering','costing','planning','purchase','stores','production_supervisor','operator','quality','subcontract_coordinator','packing_dispatch','accounts','auditor'] as const
export const memberSchema = z.object({ user_id: z.uuid(), display_name: z.string(), active: z.boolean(), revision: z.number().int().positive(), roles: z.array(z.enum(roles)) })
export type CompanyMember = z.infer<typeof memberSchema>
export const memberAccessSchema = z.object({ user_id: z.uuid(), roles: z.array(z.enum(roles)).min(1).max(15), active: z.boolean(), expected_revision: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(2000) })
export type MemberAccess = z.input<typeof memberAccessSchema>
export const auditPageSchema = z.object({ rows: z.array(z.object({ id: z.string().regex(/^\d+$/), actor_id: z.uuid().nullable(), entity_type: z.string(), entity_id: z.uuid().nullable(), action: z.string(), occurred_at: z.string(), reason: z.string().nullable(), metadata: z.record(z.string(),z.unknown()) })), has_more: z.boolean() })
export type AuditPage = z.infer<typeof auditPageSchema>
export type AuditFilter = { search: string; beforeId: string | null; fromDate: string; toDate: string }
export function useCompanyMembers(companyId: string | null, allowed: boolean) {
  return useQuery({ queryKey: ['company-members',companyId],enabled: Boolean(supabase && companyId && allowed),queryFn: async () => {
    if (!supabase || !companyId) throw new Error('Select a company.')
    const result = await supabase.rpc('get_company_members',{ p_company_id: companyId })
    if (result.error) throw result.error
    return z.array(memberSchema).parse(result.data)
  } })
}
export function useMemberAccess(companyId: string | null, actorId: string | null) {
  const client = useQueryClient(), retry = useRef<{ request: string; key: string } | null>(null)
  return useMutation({ mutationFn: async (input: MemberAccess) => {
    if (!supabase || !companyId || !actorId) throw new Error('Select a company and sign in.')
    const data = memberAccessSchema.parse(input), request = JSON.stringify({ companyId,actorId,data })
    if (retry.current?.request!==request) retry.current={ request,key: crypto.randomUUID() }
    const attempt=retry.current
    const result=await supabase.rpc('set_company_member_access',{ p_company_id: companyId,p_data: data,p_idempotency_key: attempt.key })
    if (result.error) throw result.error
    const id=z.uuid().parse(result.data)
    if (retry.current===attempt) retry.current=null
    return id
  },onSuccess: (userId) => {
    if (userId===actorId) client.clear()
    else void Promise.all(['company-members','company-audit'].map((key) => client.invalidateQueries({ queryKey: [key] },{ throwOnError: false })))
  } })
}
export function useAuditPage(companyId: string | null, allowed: boolean, filter: AuditFilter) {
  return useQuery({ queryKey: ['company-audit',companyId,filter],enabled: Boolean(supabase && companyId && allowed),queryFn: async () => {
    if (!supabase || !companyId) throw new Error('Select a company.')
    if (filter.fromDate && filter.toDate && filter.fromDate>filter.toDate) throw new Error('The start date must be before the end date.')
    const result=await supabase.rpc('get_company_audit_page',{ p_company_id: companyId,p_search: filter.search,p_before_id: filter.beforeId,p_from_date: filter.fromDate||null,p_to_date: filter.toDate||null })
    if (result.error) throw result.error
    return auditPageSchema.parse(result.data)
  } })
}
