import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const bootstrapSchema = z.object({
  companyName: z.string().trim().min(1).max(160),
  plantName: z.string().trim().min(1).max(160)
})

export type InitialCompanyBootstrapInput = z.input<typeof bootstrapSchema>

export function useInitialCompanyBootstrap() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: InitialCompanyBootstrapInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = bootstrapSchema.parse(input)
      const { data, error } = await supabase.rpc('bootstrap_initial_company', {
        p_company_name: request.companyName,
        p_plant_name: request.plantName
      })
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accessible-companies'] })
    }
  })
}
