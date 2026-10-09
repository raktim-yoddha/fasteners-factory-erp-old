import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009173524_stock_ledger_reservations.sql', import.meta.url), 'utf8')

describe('stock ledger migration', () => {
  it('keeps quantity as an append-only derived ledger', () => {
    expect(migration).toContain('create table public.stock_ledger_entries')
    expect(migration).toContain('quantity_delta numeric(18, 6) not null check (quantity_delta <> 0)')
    expect(migration).toContain('create view public.stock_positions')
    expect(migration).toContain('available_to_promise')
    expect(migration).not.toContain('grant insert on public.stock_ledger_entries to authenticated')
  })

  it('serializes and validates stock reservations in a trusted command', () => {
    expect(migration).toContain('create function public.reserve_finished_goods(')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('for update;')
    expect(migration).toContain("raise exception 'INSUFFICIENT_AVAILABLE_STOCK'")
    expect(migration).toContain("raise exception 'LOT_QC_HOLD'")
    expect(migration).toContain("raise exception 'REVISION_CONFLICT'")
  })
})
