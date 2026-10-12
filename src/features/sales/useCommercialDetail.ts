import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const id = z.uuid()
const rfqLine = z.object({
  id,
  requested_description: z.string(),
  quantity: z.string(),
  uom: z.string(),
  required_by: z.string().nullable(),
  item_id: id.nullable().optional(),
})
const review = z.object({
  status: z.string(),
  conditions: z.string().nullable(),
  drawing_revision_id: id.nullable(),
  bom_revision_id: id.nullable(),
  routing_revision_id: id.nullable(),
  reviewed_at: z.string().nullable(),
})
const quoteLine = z.object({
  id,
  quotation_id: id,
  item_id: id,
  quantity: z.string(),
  uom: z.string(),
  unit_price: z.string(),
  pricing_source: z.string(),
  customer_part_reference_id: id.nullable().optional(),
  item_specification_id: id.nullable().optional(),
  rfq_line_id: id.nullable().optional(),
  drawing_revision_id: id.nullable(),
  bom_revision_id: id.nullable(),
  routing_revision_id: id.nullable(),
})
export type CommercialDetail = {
  lines: z.infer<typeof rfqLine>[]
  review: z.infer<typeof review> | null
  lineReviews?: z.infer<typeof lineReview>[]
  quoteLines: z.infer<typeof quoteLine>[]
}
const lineReview = review.extend({ id, rfq_line_id: id, item_id: id.nullable(), version: z.number().int().positive() })

export function useCommercialDetail(
  companyId: string | null,
  rfqId: string | null,
) {
  return useQuery({
    queryKey: ['commercial-detail', companyId, rfqId],
    enabled: Boolean(companyId && rfqId && supabase),
    queryFn: async (): Promise<CommercialDetail> => {
      if (!supabase || !companyId || !rfqId)
        throw new Error('Select a permitted enquiry.')
      const [lines, feasibility, quoteLines, lineReviews] = await Promise.all([
        supabase
          .from('rfq_lines')
          .select('id,item_id,requested_description,quantity::text,uom,required_by')
          .eq('company_id', companyId)
          .eq('rfq_id', rfqId),
        supabase
          .from('feasibility_reviews')
          .select(
            'status,conditions,drawing_revision_id,bom_revision_id,routing_revision_id,reviewed_at',
          )
          .eq('company_id', companyId)
          .eq('rfq_id', rfqId)
          .maybeSingle(),
        supabase
          .from('quotation_lines')
          .select(
            'id,quotation_id,item_id,quantity::text,uom,unit_price::text,pricing_source,customer_part_reference_id,item_specification_id,rfq_line_id,drawing_revision_id,bom_revision_id,routing_revision_id,quotations!inner(rfq_id)',
          )
          .eq('company_id', companyId)
          .eq('quotations.rfq_id', rfqId),
        supabase.from('current_rfq_line_reviews').select('id,rfq_line_id,item_id,version,status,conditions,drawing_revision_id,bom_revision_id,routing_revision_id,reviewed_at,rfq_lines!inner(rfq_id)').eq('company_id',companyId).eq('rfq_lines.rfq_id',rfqId),
      ])
      for (const result of [lines, feasibility, quoteLines, lineReviews])
        if (result.error) throw result.error
      return {
        lines: z.array(rfqLine).parse(lines.data),
        review: feasibility.data ? review.parse(feasibility.data) : null,
        quoteLines: z.array(quoteLine).parse(quoteLines.data),
        lineReviews: z.array(lineReview).parse(lineReviews.data),
      }
    },
  })
}
