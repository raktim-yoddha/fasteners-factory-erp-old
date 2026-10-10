# ADR 0014 — Global search through caller RLS

Builds on ADR 0002 and ADR 0004. Decided by the product owner, 2026-10-10.

## Context

The installed operations workspace needs a quick way to locate the current MVP's identifiers without exposing
another company's master, commercial, stock or shipment records. The brief requires permissions to filter search
results but does not prescribe a separate search role.

## Decision

Expose a narrow, read-only `search_company_records` database function that runs as the caller and queries existing
tables through their RLS policies. It accepts an active company and a two-or-more-character query, returns at most
20 normalized identifier results, and appears in the authenticated workspace. Its default public and anonymous
execution privileges are explicitly revoked; only `authenticated` may invoke it. It adds no search-specific
permission and no browser-side cross-table join.

## Consequences

Search visibility always matches the caller's existing table permissions. The first version covers only current MVP
records and substring identifier/name matching; document contents, fuzzy ranking, attachments and production objects
remain later work.
