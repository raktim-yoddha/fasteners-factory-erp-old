import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const membershipSchema = z.object({ company_id: z.uuid() })
const companySchema = z.object({ id: z.uuid(), name: z.string().min(1) })

export type AccessibleCompany = z.infer<typeof companySchema>

export function useAccessibleCompanies(enabled: boolean) {
  return useQuery({
    queryKey: ['accessible-companies'],
    enabled: enabled && Boolean(supabase),
    queryFn: async (): Promise<AccessibleCompany[]> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { data: memberships, error: membershipError } = await supabase
        .from('company_memberships')
        .select('company_id')
        .eq('active', true)
      if (membershipError) throw membershipError

      const ids = z.array(membershipSchema).parse(memberships).map((membership) => membership.company_id)
      if (ids.length === 0) return []
      const { data: companies, error: companyError } = await supabase
        .from('companies')
        .select('id, name')
        .in('id', ids)
        .order('name')
      if (companyError) throw companyError
      return z.array(companySchema).parse(companies)
    }
  })
}
