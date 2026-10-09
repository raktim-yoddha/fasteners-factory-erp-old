# TASK-0004 — Versioned BOMs and routings
- Status: IN_PROGRESS
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
`supabase/migrations/20261009172820_versioned_bom_routing.sql`, `docs/domain-model.md`, schema test and task board.

## Data migration and authorization implications
All tables are tenant-scoped/RLS-protected. Revision children use a private draft check, so an approved header cannot be
used to mutate its BOM lines or routing operations.

## Test cases (happy, failure, concurrency, AI-off as relevant)
Schema assertions cover immutability triggers and draft-only child policies. Hosted tests will attempt child mutation after approval.

## Implementation notes
Time and quantity values use `NUMERIC`, not JavaScript floating point. Units remain explicit.

## Validation evidence (exact command + result)
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — passed: 7 files, 22 tests.
- `pnpm build` — passed: production PWA output and service worker generated.
- Hosted migration integration — pending project provisioning.

## Docs updated
`docs/domain-model.md`, `docs/tasks/TASKS.md` and this task file.

## Follow-ups / risks
Hosted migration integration waits for Supabase project creation.
