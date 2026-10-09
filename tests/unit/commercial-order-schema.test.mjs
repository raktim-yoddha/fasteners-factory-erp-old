import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../supabase/migrations/20261009173102_commercial_order_thread.sql', import.meta.url), 'utf8')

describe('commercial order migration', () => {
  it('separates RFQ, quote and sales-order states under RLS', () => {
    for (const table of ['rfqs', 'feasibility_reviews', 'quotations', 'sales_orders']) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`)
    }
    expect(migration).toContain("status text not null default 'new'")
    expect(migration).toContain("status text not null default 'draft'")
    expect(migration).toContain("status text not null default 'open'")
  })

  it('uses numeric commercial values and pinned engineering revision references', () => {
    expect(migration).toContain('unit_price numeric(18, 4) not null check (unit_price >= 0)')
    expect(migration).toContain('foreign key (bom_revision_id, company_id) references public.bom_revisions(id, company_id)')
    expect(migration).toContain('foreign key (routing_revision_id, company_id) references public.routing_revisions(id, company_id)')
  })
})
