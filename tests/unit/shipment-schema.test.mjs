import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009173808_packing_shipment_dispatch.sql', import.meta.url), 'utf8')

describe('shipment dispatch migration', () => {
  it('keeps packing and shipment records under tenant RLS', () => {
    for (const table of ['packing_orders', 'packing_order_lines', 'shipments', 'shipment_lines']) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`)
    }
    expect(migration).not.toContain('grant insert on public.shipments to authenticated')
  })

  it('posts dispatch through one idempotent guarded command', () => {
    expect(migration).toContain('create function public.dispatch_shipment(')
    expect(migration).toContain("raise exception 'INSUFFICIENT_RESERVED_STOCK'")
    expect(migration).toContain("raise exception 'INSUFFICIENT_ON_HAND_STOCK'")
    expect(migration).toContain("raise exception 'EMPTY_SHIPMENT'")
    expect(migration).toContain("'shipment', -v_reservation.shipment_quantity")
    expect(migration).toContain("'dispatch_shipment', p_idempotency_key")
  })
})
