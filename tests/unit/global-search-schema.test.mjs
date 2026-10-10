import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261010114637_global_identifier_search.sql', import.meta.url), 'utf8')

describe('global identifier search migration', () => {
  it('uses caller RLS with a bounded normalized result contract', () => {
    expect(migration).toContain('security invoker')
    expect(migration).toContain('revoke all on function public.search_company_records(uuid, text) from public, anon;')
    expect(migration).toContain('grant execute on function public.search_company_records(uuid, text) to authenticated;')
    expect(migration).toContain('limit 20;')
    expect(migration).toContain('char_length(v_query) < 2')
  })
})
