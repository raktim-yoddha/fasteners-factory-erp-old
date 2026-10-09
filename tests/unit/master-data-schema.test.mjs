import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009172533_master_data.sql', import.meta.url), 'utf8')

describe('master data migration', () => {
  it('scopes every master-data table by company and enables RLS', () => {
    for (const table of ['customers', 'suppliers', 'items', 'drawings', 'drawing_revisions', 'warehouses', 'stock_locations', 'work_centres']) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`)
    }
    expect(migration.match(/company_id uuid not null/g)?.length).toBeGreaterThanOrEqual(8)
  })

  it('prevents changes to approved drawing revisions', () => {
    expect(migration).toContain("raise exception 'APPROVED_REVISION_IMMUTABLE';")
    expect(migration).toContain('before update on public.drawing_revisions')
  })
})
