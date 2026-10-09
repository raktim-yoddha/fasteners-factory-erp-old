import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const id = z.uuid()
const uom = z.enum(['pcs', 'kg', 'm', 'set'])
const rfqSchema = z.object({ id, rfq_number: z.string(), status: z.string(), revision: z.number().int() })
const quotationSchema = z.object({ id, quotation_number: z.string(), rfq_id: id, status: z.string(), revision: z.number().int() })
const salesOrderSchema = z.object({ id, sales_order_number: z.string(), status: z.string(), revision: z.number().int() })
const salesOrderLineSchema = z.object({ id, sales_order_id: id, item_id: id, ordered_quantity: z.coerce.number(), uom })

export type CommercialRecords = {
  rfqs: z.infer<typeof rfqSchema>[]
  quotations: z.infer<typeof quotationSchema>[]
  salesOrders: z.infer<typeof salesOrderSchema>[]
  salesOrderLines: z.infer<typeof salesOrderLineSchema>[]
}

const feasibilitySchema = z.object({ companyId: id, rfqId: id, status: z.enum(['feasible', 'conditional', 'not_feasible', 'info_required']), conditions: z.string().max(2000), expectedRfqRevision: z.number().int().positive(), idempotencyKey: id })
const quotationInputSchema = z.object({ companyId: id, rfqId: id, quotationNumber: z.string().trim().min(3).max(64), currencyCode: z.string().trim().regex(/^[A-Z]{3}$/), validUntil: z.string().date(), itemId: id, quantity: z.coerce.number().positive(), uom, unitPrice: z.coerce.number().nonnegative(), idempotencyKey: id })
const approvalSchema = z.object({ companyId: id, quotationId: id, expectedRevision: z.number().int().positive(), idempotencyKey: id })
const acceptanceSchema = z.object({ companyId: id, quotationId: id, salesOrderNumber: z.string().trim().min(3).max(64), customerPoNumber: z.string().trim().min(1).max(160), promisedDate: z.string().date(), expectedQuotationRevision: z.number().int().positive(), idempotencyKey: id })

export type FeasibilityInput = z.input<typeof feasibilitySchema>
export type QuotationInput = z.input<typeof quotationInputSchema>
export type QuotationApprovalInput = z.input<typeof approvalSchema>
export type QuotationAcceptanceInput = z.input<typeof acceptanceSchema>

export function useCommercialRecords(companyId: string | null) {
  return useQuery({
    queryKey: ['commercial-records', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async (): Promise<CommercialRecords> => {
      if (!supabase || !companyId) throw new Error('A company is required to load commercial records.')
      const [rfqs, quotations, salesOrders, salesOrderLines] = await Promise.all([
        supabase.from('rfqs').select('id, rfq_number, status, revision').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('quotations').select('id, quotation_number, rfq_id, status, revision').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('sales_orders').select('id, sales_order_number, status, revision').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('sales_order_lines').select('id, sales_order_id, item_id, ordered_quantity, uom').eq('company_id', companyId)
      ])
      for (const result of [rfqs, quotations, salesOrders, salesOrderLines]) if (result.error) throw result.error
      return {
        rfqs: z.array(rfqSchema).parse(rfqs.data),
        quotations: z.array(quotationSchema).parse(quotations.data),
        salesOrders: z.array(salesOrderSchema).parse(salesOrders.data),
        salesOrderLines: z.array(salesOrderLineSchema).parse(salesOrderLines.data)
      }
    }
  })
}

export function useCommercialCommands() {
  const queryClient = useQueryClient()
  const invalidate = async () => { await Promise.all(['commercial-records', 'dashboard-summary', 'order-command-center'].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))) }
  const feasibility = useMutation({ mutationFn: async (input: FeasibilityInput) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const request = feasibilitySchema.parse(input)
    const { error } = await supabase.rpc('record_feasibility', { p_company_id: request.companyId, p_rfq_id: request.rfqId, p_status: request.status, p_drawing_revision_id: null, p_bom_revision_id: null, p_routing_revision_id: null, p_conditions: request.conditions, p_expected_rfq_revision: request.expectedRfqRevision, p_idempotency_key: request.idempotencyKey })
    if (error) throw error
  }, onSuccess: invalidate })
  const quotation = useMutation({ mutationFn: async (input: QuotationInput) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const request = quotationInputSchema.parse(input)
    const { error } = await supabase.rpc('create_quotation', { p_company_id: request.companyId, p_rfq_id: request.rfqId, p_quotation_number: request.quotationNumber, p_currency_code: request.currencyCode, p_valid_until: request.validUntil, p_lines: [{ item_id: request.itemId, quantity: request.quantity, uom: request.uom, unit_price: request.unitPrice, bom_revision_id: null, routing_revision_id: null }], p_idempotency_key: request.idempotencyKey })
    if (error) throw error
  }, onSuccess: invalidate })
  const approve = useMutation({ mutationFn: async (input: QuotationApprovalInput) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const request = approvalSchema.parse(input)
    const { error } = await supabase.rpc('approve_quotation', { p_company_id: request.companyId, p_quotation_id: request.quotationId, p_expected_revision: request.expectedRevision, p_idempotency_key: request.idempotencyKey })
    if (error) throw error
  }, onSuccess: invalidate })
  const accept = useMutation({ mutationFn: async (input: QuotationAcceptanceInput) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const request = acceptanceSchema.parse(input)
    const { error } = await supabase.rpc('accept_quotation_create_sales_order', { p_company_id: request.companyId, p_quotation_id: request.quotationId, p_sales_order_number: request.salesOrderNumber, p_customer_po_number: request.customerPoNumber, p_promised_date: request.promisedDate, p_expected_quotation_revision: request.expectedQuotationRevision, p_idempotency_key: request.idempotencyKey })
    if (error) throw error
  }, onSuccess: invalidate })
  return { feasibility, quotation, approve, accept }
}
