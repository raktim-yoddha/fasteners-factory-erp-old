import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const id = z.uuid()
const reservationSchema = z.object({ id, sales_order_line_id: id, lot_id: id, quantity: z.coerce.number(), consumed_quantity: z.coerce.number(), status: z.enum(['active', 'released', 'consumed']) })
const shipmentSchema = z.object({ id, shipment_number: z.string(), status: z.enum(['draft', 'dispatched', 'cancelled']), revision: z.number().int() })
const prepareSchema = z.object({ companyId: id, salesOrderId: id, packingNumber: z.string().trim().min(3).max(64), shipmentNumber: z.string().trim().min(3).max(64), reservationId: id, quantity: z.coerce.number().positive(), expectedSalesOrderRevision: z.number().int().positive(), idempotencyKey: id })
const dispatchSchema = z.object({ companyId: id, shipmentId: id, expectedShipmentRevision: z.number().int().positive(), idempotencyKey: id })

export type DispatchRecords = { reservations: z.infer<typeof reservationSchema>[]; shipments: z.infer<typeof shipmentSchema>[] }
export type PrepareShipmentInput = z.input<typeof prepareSchema>
export type DispatchShipmentInput = z.input<typeof dispatchSchema>

export function useDispatchRecords(companyId: string | null) {
  return useQuery({
    queryKey: ['dispatch-records', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async (): Promise<DispatchRecords> => {
      if (!supabase || !companyId) throw new Error('A company is required to load dispatch records.')
      const [reservations, shipments] = await Promise.all([
        supabase.from('stock_reservations').select('id, sales_order_line_id, lot_id, quantity, consumed_quantity, status').eq('company_id', companyId).eq('status', 'active'),
        supabase.from('shipments').select('id, shipment_number, status, revision').eq('company_id', companyId).order('created_at', { ascending: false })
      ])
      if (reservations.error) throw reservations.error
      if (shipments.error) throw shipments.error
      return { reservations: z.array(reservationSchema).parse(reservations.data), shipments: z.array(shipmentSchema).parse(shipments.data) }
    }
  })
}

export function useDispatchCommands() {
  const queryClient = useQueryClient()
  const invalidate = async () => { await Promise.all(['dispatch-records', 'commercial-records', 'stock-lots', 'dashboard-summary', 'order-command-center'].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))) }
  const prepare = useMutation({ mutationFn: async (input: PrepareShipmentInput) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const request = prepareSchema.parse(input)
    const { error } = await supabase.rpc('prepare_packing_shipment', { p_company_id: request.companyId, p_sales_order_id: request.salesOrderId, p_packing_number: request.packingNumber, p_shipment_number: request.shipmentNumber, p_lines: [{ reservation_id: request.reservationId, quantity: request.quantity }], p_expected_sales_order_revision: request.expectedSalesOrderRevision, p_idempotency_key: request.idempotencyKey })
    if (error) throw error
  }, onSuccess: invalidate })
  const dispatch = useMutation({ mutationFn: async (input: DispatchShipmentInput) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const request = dispatchSchema.parse(input)
    const { error } = await supabase.rpc('dispatch_shipment', { p_company_id: request.companyId, p_shipment_id: request.shipmentId, p_expected_shipment_revision: request.expectedShipmentRevision, p_idempotency_key: request.idempotencyKey })
    if (error) throw error
  }, onSuccess: invalidate })
  return { prepare, dispatch }
}
