# ADR 0010 — QC hold before reservation

Builds on ADR 0004. Decided by the product owner, 2026-10-09.

## Context

The first stock slice needs a safe route to receive finished goods while preserving the rule that held or rejected
lots cannot be promised to a customer. Direct lot or ledger writes would bypass quantity and audit protection.

## Decision

`receive_finished_goods` creates new lots in QC hold and posts an append-only receipt movement. A separate
`release_stock_lot` command requires Quality permission and a matching lot revision before changing it to released.
Only released lots can pass the existing reservation command.

## Consequences

Receipt and QC release are separate audit events. This MVP deliberately does not define a factory inspection plan,
measurements or rejection disposition; those require verified factory discovery in the quality milestone.
