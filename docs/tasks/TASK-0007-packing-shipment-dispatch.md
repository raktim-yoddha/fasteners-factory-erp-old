# TASK-0007 — Packing, shipment and guarded dispatch
- Status: IN_PROGRESS
- Owner/agent: Codex
- Milestone: L3
- Related ADRs / docs: ADR 0004; `docs/domain-model.md`; `docs/security.md`
- Depends on: TASK-0005, TASK-0006
- Discovery status: DESIGN PROPOSAL

## Goal
Dispatch packed finished goods through one idempotent command that consumes reservations and posts the stock ledger.

## User-facing acceptance criteria
- Packing, shipment and sales-order states remain separate and tenant-scoped.
- Dispatch cannot use unreserved quantity, duplicate a shipment, or mark an empty shipment successful.
- A dispatch writes the signed stock movement, fulfillment result and audit record together.

## In scope
Packing and shipment records, shipment lines, read RLS and the dispatch RPC.

## Out of scope
Packing preparation command, carrier integration, tax documents, printed labels and hosted integration tests.

## Planned files/modules
`supabase/migrations/20261009173808_packing_shipment_dispatch.sql`, schema test, `docs/domain-model.md`, task board.

## Data migration and authorization implications
Authenticated callers have read-only access to shipment records. The security-definer dispatch command owns all state, reservation, ledger and audit changes.

## Test cases (happy, failure, concurrency, AI-off as relevant)
Static assertions cover RLS, idempotency, reservation consumption and structured dispatch errors. Hosted tests will cover parallel dispatch attempts.

## Implementation notes
Shipping quantity is posted as a negative ledger entry, never by mutating a balance.

## Validation evidence (exact command + result)
`pnpm typecheck` (pass); `pnpm lint` (pass); `pnpm test` (10 files, 28 tests passed); `pnpm build` (pass); `git diff --check` (pass), run 2026-10-09.

## Docs updated
`docs/domain-model.md` and `docs/tasks/TASKS.md`.

## Follow-ups / risks
Hosted Supabase project creation remains unavailable through the connector's missing cost-confirmation endpoint.
