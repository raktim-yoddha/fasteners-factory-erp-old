import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const searchResultSchema = z.object({ record_type: z.string(), record_id: z.uuid(), label: z.string() })
export type GlobalSearchResult = z.infer<typeof searchResultSchema>

export function useGlobalSearch(companyId: string | null, query: string) {
  const normalizedQuery = query.trim()

  return useQuery({
    queryKey: ['global-search', companyId, normalizedQuery],
    enabled: Boolean(companyId && supabase && normalizedQuery.length >= 2),
    queryFn: async (): Promise<GlobalSearchResult[]> => {
      if (!supabase || !companyId) throw new Error('A company is required to search records.')
      const { data, error } = await supabase.rpc('search_company_records', { p_company_id: companyId, p_query: normalizedQuery })
      if (error) throw error
      return z.array(searchResultSchema).parse(data)
    }
  })
}
