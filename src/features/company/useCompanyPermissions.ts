import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

export function useCompanyPermissions(companyId: string | null) {
  return useQuery({
    queryKey: ['company-permissions', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const { data, error } = await supabase.rpc('get_my_company_permissions', {
        p_company_id: companyId,
      })
      if (error) throw error
      return z
        .array(z.object({ permission_code: z.string() }))
        .parse(data)
        .map((row) => row.permission_code)
    },
  })
}
