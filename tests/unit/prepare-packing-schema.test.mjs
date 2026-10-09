import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009175618_prepare_packing_shipment.sql', import.meta.url), 'utf8')

describe('prepare packing shipment migration', () => {
  it('creates protected packing and shipment records from active reservations', () => {
    expect(migration).toContain('create function public.prepare_packing_shipment(')
    expect(migration).toContain("'shipment.prepared'")
    expect(migration).toContain('insert into public.packing_order_lines')
    expect(migration).toContain('insert into public.shipment_lines')
  })

  it('rejects stale orders and over-packed reservation quantities', () => {
    expect(migration).toContain("raise exception 'REVISION_CONFLICT'")
    expect(migration).toContain("raise exception 'INVALID_RESERVATION'")
    expect(migration).toContain("raise exception 'INSUFFICIENT_RESERVED_STOCK'")
    expect(migration).toContain("raise exception 'DUPLICATE_RESERVATION_LINE'")
  })
})
