import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const customerSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
})
export type CustomerOption = z.infer<typeof customerSchema>

export function useCustomers(companyId: string | null) {
  return useQuery({
    queryKey: ['customers', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async (): Promise<CustomerOption[]> => {
      if (!supabase || !companyId)
        throw new Error('A company is required to load customers.')
      const { data, error } = await supabase
        .from('customers')
        .select('id, code, name')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name')
      if (error) throw error
      return z.array(customerSchema).parse(data)
    },
  })
}
