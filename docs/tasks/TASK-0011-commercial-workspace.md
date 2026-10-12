# TASK-0011 — Commercial workspace and audit repairs
- Status: IN_REVIEW
- Owner/agent: Codex
- Milestone: L3 / UX-2
- Related ADRs / docs: ADR 0016, ADR 0004, ADR 0013; docs/design.md
- Depends on: TASK-0010
- Discovery status: DESIGN PROPOSAL

## Goal
Make the existing commercial chain usable and repair verified authorization, QC and stock arithmetic faults.

## User-facing acceptance criteria
RFQ inbox filters and detail expose request, customer, dates, lines and feasibility notes. Explicit quotation validity
and order promise dates replace hidden current-date defaults. Approval and acceptance show pinned revisions and pricing.
Customer/item creation is available in context only to authorized master owners. Approved quotations can be printed.
Deactivated membership cannot read or write. Receipt cannot bypass QC by topping up a released lot. Partial dispatch
does not overstate reservations; a reservation cannot exceed outstanding demand. Identity changes clear cached reads.

## In scope
Existing sales, stock, record, auth and shared presentation paths, additive integrity migration, executable regression tests.

## Out of scope
Factory-specific pricing, finance, messaging, production deployment, AI, hardware.

## Planned files/modules
src/app/*; src/auth/*; src/features/sales/*; src/features/records/*; src/features/stock/*;
src/components/*; src/lib/*; src/styles.css; supabase/migrations/*ux_commercial_stock_integrity.sql;
tests/unit/*; tests/e2e/*; tests/integration/*; docs/design.md, architecture.md, testing.md, workflows.md, task board.

## Data migration and authorization implications
Add drawing pins and pricing source to commercial lines. Preserve existing commands and grants. Repair shared permission
helper and stock-position derivation. No browser business-table write grants.

## Test cases (happy, failure, concurrency as relevant)
Execute SQL regressions for inactive membership, partial shipments, over-reservation, unit mismatch, engineering pins,
QC top-up, idempotency and tenant denial. Browser checks cover keyboard, commercial flow, approval, dates and responsive layout.

## Implementation notes
Work in commercial/integrity, procurement/inventory, then automated verification slices. Preserve the user's .gitignore changes.

## Validation evidence (exact command + result)
Baseline: `pnpm typecheck`, `pnpm lint`, `pnpm test` — passed; 33 files, 64 tests.
Current: `pnpm typecheck`, `pnpm lint`, `pnpm test` — passed; 38 files, 70 tests.
`pnpm e2e` — 4 real authenticated Chromium tests passed in 30.9s against the configured SAMPLE Supabase environment.
It covers commercial/stock/concurrent-reservation/dispatch/purchasing, six widths, offline recovery and sign-out.
Supabase `execute_sql(project_id: configured SAMPLE project, query: tests/integration/hosted-manufacturing-path.sql)`
and `execute_sql(..., query: tests/integration/material-procurement.sql)` — both assertion transactions passed and rolled back.
Final `pnpm check` against local disposable Supabase — passed: typecheck, lint, 38 unit/component files (70 tests),
production build and all 4 browser tests (13.0s); no skips or retries.
`pnpm e2e:stack`, `pnpm e2e:seed`, `pnpm test:db` — all 26 migrations applied; invited SAMPLE setup and public-signup
denial passed; both executable assertion suites passed and rolled back, including inactive-company read denial.

The verified SAMPLE project's migration-history versions were normalized by unique name to the committed filenames;
SQL statements and business records were preserved. The prior mapping is retained in ignored `supabase/.temp/`.

## Docs updated
ADR 0016, ADR 0013 amendment, design, architecture, product, domain model, style, workflows, testing, audit, README,
master-brief historical-proposal clarification and task board.

## Follow-ups / risks
Real operator SOP and physical installed-device acceptance remain unverified.


## Reconciled validation (2026-10-12)
`pnpm test:factory` PASS: typecheck, lint, 186 tests/62 files, 15 rollback SQL suites, read-only operations checks,
production PWA build/chunk checks, 20 browser journeys, encrypted DB/private-object backup and restored-DB regressions;
131.4 seconds. Recovery compared 114 tables and 93 private files. Later archive CLI guard test passed in the focused
operations suite; final unit count is recorded in TASK-0016. Installed factory acceptance remains TASK-0008.
