import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const id = z.uuid()
const drawingSchema = z.object({ id, revision: z.string(), drawings: z.object({ drawing_number: z.string(), item_id: id }) })
const bomSchema = z.object({ id, revision: z.string(), boms: z.object({ name: z.string(), output_item_id: id }) })
const routingSchema = z.object({ id, revision: z.string(), routings: z.object({ name: z.string(), output_item_id: id }) })

export type EngineeringRevisionOptions = {
  drawings: { id: string; itemId: string; label: string }[]
  boms: { id: string; itemId: string; label: string }[]
  routings: { id: string; itemId: string; label: string }[]
}

export function useEngineeringRevisionOptions(companyId: string | null) {
  return useQuery({
    queryKey: ['engineering-revision-options', companyId],
    enabled: Boolean(companyId && supabase),
    queryFn: async (): Promise<EngineeringRevisionOptions> => {
      if (!supabase || !companyId) throw new Error('A company is required to load engineering revisions.')
      const [drawings, boms, routings] = await Promise.all([
        supabase.from('drawing_revisions').select('id, revision, drawings!inner(drawing_number, item_id)').eq('company_id', companyId).eq('status', 'approved').order('revision'),
        supabase.from('bom_revisions').select('id, revision, boms!inner(name, output_item_id)').eq('company_id', companyId).eq('status', 'approved').order('revision'),
        supabase.from('routing_revisions').select('id, revision, routings!inner(name, output_item_id)').eq('company_id', companyId).eq('status', 'approved').order('revision')
      ])
      for (const result of [drawings, boms, routings]) if (result.error) throw result.error
      return {
        drawings: z.array(drawingSchema).parse(drawings.data).map((revision) => ({ id: revision.id, itemId: revision.drawings.item_id, label: `${revision.drawings.drawing_number} Rev ${revision.revision}` })),
        boms: z.array(bomSchema).parse(boms.data).map((revision) => ({ id: revision.id, itemId: revision.boms.output_item_id, label: `${revision.boms.name} Rev ${revision.revision}` })),
        routings: z.array(routingSchema).parse(routings.data).map((revision) => ({ id: revision.id, itemId: revision.routings.output_item_id, label: `${revision.routings.name} Rev ${revision.revision}` }))
      }
    }
  })
}
