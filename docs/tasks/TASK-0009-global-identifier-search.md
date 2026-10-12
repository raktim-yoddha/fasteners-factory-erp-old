# TASK-0009 — Global identifier search
- Status: DONE
- Owner/agent: Codex
- Milestone: L2
- Related ADRs / docs: ADR 0014; `docs/product.md`, `docs/architecture.md`, `docs/security.md`
- Depends on: TASK-0004
- Discovery status: DESIGN PROPOSAL

## Goal
Let an authenticated operator find the current MVP's company-scoped identifiers without bypassing existing RLS.

## User-facing acceptance criteria
- A query returns only records the caller can already read in the active company.
- Results identify the record type and its primary identifier clearly.
- The search never exposes another company or silently changes the active company.

## In scope
Read-only normalized search for customer, supplier, item, drawing, RFQ, quotation, sales order, lot and shipment
identifiers, a short query input and result list, RLS/integration/browser coverage.

## Out of scope
Full-text/fuzzy ranking, document content, attachments, production/QC objects, saved searches and search-based edits.

## Planned files/modules
New Supabase migration, `src/features/search/*`, `src/app/AppShell.tsx`, `src/app/OperationsWorkspace.tsx`, hosted
integration and browser tests, ADR and product/security/testing/task documentation.

## Data migration and authorization implications
The RPC is `SECURITY INVOKER`, grants execution only to `authenticated`, and relies on each source table's existing
RLS. It returns an ID, a type label and a concise operator label only.

## Test cases (happy, failure, concurrency as relevant)
Unit tests assert the function is invoker-scoped, bounded and avoids public execution. Hosted tests assert an
authorized SAMPLE operator finds a company record while a user without membership receives no result. Browser E2E
uses a generated identifier after setup.

## Implementation notes
Queries shorter than two characters are rejected before database lookup; all core workflows are deterministic.

## Validation evidence (exact command + result)
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — passed: 30 files, 57 tests.
- `pnpm build` — passed: production PWA output and service worker generated.
- `pnpm e2e` — passed with the one hosted browser suite correctly skipped because isolated deployment secrets are not
  configured locally; the manual CI workflow fails rather than skips when those secrets are missing.
- `git diff --check` — passed.
- Hosted migration/RLS integration — passed 2026-10-10 through the connected hosted project. An authorized SAMPLE
  operator found the customer record; an authenticated user without membership received no result; the complete
  transaction rolled back. Privilege verification returned `anon_can_execute=false` and
  `authenticated_can_execute=true`.
- Supabase security advisor — reviewed 2026-10-10. It reports only the 12 existing, intentionally authenticated
  `SECURITY DEFINER` workflow commands; the search function is `SECURITY INVOKER` and not reported.

## Docs updated
`adr/0014-global-search-through-caller-rls.md`, `docs/product.md`, `docs/architecture.md`, `docs/security.md`,
`docs/testing.md`, `docs/tasks/TASKS.md` and this task file.

## Follow-ups / risks
The first version intentionally does not rank fuzzy matches or search uploaded drawing content.


## Reconciled validation (2026-10-12)
`pnpm test:factory` PASS: typecheck, lint, 186 tests/62 files, 15 rollback SQL suites, read-only operations checks,
production PWA build/chunk checks, 20 browser journeys, encrypted DB/private-object backup and restored-DB regressions;
131.4 seconds. Recovery compared 114 tables and 93 private files. Later archive CLI guard test passed in the focused
operations suite; final unit count is recorded in TASK-0016. Installed factory acceptance remains TASK-0008.
