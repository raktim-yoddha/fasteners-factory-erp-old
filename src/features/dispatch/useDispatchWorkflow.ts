import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { positiveDecimalSchema } from '@/lib/decimal'
import type { CommercialRecords } from '@/features/sales/useCommercialWorkflow'

const id = z.uuid()
const reservationSchema = z.object({
  id,
  sales_order_line_id: id,
  lot_id: id,
  quantity: z.union([z.string(), z.number()]),
  consumed_quantity: z.union([z.string(), z.number()]),
  remaining_quantity: z.string(),
  status: z.enum(['active', 'released', 'consumed']),
})
const shipmentSchema = z.object({
  id,
  shipment_number: z.string(),
  status: z.enum(['draft', 'dispatched', 'cancelled']),
  revision: z.number().int(),
})
const prepareSchema = z.object({
  companyId: id,
  salesOrderId: id,
  packingNumber: z.string().trim().min(3).max(64),
  shipmentNumber: z.string().trim().min(3).max(64),
  reservationId: id,
  quantity: positiveDecimalSchema,
  expectedSalesOrderRevision: z.number().int().positive(),
  idempotencyKey: id,
})
const dispatchSchema = z.object({
  companyId: id,
  shipmentId: id,
  expectedShipmentRevision: z.number().int().positive(),
  idempotencyKey: id,
})

export type DispatchRecords = {
  reservations: z.infer<typeof reservationSchema>[]
  shipments: z.infer<typeof shipmentSchema>[]
  orderOptions?: Pick<CommercialRecords, 'salesOrders' | 'salesOrderLines'>
}
const orderOptionsSchema = z.object({
  salesOrders: z.array(z.object({ id, sales_order_number: z.string(), status: z.string(), revision: z.number().int().positive() })),
  salesOrderLines: z.array(z.object({ id, sales_order_id: id, item_id: id, ordered_quantity: z.string(), uom: z.enum(['pcs', 'kg', 'm', 'set']) })),
})
export type PrepareShipmentInput = z.input<typeof prepareSchema>
const cancelSchema = dispatchSchema.extend({ reason: z.string().trim().min(1).max(2000) })
export type CancelShipmentInput = z.input<typeof cancelSchema>
export type DispatchShipmentInput = z.input<typeof dispatchSchema>

export function useDispatchRecords(companyId: string | null, allowed = true) {
  return useQuery({
    queryKey: ['dispatch-records', companyId],
    enabled: Boolean(companyId && supabase && allowed),
    queryFn: async (): Promise<DispatchRecords> => {
      if (!supabase || !companyId)
        throw new Error('A company is required to load dispatch records.')
      const [reservations, shipments, orderOptions] = await Promise.all([
        supabase
          .from('reservation_positions')
          .select(
            'id, sales_order_line_id, lot_id, quantity::text, consumed_quantity::text,remaining_quantity::text, status',
          )
          .eq('company_id', companyId)
          .eq('status', 'active')
          .gt('remaining_quantity', 0),
        supabase
          .from('shipments')
          .select('id, shipment_number, status, revision')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_dispatch_order_options', { p_company_id: companyId }),
      ])
      if (reservations.error) throw reservations.error
      if (shipments.error) throw shipments.error
      if (orderOptions.error) throw orderOptions.error
      return {
        reservations: z.array(reservationSchema).parse(reservations.data),
        shipments: z.array(shipmentSchema).parse(shipments.data),
        orderOptions: orderOptionsSchema.parse(orderOptions.data),
      }
    },
  })
}

export function useDispatchCommands(actorId: string | null = null) {
  const queryClient = useQueryClient()
  type Action = 'prepare' | 'dispatch' | 'cancel'
  const pending = useRef<Partial<Record<Action, { request: string; key: string }>>>({})
  function retryKey(action: Action, input: PrepareShipmentInput | DispatchShipmentInput | CancelShipmentInput) {
    const { idempotencyKey, ...payload } = input
    const request = JSON.stringify({ actorId, ...payload })
    const previous = pending.current[action]
    if (previous?.request !== request) pending.current[action] = {
      request, key: previous?.key === idempotencyKey ? crypto.randomUUID() : idempotencyKey,
    }
    return pending.current[action]!.key
  }
  function confirmed(action: Action, key: string, data: unknown) {
    id.parse(data)
    if (pending.current[action]?.key === key) delete pending.current[action]
  }
  const invalidate = async () => {
    await Promise.all(
      [
        'production',
        'quality',
        'stock-explorer',
        'stock-movements',
        'record-workspace',
        'dispatch-records',
        'commercial-records',
        'stock-lots',
        'stock-reservations',
        'dashboard-summary',
        'order-command-center',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    )
  }
  const prepare = useMutation({
    mutationFn: async (input: PrepareShipmentInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = prepareSchema.parse(input)
      const key = retryKey('prepare', request)
      const { data, error } = await supabase.rpc('prepare_packing_shipment', {
        p_company_id: request.companyId,
        p_sales_order_id: request.salesOrderId,
        p_packing_number: request.packingNumber,
        p_shipment_number: request.shipmentNumber,
        p_lines: [
          { reservation_id: request.reservationId, quantity: request.quantity },
        ],
        p_expected_sales_order_revision: request.expectedSalesOrderRevision,
        p_idempotency_key: key,
      })
      if (error) throw error
      confirmed('prepare', key, data)
    },
    onSuccess: invalidate,
  })
  const dispatch = useMutation({
    mutationFn: async (input: DispatchShipmentInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = dispatchSchema.parse(input)
      const key = retryKey('dispatch', request)
      const { data, error } = await supabase.rpc('dispatch_shipment', {
        p_company_id: request.companyId,
        p_shipment_id: request.shipmentId,
        p_expected_shipment_revision: request.expectedShipmentRevision,
        p_idempotency_key: key,
      })
      if (error) throw error
      confirmed('dispatch', key, data)
    },
    onSuccess: invalidate,
  })
  const cancel = useMutation({
    mutationFn: async (input: CancelShipmentInput) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const request = cancelSchema.parse(input)
      const key = retryKey('cancel', request)
      const { data, error } = await supabase.rpc('cancel_prepared_shipment', {
        p_company_id: request.companyId, p_shipment_id: request.shipmentId,
        p_expected_shipment_revision: request.expectedShipmentRevision,
        p_reason: request.reason, p_idempotency_key: key,
      })
      if (error) throw error
      confirmed('cancel', key, data)
    }, onSuccess: invalidate,
  })
  return { prepare, dispatch, cancel }
}
