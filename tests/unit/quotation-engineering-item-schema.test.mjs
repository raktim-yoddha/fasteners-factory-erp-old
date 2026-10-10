import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261010115244_enforce_quoted_item_engineering_revisions.sql', import.meta.url), 'utf8')

describe('quotation engineering item invariant', () => {
  it('rejects BOM and routing revisions that belong to another output item', () => {
    expect(migration).toContain("raise exception 'ENGINEERING_REVISION_ITEM_MISMATCH';")
    expect(migration).toContain('bom.output_item_id = new.item_id')
    expect(migration).toContain('routing.output_item_id = new.item_id')
    expect(migration).toContain('before insert or update of item_id, bom_revision_id, routing_revision_id on public.quotation_lines')
  })
})
