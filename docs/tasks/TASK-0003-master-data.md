# TASK-0003 — Tenant-scoped master data
- Status: IN_PROGRESS
- Owner/agent: Codex
- Milestone: L2
- Related ADRs / docs: ADR 0002, 0004, 0006; `docs/domain-model.md`, `docs/security.md`
- Depends on: TASK-0002
- Discovery status: DESIGN PROPOSAL

## Goal
Create protected master records for customers, suppliers, items, drawings, locations and work centres.

## User-facing acceptance criteria
- A member with `master_data.read` sees only their company records.
- A member without `master_data.manage` cannot mutate master data through the API.
- An approved drawing revision cannot be changed; a new revision is required.
- An authorized operator can create each initial master record without leaving the active company.

## In scope
Tenant-scoped schema, constraints, RLS, drawing-revision immutability, schema assertions and the initial
single-record setup forms.

## Out of scope
Trusted company bootstrap, real factory data, uploaded drawing files, drawing-revision approval, BOM/routing and
global search.

## Planned files/modules
`supabase/migrations/20261009172533_master_data.sql`, `src/features/master-data/*`, `src/app/OperationsWorkspace.tsx`,
`docs/domain-model.md`, `docs/architecture.md`, `tests/unit/master-data-*.{test.tsx,test.mjs}`, task board.

## Data migration and authorization implications
All tables have `company_id`, RLS and policy-predicate indexes. Permissions reuse the role mapping created by TASK-0002.

## Test cases (happy, failure, concurrency, AI-off as relevant)
Schema assertions prove RLS, company scope and approved-revision immutability. UI tests prove the three formerly
missing record types retain the selected company and parent references. The hosted rollback test proves authorized
creation of all supported record types and rejects an unauthorized supplier insert.

## Implementation notes
Every drawing revision pins to a company-scoped drawing; approved revision updates raise `APPROVED_REVISION_IMMUTABLE`.

## Validation evidence (exact command + result)
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — passed: 31 files, 58 tests.
- `pnpm build` — passed: production PWA output and service worker generated.
- `pnpm e2e` — passed: one Chromium manufacturing-path test created SAMPLE master data and continued through the
  protected commercial, stock and dispatch workflow against the connected hosted Supabase project.
- `git diff --check` — passed.
- Hosted migration/RLS integration — passed 2026-10-10 through the connected hosted project. The rollback test
  created all seven supported master-record types as the SAMPLE administrator, rejected an unauthorized supplier
  insert, completed the wider commercial/stock/dispatch path, and left zero Auth, company, supplier, drawing,
  work-centre, sales-order, shipment and ledger rows behind.

## Docs updated
`adr/0006-fasteners-factory-erp-foundation.md`, `docs/domain-model.md`, `docs/architecture.md`,
`docs/tasks/TASKS.md` and this task file.

## Follow-ups / risks
Browser/device acceptance still needs a Cloudflare Pages deployment and an approved Auth user; the hosted Supabase
project itself is connected and has been integration-tested.
