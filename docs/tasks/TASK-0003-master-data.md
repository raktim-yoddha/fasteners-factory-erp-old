# TASK-0003 — Tenant-scoped master data
- Status: IN_PROGRESS
- Owner/agent: Codex
- Milestone: L2
- Related ADRs / docs: ADR 0002, 0004; `docs/domain-model.md`, `docs/security.md`
- Depends on: TASK-0002
- Discovery status: DESIGN PROPOSAL

## Goal
Create protected master records for customers, suppliers, items, drawings, locations and work centres.

## User-facing acceptance criteria
- A member with `master_data.read` sees only their company records.
- A member without `master_data.manage` cannot mutate master data through the API.
- An approved drawing revision cannot be changed; a new revision is required.

## In scope
Tenant-scoped schema, constraints, RLS, drawing-revision immutability and schema assertions.

## Out of scope
Master-data UI, trusted company bootstrap, real factory data, uploaded drawing files, BOM/routing and global search.

## Planned files/modules
`supabase/migrations/20261009172533_master_data.sql`, `docs/domain-model.md`, `tests/unit/master-data-schema.test.mjs`, task board.

## Data migration and authorization implications
All tables have `company_id`, RLS and policy-predicate indexes. Permissions reuse the role mapping created by TASK-0002.

## Test cases (happy, failure, concurrency, AI-off as relevant)
Schema assertions prove RLS, company scope and approved-revision immutability. Hosted cross-tenant/immutable-revision tests wait for project provisioning.

## Implementation notes
Every drawing revision pins to a company-scoped drawing; approved revision updates raise `APPROVED_REVISION_IMMUTABLE`.

## Validation evidence (exact command + result)
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — passed: 6 files, 20 tests.
- `pnpm build` — passed: production PWA output and service worker generated.
- Hosted migration/RLS integration — pending hosted project provisioning.

## Docs updated
`docs/domain-model.md`, `docs/tasks/TASKS.md` and this task file.

## Follow-ups / risks
Hosted Supabase creation remains blocked by its connector cost-confirmation endpoint.
