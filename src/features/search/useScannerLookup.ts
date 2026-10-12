import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { searchResultSchema } from './useGlobalSearch'

export const scanInputSchema=z.string().trim().min(1).max(100).refine((value) => !/\p{Cc}/u.test(value),'Scan one identifier at a time.')
export function useScannerLookup(companyId: string|null) {
  return useMutation({ mutationFn: async (query: string) => {
    if (!supabase || !companyId) throw new Error('Select a company.')
    const result=await supabase.rpc('lookup_scanned_record',{ p_company_id: companyId,p_query: scanInputSchema.parse(query) })
    if (result.error) throw result.error
    return z.array(searchResultSchema).parse(result.data)
  } })
}
