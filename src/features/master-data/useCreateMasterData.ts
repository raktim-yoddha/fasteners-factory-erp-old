import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const companyId = z.uuid()
const code = z.string().trim().min(2).max(32)
const name = z.string().trim().min(1).max(160)

const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('customer'), companyId, code, name }),
  z.object({ kind: z.literal('supplier'), companyId, code, name }),
  z.object({ kind: z.literal('item'), companyId, sku: z.string().trim().min(2).max(64), description: z.string().trim().min(1).max(500), baseUom: z.enum(['pcs', 'kg', 'm', 'set']) }),
  z.object({ kind: z.literal('drawing'), companyId, itemId: z.uuid(), drawingNumber: z.string().trim().min(1).max(80) }),
  z.object({ kind: z.literal('warehouse'), companyId, plantId: z.uuid(), code, name }),
  z.object({ kind: z.literal('location'), companyId, warehouseId: z.uuid(), code, name }),
  z.object({ kind: z.literal('workCentre'), companyId, plantId: z.uuid(), code, name })
])

export type CreateMasterDataCommand = z.input<typeof commandSchema>

export function useCreateMasterData() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateMasterDataCommand) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      const command = commandSchema.parse(input)
      let result
      switch (command.kind) {
        case 'customer':
          result = await supabase.from('customers').insert({ company_id: command.companyId, code: command.code.toUpperCase(), name: command.name })
          break
        case 'supplier':
          result = await supabase.from('suppliers').insert({ company_id: command.companyId, code: command.code.toUpperCase(), name: command.name })
          break
        case 'item':
          result = await supabase.from('items').insert({ company_id: command.companyId, sku: command.sku.toUpperCase(), description: command.description, base_uom: command.baseUom })
          break
        case 'drawing':
          result = await supabase.from('drawings').insert({ company_id: command.companyId, item_id: command.itemId, drawing_number: command.drawingNumber })
          break
        case 'warehouse':
          result = await supabase.from('warehouses').insert({ company_id: command.companyId, plant_id: command.plantId, code: command.code.toUpperCase(), name: command.name })
          break
        case 'location':
          result = await supabase.from('stock_locations').insert({ company_id: command.companyId, warehouse_id: command.warehouseId, code: command.code.toUpperCase(), name: command.name })
          break
        case 'workCentre':
          result = await supabase.from('work_centres').insert({ company_id: command.companyId, plant_id: command.plantId, code: command.code.toUpperCase(), name: command.name })
          break
      }
      if (result.error) throw result.error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['master-data-options'] })
      ])
    }
  })
}
