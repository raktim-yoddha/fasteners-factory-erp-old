import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009174620_create_rfq_command.sql', import.meta.url), 'utf8')

describe('RFQ command migration', () => {
  it('creates the RFQ, lines and audit event through one protected command', () => {
    expect(migration).toContain('create function public.create_rfq(')
    expect(migration).toContain("private.has_company_permission(p_company_id, 'sales.manage')")
    expect(migration).toContain('insert into public.rfqs')
    expect(migration).toContain('insert into public.rfq_lines')
    expect(migration).toContain('insert into public.audit_log')
  })

  it('validates scoped records and retries', () => {
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain("raise exception 'CUSTOMER_NOT_FOUND'")
    expect(migration).toContain("raise exception 'INVALID_RFQ_LINE'")
    expect(migration).toContain("'create_rfq', p_idempotency_key")
  })
})
