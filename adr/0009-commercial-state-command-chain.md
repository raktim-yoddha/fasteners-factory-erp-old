# ADR 0009 — Commercial state command chain

Builds on ADR 0004 and ADR 0008. Decided by the product owner, 2026-10-09.

## Context

Feasibility, quotation approval and sales-order creation each change several protected records and must retain
independent object state. Direct browser writes would permit partial transitions and stale approvals.

## Decision

Use separate idempotent PostgreSQL commands to record feasibility, create a quotation, approve a quotation and
accept an approved quotation into a sales order. Every command authenticates, checks its tenant permission,
locks the changed record, compares the expected revision, writes the audit event and returns structured failures.

## Consequences

The browser may read commercial records but cannot insert or advance their state directly. A screen must use the
returned current revision for an approval/acceptance command. The commands use approved BOM/routing IDs only.
