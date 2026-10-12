import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import type { RecordKind } from '@/features/records/recordTypes'
import { recordKindLabels } from '@/features/records/recordTypes'
import { supabase } from '@/lib/supabase'
import { qualityWorkspaceSchema } from '@/features/quality/useQualityWorkspace'

const uuidSchema = z.uuid()
const relatedRecordSchema = z.object({
  id: uuidSchema,
  label: z.string(),
  kind: z.string(),
})
const auditEventSchema = z.object({
  id: z.string().regex(/^\d+$/),
  action: z.string(),
  occurred_at: z.string(),
  reason: z.string().nullable(),
})

export type RelatedRecord = z.infer<typeof relatedRecordSchema>
export type AuditEvent = z.infer<typeof auditEventSchema>
export type RecordWorkspace = {
  kind: RecordKind
  title: string
  state: string
  source: string
  lastRecordedAt: string
  summary: Array<{ label: string; value: string }>
  relatedRecords: RelatedRecord[]
  relatedHasMore?: boolean
  timeline: AuditEvent[]
  timelineHasMore?: boolean
  nextWorkspace: string
}

type RawRecord = Record<string, string | number | boolean | null | undefined>
const scalarRecordSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
)

const recordReadConfig: Record<
  RecordKind,
  { table: string; select: string; source: string; nextWorkspace: string }
> = {
  customer: {
    table: 'customers',
    select: 'code,name,active,created_at,updated_at',
    source: 'Customer master',
    nextWorkspace: 'Master data',
  },
  supplier: {
    table: 'suppliers',
    select: 'code,name,active,created_at,updated_at',
    source: 'Supplier master',
    nextWorkspace: 'Master data',
  },
  item: {
    table: 'items',
    select: 'sku,description,base_uom,active,created_at,updated_at',
    source: 'Item master',
    nextWorkspace: 'Master data',
  },
  drawing: {
    table: 'drawings',
    select: 'drawing_number,item_id,created_at',
    source: 'Drawing master',
    nextWorkspace: 'Master data',
  },
  rfq: {
    table: 'rfqs',
    select:
      'rfq_number,status,requirement_summary,due_date,created_at,updated_at',
    source: 'Sales enquiry',
    nextWorkspace: 'Sales orders',
  },
  quotation: {
    table: 'quotations',
    select:
      'quotation_number,status,currency_code,valid_until,rfq_id,created_at',
    source: 'Commercial quotation',
    nextWorkspace: 'Sales orders',
  },
  'sales-order': {
    table: 'sales_orders',
    select:
      'sales_order_number,status,customer_po_number,promised_date,quotation_id,created_at',
    source: 'Accepted sales order',
    nextWorkspace: 'Sales orders',
  },
  lot: {
    table: 'stock_lots',
    select: 'lot_code,item_id,qc_status,revision,created_at',
    source: 'Stock lot',
    nextWorkspace: 'Stock',
  },
  shipment: {
    table: 'shipments',
    select: 'shipment_number,status,packing_order_id,dispatched_at,created_at',
    source: 'Shipment',
    nextWorkspace: 'Dispatch',
  },
  'purchase-requisition': {
    table: 'purchase_requisitions',
    select:
      'requisition_number,status,quantity::text,uom,demand_source,needed_by,created_at',
    source: 'Material demand',
    nextWorkspace: 'Purchasing',
  },
  'purchase-order': {
    table: 'purchase_orders',
    select:
      'purchase_order_number,status,quantity::text,uom,unit_price::text,currency_code,promised_date,supplier_id,requisition_id,created_at',
    source: 'Purchase order',
    nextWorkspace: 'Purchasing',
  },
  'goods-receipt': {
    table: 'goods_receipts',
    select:
      'receipt_number,quantity::text,uom,supplier_lot,certificate_reference,purchase_order_id,lot_id,created_at',
    source: 'Supplier goods receipt',
    nextWorkspace: 'Stock',
  },
  'work-order': {
    table: 'work_orders',
    select:
      'id,number,status,item_id,sales_order_line_id,quantity::text,uom,bom_revision_id,routing_revision_id,drawing_revision_id,start_date,due_date,parent_work_order_id,source_ncr_id,created_at',
    source: 'Production work order',
    nextWorkspace: 'Production',
  },
  'job-card': {
    table: 'job_cards',
    select:
      'id,work_order_id,sequence,name,work_centre_id,status,planned_quantity::text,good_quantity::text,scrap_quantity::text,uom,started_at,completed_at',
    source: 'Shop-floor job card',
    nextWorkspace: 'Production',
  },
  inspection: {
    table: 'inspections',
    select:
      'id,plan_id,lot_id,job_card_id,kind,result,reason,inspector_id,lot_revision,job_revision,supersedes_id,created_at,readings::text',
    source: 'Recorded inspection',
    nextWorkspace: 'Quality',
  },
  ncr: {
    table: 'ncrs',
    select:
      'id,lot_id,inspection_id,quantity::text,uom,reason,status,disposition,revision,review_reason,reviewed_by,created_at',
    source: 'Nonconformance record',
    nextWorkspace: 'Quality',
  },
}

function value(
  value: string | number | boolean | null | undefined,
  fallback = 'Not recorded',
) {
  return value === null || value === undefined || value === ''
    ? fallback
    : String(value)
}

function workspaceFromRecord(
  kind: RecordKind,
  record: RawRecord,
): Omit<RecordWorkspace, 'relatedRecords' | 'timeline'> {
  const config = recordReadConfig[kind]
  const common = {
    kind,
    source: config.source,
    nextWorkspace: config.nextWorkspace,
  }

  switch (kind) {
    case 'customer':
      return {
        ...common,
        title: `${value(record.code)} — ${value(record.name)}`,
        state: record.active ? 'Active' : 'Inactive',
        lastRecordedAt: value(record.updated_at ?? record.created_at),
        summary: [
          { label: 'Customer code', value: value(record.code) },
          { label: 'Active', value: record.active ? 'Yes' : 'No' },
        ],
      }
    case 'supplier':
      return {
        ...common,
        title: `${value(record.code)} — ${value(record.name)}`,
        state: record.active ? 'Active' : 'Inactive',
        lastRecordedAt: value(record.updated_at ?? record.created_at),
        summary: [
          { label: 'Supplier code', value: value(record.code) },
          { label: 'Active', value: record.active ? 'Yes' : 'No' },
        ],
      }
    case 'item':
      return {
        ...common,
        title: `${value(record.sku)} — ${value(record.description)}`,
        state: record.active ? 'Active' : 'Inactive',
        lastRecordedAt: value(record.updated_at ?? record.created_at),
        summary: [
          { label: 'SKU', value: value(record.sku) },
          { label: 'Base unit', value: value(record.base_uom) },
          { label: 'Active', value: record.active ? 'Yes' : 'No' },
        ],
      }
    case 'drawing':
      return {
        ...common,
        title: value(record.drawing_number),
        state: 'Recorded',
        lastRecordedAt: value(record.created_at),
        summary: [
          { label: 'Drawing number', value: value(record.drawing_number) },
        ],
      }
    case 'rfq':
      return {
        ...common,
        title: value(record.rfq_number),
        state: value(record.status),
        lastRecordedAt: value(record.updated_at ?? record.created_at),
        summary: [
          { label: 'Requirement', value: value(record.requirement_summary) },
          { label: 'Due date', value: value(record.due_date) },
        ],
      }
    case 'quotation':
      return {
        ...common,
        title: value(record.quotation_number),
        state: value(record.status),
        lastRecordedAt: value(record.created_at),
        summary: [
          { label: 'Currency', value: value(record.currency_code) },
          { label: 'Valid until', value: value(record.valid_until) },
        ],
      }
    case 'sales-order':
      return {
        ...common,
        title: value(record.sales_order_number),
        state: value(record.status),
        lastRecordedAt: value(record.created_at),
        summary: [
          { label: 'Customer PO', value: value(record.customer_po_number) },
          { label: 'Promised date', value: value(record.promised_date) },
        ],
      }
    case 'lot':
      return {
        ...common,
        title: value(record.lot_code),
        state: value(record.qc_status),
        lastRecordedAt: value(record.created_at),
        summary: [
          { label: 'Lot code', value: value(record.lot_code) },
          { label: 'Lot revision', value: value(record.revision) },
        ],
      }
    case 'shipment':
      return {
        ...common,
        title: value(record.shipment_number),
        state: value(record.status),
        lastRecordedAt: value(record.dispatched_at ?? record.created_at),
        summary: [
          { label: 'Shipment number', value: value(record.shipment_number) },
          { label: 'Dispatched at', value: value(record.dispatched_at) },
        ],
      }
    case 'purchase-requisition':
      return {
        ...common,
        title: value(record.requisition_number),
        state: value(record.status),
        lastRecordedAt: value(record.created_at),
        summary: [
          { label: 'Demand source', value: value(record.demand_source) },
          {
            label: 'Quantity',
            value: `${value(record.quantity)} ${value(record.uom)}`,
          },
          { label: 'Needed by', value: value(record.needed_by) },
        ],
      }
    case 'purchase-order':
      return {
        ...common,
        title: value(record.purchase_order_number),
        state: value(record.status),
        lastRecordedAt: value(record.created_at),
        summary: [
          {
            label: 'Ordered quantity',
            value: `${value(record.quantity)} ${value(record.uom)}`,
          },
          {
            label: 'Unit price',
            value: `${value(record.unit_price)} ${value(record.currency_code)}`,
          },
          { label: 'Promised date', value: value(record.promised_date) },
        ],
      }
    case 'goods-receipt':
      return {
        ...common,
        title: value(record.receipt_number),
        state: 'Received; inspect linked lot for current QC state',
        lastRecordedAt: value(record.created_at),
        summary: [
          {
            label: 'Received quantity',
            value: `${value(record.quantity)} ${value(record.uom)}`,
          },
          { label: 'Supplier lot', value: value(record.supplier_lot) },
          {
            label: 'Certificate reference',
            value: value(record.certificate_reference, 'Not supplied'),
          },
        ],
      }
    case 'work-order':
      return {
        ...common,
        title: value(record.number),
        state: value(record.status),
        lastRecordedAt: value(record.created_at),
        summary: [
          {
            label: 'Planned output',
            value: `${value(record.quantity)} ${value(record.uom)}`,
          },
          { label: 'Planned start', value: value(record.start_date) },
          { label: 'Due date', value: value(record.due_date) },
          {
            label: 'Pinned BOM revision',
            value: value(record.bom_revision_id),
          },
          {
            label: 'Pinned routing revision',
            value: value(record.routing_revision_id),
          },
          {
            label: 'Pinned drawing revision',
            value: value(record.drawing_revision_id),
          },
        ],
      }
    case 'job-card':
      return {
        ...common,
        title: `${value(record.sequence)}. ${value(record.name)}`,
        state: value(record.status),
        lastRecordedAt: value(record.completed_at ?? record.started_at),
        summary: [
          {
            label: 'Planned quantity',
            value: `${value(record.planned_quantity)} ${value(record.uom)}`,
          },
          {
            label: 'Recorded good quantity',
            value: `${value(record.good_quantity)} ${value(record.uom)}`,
          },
          {
            label: 'Recorded scrap quantity',
            value: `${value(record.scrap_quantity)} ${value(record.uom)}`,
          },
          { label: 'Work centre', value: value(record.work_centre_id) },
          { label: 'Started at', value: value(record.started_at) },
          { label: 'Completed at', value: value(record.completed_at) },
        ],
      }
    case 'inspection': {
      const readings =
        qualityWorkspaceSchema.shape.inspections.element.shape.readings.parse(
          JSON.parse(value(record.readings, '[]')),
        )
      return {
        ...common,
        title: `Inspection ${value(record.id)}`,
        state: value(record.result),
        lastRecordedAt: value(record.created_at),
        summary: [
          { label: 'Inspection stage', value: value(record.kind) },
          { label: 'Pinned plan revision', value: value(record.plan_id) },
          { label: 'Inspector identity', value: value(record.inspector_id) },
          {
            label: 'Inspected record revision',
            value: value(record.lot_revision ?? record.job_revision),
          },
          { label: 'Recorded reason', value: value(record.reason) },
          ...readings.map((reading) => ({
            label: `Reading: ${reading.key}`,
            value: `${reading.values.join(', ')}${reading.uom ? ` ${reading.uom}` : ''}`,
          })),
        ],
      }
    }
    case 'ncr':
      return {
        ...common,
        title: `NCR ${value(record.id)}`,
        state: value(record.status),
        lastRecordedAt: value(record.created_at),
        summary: [
          {
            label: 'Contained quantity',
            value: `${value(record.quantity)} ${value(record.uom)}`,
          },
          { label: 'Containment reason', value: value(record.reason) },
          {
            label: 'Disposition',
            value: value(record.disposition, 'Awaiting review'),
          },
          { label: 'Review reason', value: value(record.review_reason) },
          { label: 'Reviewer identity', value: value(record.reviewed_by) },
        ],
      }
  }
}

async function relatedRecords(companyId: string, kind: RecordKind, id: string, after: { kind: string; id: string }|null) {
  if (!supabase) throw new Error('The backend connection is not configured.')
  const result=await supabase.rpc('get_record_links_page',{ p_company_id: companyId,p_kind: kind,p_record_id: id,p_after_kind: after?.kind??null,p_after_id: after?.id??null })
  if (result.error) throw result.error
  return z.object({ rows: z.array(relatedRecordSchema),has_more: z.boolean() }).parse(result.data)
}

async function readRecordWorkspace(
  companyId: string,
  kind: RecordKind,
  id: string,
  beforeId: string|null,
  afterLink: { kind: string;id: string }|null,
): Promise<RecordWorkspace | null> {
  if (!supabase) throw new Error('The backend connection is not configured.')
  const config = recordReadConfig[kind]
  const { data, error } = await supabase
    .from(config.table)
    .select(config.select)
    .eq('company_id', companyId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const record = scalarRecordSchema.parse(data)
  let timelineQuery=supabase.from('audit_log').select('id::text,action,occurred_at,reason').eq('company_id',companyId).eq('entity_id',id).order('id',{ ascending: false }).limit(21)
  if (beforeId) timelineQuery=timelineQuery.lt('id',z.string().regex(/^\d+$/).parse(beforeId))
  const [related, timelineResult] = await Promise.all([
    relatedRecords(companyId, kind, id, afterLink),
    timelineQuery,
  ])
  if (timelineResult.error) throw timelineResult.error
  return {
    ...workspaceFromRecord(kind, record),
    relatedRecords: related.rows,
    relatedHasMore: related.has_more,
    timeline: z.array(auditEventSchema).parse(timelineResult.data ?? []).slice(0,20),
    timelineHasMore: (timelineResult.data?.length??0)>20,
  }
}

export function useRecordWorkspace(
  companyId: string | null,
  kind: RecordKind | null,
  recordId: string | undefined,
  beforeId: string|null = null,
  afterLink: { kind: string;id: string }|null = null,
) {
  return useQuery({
    queryKey: ['record-workspace', companyId, kind, recordId,beforeId,afterLink],
    enabled: Boolean(companyId && kind && recordId && supabase),
    queryFn: async () => readRecordWorkspace(companyId!, kind!, recordId!,beforeId,afterLink),
  })
}

export function recordKindLabel(kind: string) {
  return recordKindLabels[kind as RecordKind] ?? kind
}
