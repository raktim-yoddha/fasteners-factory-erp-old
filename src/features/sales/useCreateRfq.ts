import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const createRfqSchema = z.object({
  companyId: z.uuid(),
  rfqNumber: z.string().trim().min(3).max(64),
  customerId: z.uuid(),
  requirementSummary: z.string().trim().min(1).max(2000),
  idempotencyKey: z.string().trim().min(1).max(160),
  line: z.object({
    requestedDescription: z.string().trim().min(1).max(500),
    quantity: z.coerce.number().positive(),
    uom: z.enum(['pcs', 'kg', 'm', 'set'])
  })
})

export type CreateRfqInput = z.input<typeof createRfqSchema>

export function useCreateRfq() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateRfqInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = createRfqSchema.parse(input)
      const { data, error } = await supabase.rpc('create_rfq', {
        p_company_id: request.companyId,
        p_rfq_number: request.rfqNumber,
        p_customer_id: request.customerId,
        p_requirement_summary: request.requirementSummary,
        p_lines: [{
          item_id: null,
          requested_description: request.line.requestedDescription,
          quantity: request.line.quantity,
          uom: request.line.uom,
          required_by: null
        }],
        p_idempotency_key: request.idempotencyKey
      })
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial-records'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['order-command-center'] })
      ])
    }
  })
}
