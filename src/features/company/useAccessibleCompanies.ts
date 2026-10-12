import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const companySchema = z.object({ id: z.uuid(), name: z.string().min(1) })

export type AccessibleCompany = z.infer<typeof companySchema>

export function useAccessibleCompanies(enabled: boolean) {
  return useQuery({
    queryKey: ['accessible-companies'],
    enabled: enabled && Boolean(supabase),
    queryFn: async (): Promise<AccessibleCompany[]> => {
      if (!supabase) throw new Error('Supabase is not configured.')
      // RLS already limits companies to this operator's active memberships.
      const { data: companies, error: companyError } = await supabase
        .from('companies')
        .select('id, name')
        .order('name')
      if (companyError) throw companyError
      return z.array(companySchema).parse(companies)
    },
  })
}
