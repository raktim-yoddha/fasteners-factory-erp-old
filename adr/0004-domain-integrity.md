# ADR 0004 — Ledger, command boundary, version pinning and per-object state machines

Builds on ADR 0002. Decided by the product owner, 2026-10-09.

## Context

A factory ERP is only trustworthy if stock, quality and shipment records are exact and traceable. The
brief (its ADR-005, ADR-006) proposes the structure; the owner approved the 16-stage backbone.

## Decision

Adopt the "Domain integrity" rules in `AGENTS.md`: append-only signed stock ledger with idempotency keys,
derived balances, trusted server-side commands for every multi-entity or inventory/QC/dispatch change,
immutable approved BOM/routing/drawing versions pinned by quotes, orders and work orders, lot
genealogy, and one state machine per object. The 16 stages are navigation, not a status field. The
Order Command Center shows concurrent sub-statuses. Fifteen acceptance scenarios (brief Part M)
become the end-to-end test list.

## Consequences

More up-front schema and test work, in exchange for traceability and safe concurrency. Concurrency
tests on the database are mandatory for reservation, issue, receipt, rework, release and dispatch.
