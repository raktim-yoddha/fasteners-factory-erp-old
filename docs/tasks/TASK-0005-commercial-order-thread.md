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
RFQ, feasibility, quotation and sales-order tables, constraints, read RLS, initial commercial permissions and the commercial command chain.

## Out of scope
Commercial detail screens, stock reservation, packing, dispatch and hosted integration tests.

## Planned files/modules
`supabase/migrations/20261009173102_commercial_order_thread.sql`, `supabase/migrations/20261009174620_create_rfq_command.sql`, `supabase/migrations/20261009175210_commercial_workflow_commands.sql`, `src/features/sales/*`, schema/UI tests, `docs/domain-model.md`, task board.

## Data migration and authorization implications
No direct authenticated write grant exists for these stateful tables. Trusted commands own RFQ creation, feasibility, quotation and sales-order transitions.

## Test cases (happy, failure, concurrency, AI-off as relevant)
Static assertions cover tenant RLS, numeric amounts, pinning references and guarded RFQ creation; hosted tests await provisioning.

## Implementation notes
The sales-order status is independent from RFQ/quote status; it is not a global workflow field.

## Validation evidence (exact command + result)
`pnpm typecheck` (pass); `pnpm lint` (pass); `pnpm test` (31 files, 58 tests passed); `pnpm build` (pass); `git diff --check` (pass), run 2026-10-10. Hosted rollback integration passed on 2026-10-10: approved SAMPLE BOM/routing revisions were selected for feasibility and quotation, then verified on the resulting sales-order line; the transaction left no data behind.

## Docs updated
`adr/0008-rfq-command-boundary.md`, `adr/0009-commercial-state-command-chain.md`, `docs/architecture.md`, `docs/domain-model.md` and `docs/tasks/TASK-0008-mvp-surface-hardening.md`.

## Follow-ups / risks
Commercial detail screens and multi-line quotations remain later work; the hosted Supabase project is connected.
