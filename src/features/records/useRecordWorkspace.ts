import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import type { RecordKind } from '@/features/records/recordTypes'
import { recordKindLabels } from '@/features/records/recordTypes'
import { supabase } from '@/lib/supabase'

const uuidSchema = z.uuid()
const relatedRecordSchema = z.object({ id: uuidSchema, label: z.string(), kind: z.string() })
const auditEventSchema = z.object({ id: z.number(), action: z.string(), occurred_at: z.string(), reason: z.string().nullable() })

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
  timeline: AuditEvent[]
  nextWorkspace: string
}

type RawRecord = Record<string, string | boolean | null | undefined>

const recordReadConfig: Record<RecordKind, { table: string; select: string; source: string; nextWorkspace: string }> = {
  customer: { table: 'customers', select: 'code,name,active,created_at,updated_at', source: 'Customer master', nextWorkspace: 'Master data' },
  supplier: { table: 'suppliers', select: 'code,name,active,created_at,updated_at', source: 'Supplier master', nextWorkspace: 'Master data' },
  item: { table: 'items', select: 'sku,description,base_uom,active,created_at,updated_at', source: 'Item master', nextWorkspace: 'Master data' },
  drawing: { table: 'drawings', select: 'drawing_number,item_id,created_at', source: 'Drawing master', nextWorkspace: 'Master data' },
  rfq: { table: 'rfqs', select: 'rfq_number,status,requirement_summary,due_date,created_at,updated_at', source: 'Sales enquiry', nextWorkspace: 'Sales orders' },
  quotation: { table: 'quotations', select: 'quotation_number,status,currency_code,valid_until,rfq_id,created_at', source: 'Commercial quotation', nextWorkspace: 'Sales orders' },
  'sales-order': { table: 'sales_orders', select: 'sales_order_number,status,customer_po_number,promised_date,quotation_id,created_at', source: 'Accepted sales order', nextWorkspace: 'Sales orders' },
  lot: { table: 'stock_lots', select: 'lot_code,qc_status,revision,created_at', source: 'Stock lot', nextWorkspace: 'Stock' },
  shipment: { table: 'shipments', select: 'shipment_number,status,packing_order_id,dispatched_at,created_at', source: 'Shipment', nextWorkspace: 'Dispatch' },
}

function value(value: string | boolean | null | undefined, fallback = 'Not recorded') {
  return value === null || value === undefined || value === '' ? fallback : String(value)
}

function workspaceFromRecord(kind: RecordKind, record: RawRecord): Omit<RecordWorkspace, 'relatedRecords' | 'timeline'> {
  const config = recordReadConfig[kind]
  const common = { kind, source: config.source, nextWorkspace: config.nextWorkspace }

  switch (kind) {
    case 'customer': return { ...common, title: `${value(record.code)} — ${value(record.name)}`, state: record.active ? 'Active' : 'Inactive', lastRecordedAt: value(record.updated_at ?? record.created_at), summary: [{ label: 'Customer code', value: value(record.code) }, { label: 'Active', value: record.active ? 'Yes' : 'No' }] }
    case 'supplier': return { ...common, title: `${value(record.code)} — ${value(record.name)}`, state: record.active ? 'Active' : 'Inactive', lastRecordedAt: value(record.updated_at ?? record.created_at), summary: [{ label: 'Supplier code', value: value(record.code) }, { label: 'Active', value: record.active ? 'Yes' : 'No' }] }
    case 'item': return { ...common, title: `${value(record.sku)} — ${value(record.description)}`, state: record.active ? 'Active' : 'Inactive', lastRecordedAt: value(record.updated_at ?? record.created_at), summary: [{ label: 'SKU', value: value(record.sku) }, { label: 'Base unit', value: value(record.base_uom) }, { label: 'Active', value: record.active ? 'Yes' : 'No' }] }
    case 'drawing': return { ...common, title: value(record.drawing_number), state: 'Recorded', lastRecordedAt: value(record.created_at), summary: [{ label: 'Drawing number', value: value(record.drawing_number) }] }
    case 'rfq': return { ...common, title: value(record.rfq_number), state: value(record.status), lastRecordedAt: value(record.updated_at ?? record.created_at), summary: [{ label: 'Requirement', value: value(record.requirement_summary) }, { label: 'Due date', value: value(record.due_date) }] }
    case 'quotation': return { ...common, title: value(record.quotation_number), state: value(record.status), lastRecordedAt: value(record.created_at), summary: [{ label: 'Currency', value: value(record.currency_code) }, { label: 'Valid until', value: value(record.valid_until) }] }
    case 'sales-order': return { ...common, title: value(record.sales_order_number), state: value(record.status), lastRecordedAt: value(record.created_at), summary: [{ label: 'Customer PO', value: value(record.customer_po_number) }, { label: 'Promised date', value: value(record.promised_date) }] }
    case 'lot': return { ...common, title: value(record.lot_code), state: value(record.qc_status), lastRecordedAt: value(record.created_at), summary: [{ label: 'Lot code', value: value(record.lot_code) }, { label: 'Lot revision', value: value(record.revision) }] }
    case 'shipment': return { ...common, title: value(record.shipment_number), state: value(record.status), lastRecordedAt: value(record.dispatched_at ?? record.created_at), summary: [{ label: 'Shipment number', value: value(record.shipment_number) }, { label: 'Dispatched at', value: value(record.dispatched_at) }] }
  }
}

async function relatedRecords(companyId: string, kind: RecordKind, id: string, record: RawRecord): Promise<RelatedRecord[]> {
  if (!supabase) return []
  const rows: RelatedRecord[] = []
  const add = (row: { id: string; label: string; kind: string } | null) => { if (row) rows.push(relatedRecordSchema.parse(row)) }

  if (kind === 'drawing') {
    const { data } = await supabase.from('items').select('id,sku,description').eq('company_id', companyId).eq('id', value(record.item_id)).maybeSingle()
    if (data) add({ id: data.id, label: `${data.sku} — ${data.description}`, kind: 'item' })
  }
  if (kind === 'rfq') {
    const { data } = await supabase.from('quotations').select('id,quotation_number').eq('company_id', companyId).eq('rfq_id', id).limit(20)
    data?.forEach((row) => add({ id: row.id, label: row.quotation_number, kind: 'quotation' }))
  }
  if (kind === 'quotation') {
    const [{ data: rfq }, { data: order }] = await Promise.all([
      supabase.from('rfqs').select('id,rfq_number').eq('company_id', companyId).eq('id', value(record.rfq_id)).maybeSingle(),
      supabase.from('sales_orders').select('id,sales_order_number').eq('company_id', companyId).eq('quotation_id', id).maybeSingle(),
    ])
    if (rfq) add({ id: rfq.id, label: rfq.rfq_number, kind: 'rfq' })
    if (order) add({ id: order.id, label: order.sales_order_number, kind: 'sales-order' })
  }
  if (kind === 'sales-order') {
    const [{ data: quotation }, { data: packingOrders }] = await Promise.all([
      supabase.from('quotations').select('id,quotation_number').eq('company_id', companyId).eq('id', value(record.quotation_id)).maybeSingle(),
      supabase.from('packing_orders').select('id,packing_number').eq('company_id', companyId).eq('sales_order_id', id).limit(20),
    ])
    if (quotation) add({ id: quotation.id, label: quotation.quotation_number, kind: 'quotation' })
    packingOrders?.forEach((row) => add({ id: row.id, label: row.packing_number, kind: 'packing-order' }))
  }
  if (kind === 'shipment') {
    const { data: packing } = await supabase.from('packing_orders').select('id,packing_number,sales_order_id').eq('company_id', companyId).eq('id', value(record.packing_order_id)).maybeSingle()
    if (packing) {
      add({ id: packing.id, label: packing.packing_number, kind: 'packing-order' })
      const { data: order } = await supabase.from('sales_orders').select('id,sales_order_number').eq('company_id', companyId).eq('id', packing.sales_order_id).maybeSingle()
      if (order) add({ id: order.id, label: order.sales_order_number, kind: 'sales-order' })
    }
  }
  return rows
}

async function readRecordWorkspace(companyId: string, kind: RecordKind, id: string): Promise<RecordWorkspace | null> {
  if (!supabase) throw new Error('The backend connection is not configured.')
  const config = recordReadConfig[kind]
  const { data, error } = await supabase.from(config.table).select(config.select).eq('company_id', companyId).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  const record = data as unknown as RawRecord
  const [related, timelineResult] = await Promise.all([
    relatedRecords(companyId, kind, id, record),
    supabase.from('audit_log').select('id,action,occurred_at,reason').eq('company_id', companyId).eq('entity_id', id).order('occurred_at', { ascending: false }).limit(20),
  ])
  if (timelineResult.error) throw timelineResult.error
  return { ...workspaceFromRecord(kind, record), relatedRecords: related, timeline: z.array(auditEventSchema).parse(timelineResult.data ?? []) }
}

export function useRecordWorkspace(companyId: string | null, kind: RecordKind | null, recordId: string | undefined) {
  return useQuery({
    queryKey: ['record-workspace', companyId, kind, recordId],
    enabled: Boolean(companyId && kind && recordId && supabase),
    queryFn: async () => readRecordWorkspace(companyId!, kind!, recordId!),
  })
}

export function recordKindLabel(kind: string) {
  return recordKindLabels[kind as RecordKind] ?? kind
}
