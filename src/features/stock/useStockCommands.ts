import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const uom = z.enum(['pcs', 'kg', 'm', 'set'])
const receiptSchema = z.object({ companyId: z.uuid(), itemId: z.uuid(), locationId: z.uuid(), lotCode: z.string().trim().min(3).max(64), quantity: z.coerce.number().positive(), uom, idempotencyKey: z.uuid() })
const releaseSchema = z.object({ companyId: z.uuid(), lotId: z.uuid(), expectedRevision: z.number().int().positive(), idempotencyKey: z.uuid() })
const reservationSchema = z.object({ companyId: z.uuid(), salesOrderLineId: z.uuid(), lotId: z.uuid(), quantity: z.coerce.number().positive(), expectedSalesOrderRevision: z.number().int().positive(), idempotencyKey: z.uuid() })
export type StockReceiptInput = z.input<typeof receiptSchema>
export type StockReleaseInput = z.input<typeof releaseSchema>
export type StockReservationInput = z.input<typeof reservationSchema>

export function useStockCommands() {
  const queryClient = useQueryClient()
  const invalidate = async () => { await Promise.all(['stock-lots', 'dashboard-summary', 'commercial-records', 'dispatch-records', 'order-command-center'].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))) }
  const receipt = useMutation({
    mutationFn: async (input: StockReceiptInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = receiptSchema.parse(input)
      const { error } = await supabase.rpc('receive_finished_goods', { p_company_id: request.companyId, p_item_id: request.itemId, p_location_id: request.locationId, p_lot_code: request.lotCode, p_quantity: request.quantity, p_uom: request.uom, p_idempotency_key: request.idempotencyKey })
      if (error) throw error
    }, onSuccess: invalidate
  })
  const release = useMutation({
    mutationFn: async (input: StockReleaseInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = releaseSchema.parse(input)
      const { error } = await supabase.rpc('release_stock_lot', { p_company_id: request.companyId, p_lot_id: request.lotId, p_expected_revision: request.expectedRevision, p_idempotency_key: request.idempotencyKey })
      if (error) throw error
    }, onSuccess: invalidate
  })
  const reserve = useMutation({
    mutationFn: async (input: StockReservationInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = reservationSchema.parse(input)
      const { error } = await supabase.rpc('reserve_finished_goods', { p_company_id: request.companyId, p_sales_order_line_id: request.salesOrderLineId, p_lot_id: request.lotId, p_quantity: request.quantity, p_expected_sales_order_revision: request.expectedSalesOrderRevision, p_idempotency_key: request.idempotencyKey })
      if (error) throw error
    }, onSuccess: invalidate
  })
  return { receipt, release, reserve }
}
