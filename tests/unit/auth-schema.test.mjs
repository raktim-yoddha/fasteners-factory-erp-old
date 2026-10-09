import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009172217_auth_rbac_audit.sql', import.meta.url), 'utf8')
const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8')

describe('authorization migration', () => {
  it('enables row-level security for every exposed authorization table', () => {
    for (const table of ['companies', 'plants', 'profiles', 'company_memberships', 'user_company_roles', 'permission_definitions', 'role_permissions', 'audit_log']) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`)
    }
  })

  it('keeps permission checks in private database helpers', () => {
    expect(migration).toContain('create schema if not exists private;')
    expect(migration).toContain('revoke all on function private.has_company_permission(uuid, text) from public;')
    expect(migration).toContain("to authenticated")
    expect(migration).not.toContain('raw_user_meta_data ->> \'role\'')
  })

  it('keeps the project configuration closed to public sign-up', () => {
    expect(config.match(/enable_signup = false/g)).toHaveLength(3)
  })
})
