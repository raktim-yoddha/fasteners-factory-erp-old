import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import {
  positiveDecimalSchema,
  priceSchema,
  decimalSchema,
} from '@/lib/decimal'

const id = z.uuid(),
  text = z.string().trim().min(1).max(2000),
  number = z
    .string()
    .trim()
    .regex(/^[A-Z0-9][A-Z0-9/-]{2,63}$/),
  revision = z.number().int().positive()
const base = { p_company_id: id }
const commandSchema = z.discriminatedUnion('command', [
  z.object({
    command: z.literal('request_material'),
    params: z.object({
      ...base,
      p_number: number,
      p_item_id: id,
      p_quantity: positiveDecimalSchema,
      p_uom: z.enum(['pcs', 'kg', 'm', 'set']),
      p_demand_source: text,
      p_needed_by: z.string().date(),
      p_sales_order_line_id: id.nullable(),
    }),
  }),
  z.object({
    command: z.literal('create_purchase_order'),
    params: z.object({
      ...base,
      p_requisition_id: id,
      p_supplier_id: id,
      p_number: number,
      p_unit_price: priceSchema,
      p_currency: z.string().regex(/^[A-Z]{3}$/),
      p_promised_date: z.string().date(),
      p_expected_revision: revision,
      p_quantity: positiveDecimalSchema.optional(),
    }),
  }),
  z.object({
    command: z.literal('approve_purchase_order'),
    params: z.object({
      ...base,
      p_order_id: id,
      p_expected_revision: revision,
    }),
  }),
  z.object({
    command: z.literal('receive_purchase_order'),
    params: z.object({
      ...base,
      p_order_id: id,
      p_number: number,
      p_lot_code: number,
      p_supplier_lot: z.string().trim().min(1).max(160),
      p_certificate_reference: z.string().max(1000),
      p_conversion_id: id.nullable().optional(),
      p_location_id: id,
      p_quantity: positiveDecimalSchema,
      p_uom: z.enum(['pcs', 'kg', 'm', 'set', 'box', 'bundle']),
      p_expected_revision: revision,
    }),
  }),
  z.object({
    command: z.literal('return_goods_receipt'),
    params: z.object({
      ...base,
      p_receipt_id: id,
      p_quantity: positiveDecimalSchema,
      p_reason: text,
      p_expected_lot_revision: revision,
    }),
  }),
  z.object({
    command: z.literal('reject_stock_lot'),
    params: z.object({
      ...base,
      p_lot_id: id,
      p_reason: text,
      p_expected_revision: revision,
    }),
  }),
  z.object({
    command: z.literal('propose_stock_count'),
    params: z.object({
      ...base,
      p_lot_id: id,
      p_counted_quantity: decimalSchema,
      p_reason: text,
      p_expected_revision: revision,
    }),
  }),
  z.object({
    command: z.literal('review_stock_count'),
    params: z.object({
      ...base,
      p_proposal_id: id,
      p_reverse: z.boolean(),
      p_reason: text,
    }),
  }),
])
export type MaterialCommand = z.input<typeof commandSchema>
const requisition = z.object({
  id,
  requisition_number: z.string(),
  item_id: id,
  quantity: z.string(),
  uom: z.enum(['pcs', 'kg', 'm', 'set']),
  demand_source: z.string(),
  needed_by: z.string(),
  status: z.string(),
  revision,
  allocated_quantity: z.string().optional(),
  remaining_quantity: z.string().optional(),
})
const order = z.object({
  id,
  purchase_order_number: z.string(),
  supplier_id: id,
  item_id: id,
  quantity: z.string(),
  uom: z.enum(['pcs', 'kg', 'm', 'set']),
  unit_price: z.string(),
  currency_code: z.string(),
  promised_date: z.string(),
  status: z.string(),
  revision,
  received_quantity: z.string().optional(),
  outstanding_quantity: z.string().optional(),
})
const receipt = z.object({
  id,
  receipt_number: z.string(),
  purchase_order_id: id,
  lot_id: id,
  supplier_lot: z.string(),
  certificate_reference: z.string().nullable(),
  input_quantity: z.string().nullable().optional(),
  input_uom: z.string().nullable().optional(),
  quantity: z.string(),
  uom: z.string(),
})
const supplier = z.object({
  id,
  code: z.string(),
  name: z.string(),
  qualification_note: z.string().nullable(),
  certificate_requirements: z.string().nullable(),
})
const stockCount = z.object({
  id,
  lot_id: id,
  expected_on_hand: z.string(),
  counted_quantity: z.string(),
  reason: z.string(),
  status: z.string(),
  created_by: id,
})
export type ProcurementRecords = {
  requisitions: z.infer<typeof requisition>[]
  orders: z.infer<typeof order>[]
  receipts: z.infer<typeof receipt>[]
  suppliers: z.infer<typeof supplier>[]
  counts: z.infer<typeof stockCount>[]
}

export function useProcurement(companyId: string | null) {
  return useQuery({
    queryKey: ['procurement', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async (): Promise<ProcurementRecords> => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const [requisitions, orders, receipts, suppliers, counts, positions, conversions, allocations] =
        await Promise.all([
          supabase
            .from('purchase_requisitions')
            .select(
              'id,requisition_number,item_id,quantity::text,uom,demand_source,needed_by,status,revision',
            )
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
          supabase
            .from('purchase_orders')
            .select(
              'id,purchase_order_number,supplier_id,item_id,quantity::text,uom,unit_price::text,currency_code,promised_date,status,revision',
            )
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
          supabase
            .from('goods_receipts')
            .select(
              'id,receipt_number,purchase_order_id,lot_id,supplier_lot,certificate_reference,quantity::text,uom',
            )
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
          supabase
            .from('suppliers')
            .select('id,code,name,qualification_note,certificate_requirements')
            .eq('company_id', companyId)
            .eq('active', true)
            .order('code'),
          supabase
            .from('stock_count_proposals')
            .select(
              'id,lot_id,expected_on_hand::text,counted_quantity::text,reason,status,created_by',
            )
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
          supabase
            .from('purchase_order_positions')
            .select(
              'purchase_order_id,received_quantity::text,outstanding_quantity::text',
            )
            .eq('company_id', companyId),
          supabase.from('unit_conversion_events').select('entity_id,input_quantity::text,input_uom').eq('company_id', companyId).eq('entity_type', 'goods_receipt'),
          supabase.from('purchase_requisition_positions').select('requisition_id,allocated_quantity::text,remaining_quantity::text').eq('company_id',companyId),
        ])
      for (const result of [
        requisitions,
        orders,
        receipts,
        suppliers,
        counts,
        positions,
        conversions,
        allocations,
      ])
        if (result.error) throw result.error
      const balances = z
        .array(
          z.object({
            purchase_order_id: id,
            received_quantity: z.string(),
            outstanding_quantity: z.string(),
          }),
        )
        .parse(positions.data)
      return {
        requisitions: z.array(requisition).parse(requisitions.data?.map((entry) => ({ ...entry, ...allocations.data?.find((position) => position.requisition_id === entry.id) }))),
        orders: z
          .array(order)
          .parse(
            orders.data?.map((entry) => ({
              ...entry,
              ...balances.find(
                (balance) => balance.purchase_order_id === entry.id,
              ),
            })),
          ),
        receipts: z.array(receipt).parse(receipts.data?.map((entry) => ({ ...entry, ...conversions.data?.find((event) => event.entity_id === entry.id) }))),
        suppliers: z.array(supplier).parse(suppliers.data),
        counts: z.array(stockCount).parse(counts.data),
      }
    },
  })
}

export function useMaterialCommand() {
  const queryClient = useQueryClient()
  const retry = useRef<{ request: string; key: string } | null>(null)
  return useMutation({
    mutationFn: async (input: MaterialCommand) => {
      if (!supabase) throw new Error('Backend is not configured.')
      const request = commandSchema.parse(input),
        fingerprint = JSON.stringify(request)
      if (retry.current?.request !== fingerprint)
        retry.current = { request: fingerprint, key: crypto.randomUUID() }
      const args: Record<string, unknown> = { ...request.params, p_idempotency_key: retry.current.key }
      let rpc: string = request.command
      if (request.command === 'create_purchase_order' && request.params.p_quantity) rpc = 'create_partial_purchase_order'
      if (request.command === 'receive_purchase_order') {
        delete args.p_conversion_id
        if (request.params.p_conversion_id) {
          rpc = 'receive_purchase_order_in_unit'
          const params = request.params
          Object.keys(args).forEach((key) => { delete args[key] })
          Object.assign(args, { p_company_id: params.p_company_id, p_idempotency_key: retry.current.key, p_data: {
            order_id: params.p_order_id, number: params.p_number, lot_code: params.p_lot_code, supplier_lot: params.p_supplier_lot,
            certificate_reference: params.p_certificate_reference, location_id: params.p_location_id, quantity: params.p_quantity,
            uom: params.p_uom, expected_revision: params.p_expected_revision, conversion_id: params.p_conversion_id,
          } })
        }
      }
      const { data, error } = await supabase.rpc(rpc, args)
      if (error) throw error
      const confirmation = z.uuid().parse(data)
      retry.current = null
      return confirmation
    },
    onSuccess: () => {
      // A confirmed write must not wait for another workspace's read retries.
      // Each query retains its own fetching/error state; quantities are never optimistic.
      void Promise.all(
        [
          'procurement',
          'stock-lots',
          'production',
          'quality',
          'stock-explorer',
          'stock-movements',
          'record-workspace',
          'dashboard-summary',
          'order-command-center',
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] }, { throwOnError: false })),
      )
    },
  })
}
