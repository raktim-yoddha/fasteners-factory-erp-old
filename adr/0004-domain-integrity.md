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

## Amendment (2026-10-10): Tenant-scoped work-centre reference

`customers`, `suppliers`, `drawing_revisions` and `work_centres` carry composite `(id, company_id)` keys so
tenant-scoped foreign keys enforce their company scope in the database. The correction is represented both in the
original schema for fresh projects and in follow-up migrations for already-created databases.

## Amendment (2026-10-10): Command execution hardening

Every public `SECURITY DEFINER` command explicitly revokes the default `anon` and `PUBLIC` execution privileges.
Commands remain callable only by the granted authenticated role and still validate `auth.uid()` and tenant permissions.

## Amendment (2026-10-10): Read-only Order Command Center

The Command Center now uses one protected read command, authorized by `sales.read`, to return each sales order's
independent commercial, reservation, packing and dispatch states. It returns counts of protected records rather than
adding an aggregate quantity across potentially different UOMs, and it supplies a current next action without
inventing a factory escalation or block reason.
