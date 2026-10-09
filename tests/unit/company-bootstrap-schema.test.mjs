import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009175817_initial_company_bootstrap.sql', import.meta.url), 'utf8')

describe('initial company bootstrap migration', () => {
  it('creates the initial tenant and caller administration atomically', () => {
    expect(migration).toContain('create function public.bootstrap_initial_company(')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('insert into public.company_memberships')
    expect(migration).toContain("'admin'")
  })

  it('allows bootstrap only once', () => {
    expect(migration).toContain('if exists (select 1 from public.companies)')
    expect(migration).toContain("raise exception 'INITIAL_COMPANY_ALREADY_EXISTS'")
  })
})
