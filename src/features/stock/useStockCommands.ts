import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { positiveDecimalSchema } from '@/lib/decimal'

const uom = z.enum(['pcs', 'kg', 'm', 'set'])
const receiptSchema = z.object({
  companyId: z.uuid(),
  itemId: z.uuid(),
  locationId: z.uuid(),
  lotCode: z.string().trim().min(3).max(64),
  quantity: positiveDecimalSchema,
  uom,
  idempotencyKey: z.uuid(),
})
const releaseSchema = z.object({
  companyId: z.uuid(),
  lotId: z.uuid(),
  expectedRevision: z.number().int().positive(),
  idempotencyKey: z.uuid(),
})
const reservationSchema = z.object({
  companyId: z.uuid(),
  salesOrderLineId: z.uuid(),
  lotId: z.uuid(),
  quantity: positiveDecimalSchema,
  expectedSalesOrderRevision: z.number().int().positive(),
  idempotencyKey: z.uuid(),
})
export type StockReceiptInput = z.input<typeof receiptSchema>
export type StockReleaseInput = z.input<typeof releaseSchema>
export type StockReservationInput = z.input<typeof reservationSchema>
const unreservationSchema = z.object({
  companyId: z.uuid(),
  reservationId: z.uuid(),
  reason: z.string().trim().min(1).max(2000),
  expectedSalesOrderRevision: z.number().int().positive(),
  idempotencyKey: z.uuid(),
})
export type StockUnreservationInput = z.input<typeof unreservationSchema>
const stockReservationSchema = z.object({
  id: z.uuid(),
  sales_order_line_id: z.uuid(),
  lot_id: z.uuid(),
  quantity: z.string(),
  consumed_quantity: z.string(),
  remaining_quantity: z.string(),
  status: z.literal('active'),
})
export type StockReservation = z.infer<typeof stockReservationSchema>

export function useStockReservations(companyId: string | null) {
  return useQuery({
    queryKey: ['stock-reservations', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      // The existing invoker view reads the same RLS-protected reservation rows
      // and derives exact remaining quantity in PostgreSQL.
      const { data, error } = await supabase
        .from('reservation_positions')
        .select(
          'id,sales_order_line_id,lot_id,quantity::text,consumed_quantity::text,remaining_quantity::text,status',
        )
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('id')
      if (error) throw error
      return z.array(stockReservationSchema).parse(data ?? [])
    },
  })
}

export function useStockCommands() {
  const queryClient = useQueryClient()
  const retryStock = useRef<Record<string, { request: string; key: string }>>({})
  function retryKey(operation: string, input: { idempotencyKey: string }) {
    const { idempotencyKey, ...payload } = input
    const request = JSON.stringify(payload)
    if (retryStock.current[operation]?.request !== request) retryStock.current[operation] = { request, key: idempotencyKey }
    return retryStock.current[operation]!.key
  }
  const retryUnreserve = useRef<{ request: string; key: string } | null>(null)
  const invalidate = async () => {
    await Promise.all(
      [
        'production',
        'quality',
        'stock-explorer',
        'record-workspace',
        'stock-lots',
        'stock-reservations',
        'stock-movements',
        'dashboard-summary',
        'commercial-records',
        'dispatch-records',
        'order-command-center',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    )
  }
  const receipt = useMutation({
    mutationFn: async (input: StockReceiptInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = receiptSchema.parse(input)
      const { error } = await supabase.rpc('receive_finished_goods', {
        p_company_id: request.companyId,
        p_item_id: request.itemId,
        p_location_id: request.locationId,
        p_lot_code: request.lotCode,
        p_quantity: request.quantity,
        p_uom: request.uom,
        p_idempotency_key: retryKey('receipt', request),
      })
      if (error) throw error
      delete retryStock.current.receipt
    },
    onSuccess: invalidate,
  })
  const release = useMutation({
    mutationFn: async (input: StockReleaseInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = releaseSchema.parse(input)
      const { error } = await supabase.rpc('release_stock_lot', {
        p_company_id: request.companyId,
        p_lot_id: request.lotId,
        p_expected_revision: request.expectedRevision,
        p_idempotency_key: retryKey('release', request),
      })
      if (error) throw error
      delete retryStock.current.release
    },
    onSuccess: invalidate,
  })
  const reserve = useMutation({
    mutationFn: async (input: StockReservationInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = reservationSchema.parse(input)
      const { error } = await supabase.rpc('reserve_finished_goods', {
        p_company_id: request.companyId,
        p_sales_order_line_id: request.salesOrderLineId,
        p_lot_id: request.lotId,
        p_quantity: request.quantity,
        p_expected_sales_order_revision: request.expectedSalesOrderRevision,
        p_idempotency_key: retryKey('reserve', request),
      })
      if (error) throw error
      delete retryStock.current.reserve
    },
    onSuccess: invalidate,
  })
  const unreserve = useMutation({
    mutationFn: async (input: StockUnreservationInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { idempotencyKey, ...request } = unreservationSchema.parse(input)
      const fingerprint = JSON.stringify(request)
      if (retryUnreserve.current?.request !== fingerprint)
        retryUnreserve.current = { request: fingerprint, key: idempotencyKey }
      const { data, error } = await supabase.rpc('release_stock_reservation', {
        p_company_id: request.companyId,
        p_reservation_id: request.reservationId,
        p_reason: request.reason,
        p_expected_sales_order_revision: request.expectedSalesOrderRevision,
        p_idempotency_key: retryUnreserve.current.key,
      })
      if (error) throw error
      const result = z.uuid().parse(data)
      retryUnreserve.current = null
      return result
    },
    onSuccess: invalidate,
  })
  return { receipt, release, reserve, unreserve }
}
