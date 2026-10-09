import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261010002300_harden_command_function_privileges.sql', import.meta.url), 'utf8')

describe('command privilege hardening migration', () => {
  it('removes anonymous execution from every public security-definer command', () => {
    expect(migration).toContain("revoke all on function %s from public, anon")
    expect(migration).toContain('where n.nspname = \'public\' and p.prosecdef')
  })
})
