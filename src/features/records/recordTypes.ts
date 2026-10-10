import type { GlobalSearchResult } from '@/features/search/useGlobalSearch'

export const recordKinds = ['customer', 'supplier', 'item', 'drawing', 'rfq', 'quotation', 'sales-order', 'lot', 'shipment'] as const
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
} as const satisfies Record<string, RecordKind>

export const recordKindLabels: Record<RecordKind, string> = {
  customer: 'Customer', supplier: 'Supplier', item: 'Item', drawing: 'Drawing', rfq: 'RFQ', quotation: 'Quotation', 'sales-order': 'Sales order', lot: 'Lot', shipment: 'Shipment'
}

export function isRecordKind(value: string | undefined): value is RecordKind {
  return recordKinds.some((kind) => kind === value)
}

export function recordKindFromSearchResult(result: GlobalSearchResult): RecordKind | null {
  return kindBySearchType[result.record_type as keyof typeof kindBySearchType] ?? null
}
