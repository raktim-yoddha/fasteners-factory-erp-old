import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009172820_versioned_bom_routing.sql', import.meta.url), 'utf8')

describe('versioned BOM and routing migration', () => {
  it('keeps approved revision headers immutable and child rows draft-only', () => {
    expect(migration).toContain("raise exception 'APPROVED_REVISION_IMMUTABLE';")
    expect(migration).toContain('prevent_approved_bom_revision_change')
    expect(migration).toContain('prevent_approved_routing_revision_change')
    expect(migration).toContain('private.is_bom_revision_draft(bom_revision_id)')
    expect(migration).toContain('private.is_routing_revision_draft(routing_revision_id)')
  })

  it('uses numeric measured quantities and explicit units', () => {
    expect(migration).toContain('quantity numeric(18, 6) not null check (quantity > 0)')
    expect(migration).toContain("uom text not null check (uom in ('pcs', 'kg', 'm', 'set'))")
  })
})
