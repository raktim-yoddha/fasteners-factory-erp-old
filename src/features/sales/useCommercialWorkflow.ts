import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { positiveDecimalSchema, priceSchema } from '@/lib/decimal'

const id = z.uuid()
const optionalId = z.uuid().nullable()
const uom = z.enum(['pcs', 'kg', 'm', 'set'])
const rfqSchema = z.object({
  id,
  rfq_number: z.string(),
  status: z.string(),
  revision: z.number().int(),
  customer_id: id.optional(),
  requirement_summary: z.string().optional(),
  due_date: z.string().nullable().optional(),
  created_at: z.string().optional(),
  created_by: id.optional(),
})
const quotationSchema = z.object({
  id,
  quotation_number: z.string(),
  rfq_id: id,
  status: z.string(),
  revision: z.number().int(),
  currency_code: z.string().optional(),
  valid_until: z.string().nullable().optional(),
  approved_at: z.string().nullable().optional(),
})
const salesOrderSchema = z.object({
  id,
  sales_order_number: z.string(),
  status: z.string(),
  revision: z.number().int(),
})
const salesOrderLineSchema = z.object({
  id,
  sales_order_id: id,
  item_id: id,
  ordered_quantity: z.union([z.string(), z.number()]),
  uom,
})

export type CommercialRecords = {
  rfqs: z.infer<typeof rfqSchema>[]
  quotations: z.infer<typeof quotationSchema>[]
  salesOrders: z.infer<typeof salesOrderSchema>[]
  salesOrderLines: z.infer<typeof salesOrderLineSchema>[]
}

const feasibilitySchema = z.object({
  companyId: id,
  rfqId: id,
  rfqLineId: optionalId.optional(),
  itemId: optionalId.optional(),
  status: z.enum(['feasible', 'conditional', 'not_feasible', 'info_required']),
  drawingRevisionId: optionalId,
  bomRevisionId: optionalId,
  routingRevisionId: optionalId,
  conditions: z.string().max(2000),
  expectedRfqRevision: z.number().int().positive(),
  idempotencyKey: id,
})
const quotationLineInputSchema = z.object({
  itemId: id,
  rfqLineId: optionalId.optional(),
  bomRevisionId: optionalId,
  routingRevisionId: optionalId,
  quantity: positiveDecimalSchema,
  uom,
  unitPrice: priceSchema,
  pricingSource: z.string().trim().min(1).max(500).default('Manual entry'),
  customerPartReferenceId: optionalId.default(null),
})
const quotationInputSchema = quotationLineInputSchema.extend({
  companyId: id,
  rfqId: id,
  quotationNumber: z.string().trim().min(3).max(64),
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/),
  validUntil: z.string().date(),
  idempotencyKey: id,
  additionalLines: z.array(quotationLineInputSchema).max(99).optional(),
})
const approvalSchema = z.object({
  companyId: id,
  quotationId: id,
  expectedRevision: z.number().int().positive(),
  idempotencyKey: id,
})
const acceptanceSchema = z.object({
  companyId: id,
  quotationId: id,
  salesOrderNumber: z.string().trim().min(3).max(64),
  customerPoNumber: z.string().trim().min(1).max(160),
  promisedDate: z.string().date(),
  expectedQuotationRevision: z.number().int().positive(),
  idempotencyKey: id,
})

export type FeasibilityInput = z.input<typeof feasibilitySchema>
export type QuotationInput = z.input<typeof quotationInputSchema>
export type QuotationApprovalInput = z.input<typeof approvalSchema>
export type QuotationAcceptanceInput = z.input<typeof acceptanceSchema>

export function useCommercialRecords(companyId: string | null) {
  return useQuery({
    queryKey: ['commercial-records', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async (): Promise<CommercialRecords> => {
      if (!supabase || !companyId)
        throw new Error('A company is required to load commercial records.')
      const [rfqs, quotations, salesOrders, salesOrderLines] =
        await Promise.all([
          supabase
            .from('rfqs')
            .select(
              'id, rfq_number, status, revision, customer_id, requirement_summary, due_date, created_at, created_by',
            )
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
          supabase
            .from('quotations')
            .select(
              'id, quotation_number, rfq_id, status, revision, currency_code, valid_until, approved_at',
            )
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
          supabase
            .from('sales_orders')
            .select('id, sales_order_number, status, revision')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
          supabase
            .from('sales_order_lines')
            .select('id, sales_order_id, item_id, ordered_quantity::text, uom')
            .eq('company_id', companyId),
        ])
      for (const result of [rfqs, quotations, salesOrders, salesOrderLines])
        if (result.error) throw result.error
      return {
        rfqs: z.array(rfqSchema).parse(rfqs.data),
        quotations: z.array(quotationSchema).parse(quotations.data),
        salesOrders: z.array(salesOrderSchema).parse(salesOrders.data),
        salesOrderLines: z
          .array(salesOrderLineSchema)
          .parse(salesOrderLines.data),
      }
    },
  })
}

export function useCommercialCommands(actorId: string | null = null) {
  const queryClient = useQueryClient()
  const quotationRetry = useRef<{ request: string; key: string } | null>(null)
  const invalidate = async () => {
    await Promise.all(
      [
        'commercial-records',
        'commercial-detail',
        'dispatch-records',
        'record-workspace',
        'dashboard-summary',
        'order-command-center',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    )
  }
  const feasibility = useMutation({
    mutationFn: async (input: FeasibilityInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = feasibilitySchema.parse(input)
      const { error } = request.rfqLineId ? await supabase.rpc('record_rfq_line_feasibility', { p_company_id: request.companyId, p_data: {
        line_id: request.rfqLineId, item_id: request.itemId, status: request.status, drawing_revision_id: request.drawingRevisionId,
        bom_revision_id: request.bomRevisionId, routing_revision_id: request.routingRevisionId, conditions: request.conditions, expected_revision: request.expectedRfqRevision,
      }, p_idempotency_key: request.idempotencyKey }) : await supabase.rpc('record_feasibility', {
        p_company_id: request.companyId,
        p_rfq_id: request.rfqId,
        p_status: request.status,
        p_drawing_revision_id: request.drawingRevisionId,
        p_bom_revision_id: request.bomRevisionId,
        p_routing_revision_id: request.routingRevisionId,
        p_conditions: request.conditions,
        p_expected_rfq_revision: request.expectedRfqRevision,
        p_idempotency_key: request.idempotencyKey,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const quotation = useMutation({
    mutationFn: async (input: QuotationInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = quotationInputSchema.parse(input)
      const identity = JSON.stringify({ actorId, ...request, idempotencyKey: undefined })
      if (quotationRetry.current?.request !== identity) quotationRetry.current = { request: identity, key: quotationRetry.current?.key === input.idempotencyKey ? crypto.randomUUID() : input.idempotencyKey }
      const attempt = quotationRetry.current
      const lines = [...(request.additionalLines ?? []), request].map(
        (line) => ({
          item_id: line.itemId,
          rfq_line_id: line.rfqLineId,
          quantity: line.quantity,
          uom: line.uom,
          unit_price: line.unitPrice,
          pricing_source: line.pricingSource,
          bom_revision_id: line.bomRevisionId,
          routing_revision_id: line.routingRevisionId,
          customer_part_reference_id: line.customerPartReferenceId,
        }),
      )
      const { data, error } = await supabase.rpc('create_quotation', {
        p_company_id: request.companyId,
        p_rfq_id: request.rfqId,
        p_quotation_number: request.quotationNumber,
        p_currency_code: request.currencyCode,
        p_valid_until: request.validUntil,
        p_lines: lines,
        p_idempotency_key: attempt.key,
      })
      if (error) throw error
      z.uuid().parse(data)
      if (quotationRetry.current === attempt) quotationRetry.current = null
    },
    onSuccess: invalidate,
  })
  const approve = useMutation({
    mutationFn: async (input: QuotationApprovalInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = approvalSchema.parse(input)
      const { error } = await supabase.rpc('approve_quotation', {
        p_company_id: request.companyId,
        p_quotation_id: request.quotationId,
        p_expected_revision: request.expectedRevision,
        p_idempotency_key: request.idempotencyKey,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const accept = useMutation({
    mutationFn: async (input: QuotationAcceptanceInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = acceptanceSchema.parse(input)
      const { error } = await supabase.rpc(
        'accept_quotation_create_sales_order',
        {
          p_company_id: request.companyId,
          p_quotation_id: request.quotationId,
          p_sales_order_number: request.salesOrderNumber,
          p_customer_po_number: request.customerPoNumber,
          p_promised_date: request.promisedDate,
          p_expected_quotation_revision: request.expectedQuotationRevision,
          p_idempotency_key: request.idempotencyKey,
        },
      )
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  return { feasibility, quotation, approve, accept }
}
