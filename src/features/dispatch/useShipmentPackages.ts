import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { shipmentPackageSchema, packingWorkspaceSchema, type ShipmentPackageInput } from './shipmentPackagesContract'
export * from './shipmentPackagesContract'
const id = z.uuid()

export function useShipmentPackages(companyId: string | null, allowed: boolean) {
  return useQuery({
    queryKey: ['dispatch-records', 'packages', companyId], enabled: Boolean(companyId && supabase && allowed),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const { data, error } = await supabase.rpc('get_packing_workspace', { p_company_id: companyId })
      if (error) throw error
      return packingWorkspaceSchema.parse(data)
    },
  })
}
export function useAddShipmentPackage(companyId: string | null) {
  const client = useQueryClient()
  const retry = useRef<{ request: string; key: string } | null>(null)
  return useMutation({
    mutationFn: async (input: ShipmentPackageInput) => {
      if (!companyId || !supabase) throw new Error('Select a company.')
      const command = shipmentPackageSchema.parse(input)
      const request = JSON.stringify({ companyId, command })
      if (retry.current?.request !== request) retry.current = { request, key: crypto.randomUUID() }
      const { data, error } = await supabase.rpc(command.conversion_id ? 'add_shipment_package_in_unit' : 'add_shipment_package', {
        p_company_id: companyId, p_data: command, p_idempotency_key: retry.current.key,
      })
      if (error) throw error
      const confirmation = id.parse(data)
      retry.current = null
      return confirmation
    },
    onSuccess: async () => {
      await Promise.all(['dispatch-records', 'record-workspace', 'order-command-center']
        .map((key) => client.invalidateQueries({ queryKey: [key] })))
    },
  })
}
