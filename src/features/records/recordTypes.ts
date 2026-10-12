import type { GlobalSearchResult } from '@/features/search/useGlobalSearch'

export const recordKinds = [
  'customer',
  'supplier',
  'item',
  'drawing',
  'rfq',
  'quotation',
  'sales-order',
  'lot',
  'shipment',
  'purchase-requisition',
  'purchase-order',
  'goods-receipt',
  'work-order',
  'job-card',
  'inspection',
  'ncr',
] as const
export type RecordKind = (typeof recordKinds)[number]

const kindBySearchType = {
  Customer: 'customer',
  Supplier: 'supplier',
  Item: 'item',
  Drawing: 'drawing',
  RFQ: 'rfq',
  Quotation: 'quotation',
  'Sales order': 'sales-order',
  Lot: 'lot',
  Shipment: 'shipment',
  'Purchase requisition': 'purchase-requisition',
  'Purchase order': 'purchase-order',
  'Goods receipt': 'goods-receipt',
  'Work order': 'work-order',
  'Job card': 'job-card',
  Inspection: 'inspection',
  NCR: 'ncr',
} as const satisfies Record<string, RecordKind>

export const recordKindLabels: Record<RecordKind, string> = {
  customer: 'Customer',
  supplier: 'Supplier',
  item: 'Item',
  drawing: 'Drawing',
  rfq: 'RFQ',
  quotation: 'Quotation',
  'sales-order': 'Sales order',
  lot: 'Lot',
  shipment: 'Shipment',
  'purchase-requisition': 'Purchase requisition',
  'purchase-order': 'Purchase order',
  'goods-receipt': 'Goods receipt',
  'work-order': 'Work order',
  'job-card': 'Job card',
  inspection: 'Inspection',
  ncr: 'NCR',
}

export function isRecordKind(value: string | undefined): value is RecordKind {
  return recordKinds.some((kind) => kind === value)
}

export function recordKindFromSearchResult(
  result: GlobalSearchResult,
): RecordKind | null {
  return (
    kindBySearchType[result.record_type as keyof typeof kindBySearchType] ??
    null
  )
}
