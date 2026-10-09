import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009175210_commercial_workflow_commands.sql', import.meta.url), 'utf8')

describe('commercial workflow command migration', () => {
  it('owns feasibility, quotation and sales-order transitions in commands', () => {
    for (const command of ['record_feasibility', 'create_quotation', 'approve_quotation', 'accept_quotation_create_sales_order']) {
      expect(migration).toContain(`create function public.${command}(`)
      expect(migration).toContain(`'${command}'`)
    }
    expect(migration).toContain('for update;')
    expect(migration).toContain('insert into public.audit_log')
  })

  it('rejects stale, unapproved and invalid commercial transitions', () => {
    expect(migration).toContain("raise exception 'REVISION_CONFLICT'")
    expect(migration).toContain("raise exception 'ENGINEERING_REVISION_NOT_APPROVED'")
    expect(migration).toContain("raise exception 'RFQ_NOT_QUALIFIED'")
    expect(migration).toContain("raise exception 'INVALID_TRANSITION'")
  })
})
