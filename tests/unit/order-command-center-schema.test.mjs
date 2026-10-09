import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009193512_order_command_center.sql', import.meta.url), 'utf8')

describe('order command centre schema', () => {
  it('uses a protected read command and preserves independent state labels', () => {
    expect(migration).toContain('create function public.get_order_command_center')
    expect(migration).toContain("private.has_company_permission(p_company_id, 'sales.read')")
    expect(migration).toContain("'awaiting reservation'")
    expect(migration).toContain("'prepared for gate-out'")
    expect(migration).toContain('revoke all on function public.get_order_command_center(uuid) from public, anon')
  })
})
