import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { positiveDecimalSchema } from '@/lib/decimal'

const createRfqSchema = z.object({
  companyId: z.uuid(),
  rfqNumber: z.string().trim().min(3).max(64),
  customerId: z.uuid(),
  requirementSummary: z.string().trim().min(1).max(2000),
  idempotencyKey: z.string().trim().min(1).max(160),
  line: z.object({
    requestedDescription: z.string().trim().min(1).max(500),
    quantity: positiveDecimalSchema,
    uom: z.enum(['pcs', 'kg', 'm', 'set']),
    requiredBy: z.string().date().nullable().optional(),
  }),
  additionalLines: z
    .array(
      z.object({
        requestedDescription: z.string().trim().min(1).max(500),
        quantity: positiveDecimalSchema,
        uom: z.enum(['pcs', 'kg', 'm', 'set']),
        requiredBy: z.string().date().nullable().optional(),
      }),
    )
    .max(99)
    .optional(),
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
        p_lines: [...(request.additionalLines ?? []), request.line].map(
          (line) => ({
            item_id: null,
            requested_description: line.requestedDescription,
            quantity: line.quantity,
            uom: line.uom,
            required_by: line.requiredBy ?? null,
          }),
        ),
        p_idempotency_key: request.idempotencyKey,
      })
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial-records'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['order-command-center'] }),
      ])
    },
  })
}
