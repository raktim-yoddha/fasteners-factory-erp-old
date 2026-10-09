import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009175441_stock_receipt_qc_release.sql', import.meta.url), 'utf8')

describe('stock receipt and release migration', () => {
  it('posts receipt to a held lot through a guarded command', () => {
    expect(migration).toContain('create function public.receive_finished_goods(')
    expect(migration).toContain("'production_receipt'")
    expect(migration).toContain("'hold'")
    expect(migration).toContain("raise exception 'UOM_MISMATCH'")
  })

  it('requires quality permission and revision to release a lot', () => {
    expect(migration).toContain('create function public.release_stock_lot(')
    expect(migration).toContain("'quality.release'")
    expect(migration).toContain("raise exception 'REVISION_CONFLICT'")
    expect(migration).toContain("qc_status = 'released'")
  })
})
