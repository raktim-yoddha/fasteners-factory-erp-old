import { describe, expect, it } from 'vitest'
import { isRecordKind, recordKindFromSearchResult } from '@/features/records/recordTypes'

describe('record route types', () => {
  it('maps only known, searchable record types to record routes', () => {
    expect(recordKindFromSearchResult({ record_type: 'Sales order', record_id: '00000000-0000-4000-8000-000000000001', label: 'SO-001' })).toBe('sales-order')
    expect(recordKindFromSearchResult({ record_type: 'Unknown', record_id: '00000000-0000-4000-8000-000000000001', label: 'Unknown' })).toBeNull()
    expect(isRecordKind('shipment')).toBe(true)
    expect(isRecordKind('packing-order')).toBe(false)
  })
})
