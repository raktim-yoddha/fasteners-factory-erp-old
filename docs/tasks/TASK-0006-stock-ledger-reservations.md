# TASK-0006 — Append-only stock ledger and safe finished-goods reservation
- Status: IN_PROGRESS
- Owner/agent: Codex
- Milestone: L3
- Related ADRs / docs: ADR 0004; `docs/domain-model.md`; `docs/security.md`
- Depends on: TASK-0004
- Discovery status: DESIGN PROPOSAL

## Goal
Represent stock as an append-only lot ledger and reserve finished goods without allowing oversell.

## User-facing acceptance criteria
- On-hand, reserved and available-to-promise are derived from the ledger and active reservations.
- Callers can reserve only a released-QC lot for the matching sales-order item, with an idempotency key.
- Concurrent reservations on one lot cannot take available stock below zero.

## In scope
Lots, ledger entries, derived positions, QC-hold receipt/release, reservations, read RLS and the trusted stock commands.

## Out of scope
Stock transfer, adjustment/reversal, reservation release and hosted concurrency execution.

## Planned files/modules
`supabase/migrations/20261009173524_stock_ledger_reservations.sql`, `supabase/migrations/20261009175441_stock_receipt_qc_release.sql`, schema tests, `docs/domain-model.md`, task board.

## Data migration and authorization implications
Ledger and reservation tables have no direct authenticated write grant. Receipt creates a held lot, Quality releases it by revision, and `reserve_finished_goods` checks tenant authorization, revision, QC status, availability and idempotency before writing the reservation and audit log.

## Test cases (happy, failure, concurrency, AI-off as relevant)
Static assertions cover append-only grants, held-lot receipt/release, RLS, derived availability, idempotency lock and explicit reservation errors. Hosted tests will cover duplicate and parallel reservation calls.

## Implementation notes
The lot row is locked during reservation, serializing competing requests for the same lot.

## Validation evidence (exact command + result)
`pnpm typecheck` (pass); `pnpm lint` (pass); `pnpm test` (15 files, 36 tests passed); `pnpm build` (pass); `git diff --check` (pass), run 2026-10-09.

## Docs updated
`adr/0010-qc-hold-before-reservation.md`, `docs/architecture.md` and `docs/domain-model.md`.

## Follow-ups / risks
Hosted Supabase project creation remains unavailable through the connector's missing cost-confirmation endpoint.
