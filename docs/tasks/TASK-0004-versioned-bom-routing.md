# TASK-0004 — Versioned BOMs and routings
- Status: DONE
- Owner/agent: Codex
- Milestone: L2
- Related ADRs / docs: ADR 0004; `docs/domain-model.md`
- Depends on: TASK-0003
- Discovery status: DESIGN PROPOSAL

## Goal
Store company-scoped BOM and routing definitions whose approved revisions cannot be overwritten.

## User-facing acceptance criteria
- Engineering can build a draft BOM/routing revision with measured numeric quantities and operation times.
- Once approved, the revision and its lines/operations are immutable.
- Future quotations, orders and work orders can pin the approved revision id.

## In scope
BOM/routing headers, revisions, component lines, operations, constraints, draft-only write policies and indexes.

## Out of scope
Approval UI, workflow assignment, global search UI, order data, MRP and work orders.

## Planned files/modules
`supabase/migrations/20261009172820_versioned_bom_routing.sql`, `docs/domain-model.md`, schema and hosted-integration
tests, task board.

## Data migration and authorization implications
All tables are tenant-scoped/RLS-protected. Revision children use a private draft check, so an approved header cannot be
used to mutate its BOM lines or routing operations.

## Test cases (happy, failure, concurrency as relevant)
Schema assertions cover immutability triggers and draft-only child policies. Hosted rollback tests create SAMPLE draft
revisions and children, approve them, reject header updates and confirm approved child updates affect no rows.

## Implementation notes
Time and quantity values use `NUMERIC`, not JavaScript floating point. Units remain explicit.

## Validation evidence (exact command + result)
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — passed: 28 files, 55 tests.
- `pnpm build` — passed: production PWA output and service worker generated.
- `git diff --check` — passed.
- Hosted migration/RLS integration — passed 2026-10-10 through the connected hosted project. The rollback test
  created SAMPLE BOM/routing revisions, lines and operations, proved approved revision headers throw
  `APPROVED_REVISION_IMMUTABLE`, and proved approved child updates affect no rows. A follow-up count confirmed
  zero Auth, company, BOM, revision, routing and ledger rows remained.

## Docs updated
`docs/domain-model.md`, `docs/testing.md`, `docs/tasks/TASKS.md` and this task file.

## Follow-ups / risks
Drawing/file and BOM/routing review/approval UI is implemented by TASK-0013/TASK-0015; original versioning scope remains complete.


## Reconciled validation (2026-10-12)
`pnpm test:factory` PASS: typecheck, lint, 186 tests/62 files, 15 rollback SQL suites, read-only operations checks,
production PWA build/chunk checks, 20 browser journeys, encrypted DB/private-object backup and restored-DB regressions;
131.4 seconds. Recovery compared 114 tables and 93 private files. Later archive CLI guard test passed in the focused
operations suite; final unit count is recorded in TASK-0016. Installed factory acceptance remains TASK-0008.
