# ADR 0015 — UX foundation and secure record workspaces

Builds on ADR 0003, ADR 0004 and ADR 0014. Decided by the product owner, 2026-10-10.

## Context

The first authenticated ERP surface has safe commands and identifier search, but operators cannot use search to open
a record, lack a documented keyboard route to search, and have no uniform read-only record context. The product owner
approved UX-0 and UX-1 from the local UX roadmap. This must add speed without treating keyboard input as a privileged
workflow or widening tenant visibility.

## Decision

- Add durable browser routes for the current searchable record kinds and render a read-only record workspace from
  existing table reads under the caller's existing RLS permissions.
- A search result is a navigation control to that record route. It uses the existing caller-RLS search RPC and does
  not add a broader search permission or a browser-side cross-company join.
- The workspace identifies the record's source, state, last confirmed time, related permitted records and the next
  relevant operations workspace. Its timeline reads the existing `audit_log` table, so it is visible only to callers
  already granted `audit.read`; it must explicitly say when history is unavailable under current permissions.
- Standardize non-destructive keyboard discovery: `Ctrl/Cmd+K` focuses search, `/` focuses it outside editable
  controls, and `Esc` clears an active search. The shortcut help is visible in the app. No shortcut submits a command.
- Show explicit online/offline state. Offline disables critical stock and dispatch writes with an operator-readable
  explanation; cached data remains read-only.

## Consequences

This adds no new database table, RLS policy, privileged function, direct business-table write, storage bucket or
hardware integration. The first record workspace covers only current MVP search types and exposes no certificate or
attachment content. Broad audit-history access, report saved views, document storage and advanced command palette
actions remain separate decisions.

## Amendment (2026-10-11): full offline read-only surface

The shell disables every operational command control while offline, not only stock and dispatch. Critical stock and
dispatch panels retain their local explanation because they contain server-confirmed inventory and shipment commands.
Navigation, sign-out, company selection and read-only record context remain usable.


## Amendment (2026-10-12): Exact scanning, recoverable history and labels

Keyboard-wedge input/paste plus Enter resolves exact permitted item/lot/work/job/shipment/package identifiers via
SECURITY INVOKER lookup. Ambiguity requires operator choice; lookup never performs a business command. Code 39 SVG
labels reuse recorded identifiers and show text fallback for unsupported values rather than silently altering codes.
Lot/package print portals isolate identity/confirmed contents from the workspace; current stock/QC is checked by lookup.

Related links now use a single permission-preserving SECURITY INVOKER keyset RPC instead of client fan-out or truncated
intermediate ID lists. Timeline and stock ledger use keyset pages; bigint event IDs remain text. Record/company changes
reset paging state. Private evidence is reachable through its owning module. Deferred workspaces reuse loading recovery;
Vite default chunks and an automatic static-import graph check replace custom grouping that caused a runtime cycle.
Offline company-read startup no longer blocks the installed shell. Backend responses stay uncached and writes online-only.
