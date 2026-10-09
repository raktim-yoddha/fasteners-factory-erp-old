# ADR 0012 — Initial tenant bootstrap

Builds on ADR 0002. Decided by the product owner, 2026-10-09.

## Context

A hosted project starts with no company, plant, membership or administrator. Regular RLS policies correctly block
an authenticated user from creating them, but that leaves the first approved user unable to initialize the app.

## Decision

Expose one security-definer `bootstrap_initial_company` command. It requires an authenticated user, serializes with
a global transaction lock and succeeds only while no company exists. It creates the company, first plant, caller
membership, caller administrator role and audit record together.

## Consequences

The hosted project administrator must provision the first approved Auth user before bootstrap. After one company
exists, the command always rejects; future company/plant administration uses protected role-based operations.
