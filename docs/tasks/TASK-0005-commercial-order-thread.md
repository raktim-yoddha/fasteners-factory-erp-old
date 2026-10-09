# TASK-0005 — RFQ through sales order record chain
- Status: IN_PROGRESS
- Owner/agent: Codex
- Milestone: L3
- Related ADRs / docs: ADR 0004; `docs/domain-model.md`
- Depends on: TASK-0004
- Discovery status: DESIGN PROPOSAL

## Goal
Create the auditable data chain from RFQ through feasibility and quote to sales order.

## User-facing acceptance criteria
- Commercial records are company-scoped and read only to callers without the correct sales permission.
- A quote and sales-order line pin the related item and optional approved engineering revisions.
- Quantities and prices are exact database numerics with explicit UOM/currency.

## In scope
RFQ, feasibility, quotation and sales-order tables, constraints, read RLS and initial commercial permissions.

## Out of scope
Commercial forms, approval/acceptance RPCs, stock reservation, packing, dispatch and hosted integration tests.

## Planned files/modules
`supabase/migrations/20261009173102_commercial_order_thread.sql`, schema test, `docs/domain-model.md`, task board.

## Data migration and authorization implications
No direct authenticated write grant exists for these stateful tables. A later trusted command migration owns transitions.

## Test cases (happy, failure, concurrency, AI-off as relevant)
Static assertions cover tenant RLS, numeric amounts and pinning references; hosted tests await provisioning.

## Implementation notes
The sales-order status is independent from RFQ/quote status; it is not a global workflow field.

## Validation evidence (exact command + result)
`pnpm typecheck` (pass); `pnpm lint` (pass); `pnpm test` (8 files, 24 tests passed); `pnpm build` (pass); `git diff --check` (pass), run 2026-10-09.

## Docs updated
`docs/domain-model.md` and `docs/tasks/TASKS.md`.

## Follow-ups / risks
Hosted Supabase project creation is unavailable through the connector's missing cost-confirmation endpoint.
