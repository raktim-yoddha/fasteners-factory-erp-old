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
Stock transfer, adjustment/reversal, reservation release and load testing beyond the two competing-command scenario.

## Planned files/modules
`supabase/migrations/20261009173524_stock_ledger_reservations.sql`, `supabase/migrations/20261009175441_stock_receipt_qc_release.sql`, schema tests, `docs/domain-model.md`, task board.

## Data migration and authorization implications
Ledger and reservation tables have no direct authenticated write grant. Receipt creates a held lot, Quality releases it by revision, and `reserve_finished_goods` checks tenant authorization, revision, QC status, availability and idempotency before writing the reservation and audit log.

## Test cases (happy, failure, concurrency, AI-off as relevant)
Static assertions cover append-only grants, held-lot receipt/release, RLS, derived availability, idempotency lock and explicit reservation errors. The hosted browser test covers duplicate and parallel reservation calls.

## Implementation notes
The lot row is locked during reservation, serializing competing requests for the same lot.

## Validation evidence (exact command + result)
`pnpm typecheck` (pass); `pnpm lint` (pass); `pnpm e2e` (one Chromium manufacturing-path test passed against
connected hosted Supabase; concurrent 6-piece reservations against a 10-piece lot yielded one success and one
structured rejection); `pnpm test` (31 files, 58 tests passed); `pnpm build` (pass); `git diff --check` (pass),
run 2026-10-10. Hosted rollback integration passed 2026-10-10: receipt held the SAMPLE lot until release, reservation
was idempotent, and an oversell attempt returned `INSUFFICIENT_AVAILABLE_STOCK`.

## Docs updated
`adr/0010-qc-hold-before-reservation.md`, `docs/architecture.md` and `docs/domain-model.md`.

## Follow-ups / risks
The browser E2E path sends two concurrent 6-piece reservations for a 10-piece SAMPLE lot: exactly one succeeds and
the other receives a structured `REVISION_CONFLICT` or `INSUFFICIENT_AVAILABLE_STOCK` response. The hosted rollback
integration also covers idempotency and oversell rejection. Larger load testing remains open until real expected
transaction volume is verified.
