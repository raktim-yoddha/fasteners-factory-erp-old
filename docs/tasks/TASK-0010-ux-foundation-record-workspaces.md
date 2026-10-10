# TASK-0010 — UX foundation and secure record workspaces
- Status: IN_REVIEW
- Owner/agent: Codex
- Milestone: L3
- Related ADRs / docs: ADR 0015; `docs/architecture.md`, `docs/testing.md`, `knowledge/FASTENERS_FACTORY_ERP_UX_FEATURE_ROADMAP.md`
- Depends on: TASK-0009
- Discovery status: DESIGN PROPOSAL

## Goal
Deliver UX-0 and UX-1 for the current MVP objects: visible online/offline state, documented keyboard discovery,
deep-linkable record workspaces, search-result navigation, linked-record context and permitted audit history.

## User-facing acceptance criteria
- `Ctrl/Cmd+K` focuses global search, `/` focuses it outside editable controls, and `Esc` clears an active search.
- The workspace exposes a keyboard-help dialog and explicit online/offline read-only status.
- Critical stock and dispatch writes are unavailable while offline and say why.
- A permitted global-search result opens a stable record URL and a record workspace in no more than two actions.
- The record workspace identifies source, state, last confirmation, related records and the next available workspace.
- Audit timeline entries appear only when existing RLS permits `audit_log` reads; unavailable attachments/certificates are stated rather than invented.
- No new browser write permission, RLS policy or privileged database function is introduced.

## In scope
Keyboard discovery, online availability state, record URLs for current search types, typed RLS-scoped record readers,
relationship links that use existing RLS, permitted audit timeline reads, component tests and E2E navigation proof.

## Out of scope
New workflow transitions, attachments/storage, certificates, fuzzy search, saved views, browser local drafts, report builder,
mobile bottom navigation, hardware, audit-history access beyond existing permissions and new database APIs.

## Planned files/modules
`src/app/App.tsx`, `src/app/AppShell.tsx`, `src/app/OperationsWorkspace.tsx`, `src/features/search/*`,
`src/features/records/*`, `src/features/stock/StockActionsPanel.tsx`, `src/features/dispatch/DispatchPanel.tsx`,
`src/pwa/*`, `src/styles.css`, focused unit/E2E tests, ADR, architecture/testing/task docs.

## Data migration and authorization implications
No migration. Browser readers use existing authenticated table grants and RLS; audit timeline uses the existing
`audit.read` policy. Search continues to run through the caller-RLS `search_company_records` RPC.

## Test cases (happy, failure, concurrency, AI-off as relevant)
- Keyboard shortcut focus/clear behavior and editable-control exclusions.
- Online/offline status and disabled critical actions.
- Search result opens the correct record URL.
- Permitted record load, not-found/forbidden-safe presentation, related record link, and timeline access state.
- Browser E2E creates a SAMPLE customer, opens it from search, verifies its durable route, and returns to operations
  before continuing the manufacturing path.

## Implementation notes
No command is invoked by a shortcut. A route deep-link is a read-only navigation surface and never changes active
company. Record-type mapping is a narrow client boundary over existing RLS-scoped tables.

## Validation evidence (exact command + result)
- `pnpm test` — 33 test files and 64 tests passed.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm build` — passed; Vite generated the PWA service worker and manifest. The existing bundle-size warning remains.
- `pnpm e2e` — 1 authenticated Chromium test passed against the configured disposable Supabase environment. It created
  SAMPLE master/commercial/stock/dispatch data, opened the generated customer through global search at its record URL,
  then completed the existing concurrent-reservation and dispatch proof.
- Physical installed-PWA checks on Windows 11 Chrome and Android Chrome are still required before this task can be
  marked `DONE`.

## Docs updated
`docs/style.md`, `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `docs/tasks/TASKS.md`, this task,
and ADR 0015.

## Follow-ups / risks
Current audit policy intentionally limits timeline visibility. Storage-backed attachments and certificate previews
remain a later, separately authorized slice.
