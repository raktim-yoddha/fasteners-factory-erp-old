# TASK-0008 — MVP application surface and hardening
- Status: IN_PROGRESS
- Owner/agent: Codex
- Milestone: L3
- Related ADRs / docs: ADR 0003, ADR 0006, ADR 0007; `docs/product.md`; `docs/style.md`
- Depends on: TASK-0007
- Discovery status: DESIGN PROPOSAL

## Goal
Deliver an installed-PWA surface that safely connects approved users to ERP workflows on Windows Chrome and Android Chrome.

## User-facing acceptance criteria
- The app blocks operational access until a hosted Supabase backend is configured and a user is authenticated.
- Approved users can request a passwordless sign-in link; public self-registration is disabled.
- The operational surface is responsive, English-only and does not fabricate factory records.

## In scope
Supabase session gate, passwordless sign-in surface, responsive operations navigation, connection state and tests.

## Out of scope
Hosted project configuration, user invitations, real factory data, device installation validation and live data-query screens.

## Planned files/modules
`src/auth/*`, `src/app/*`, `src/features/dashboard/*`, `src/styles.css`, app test, ADR and product/style/task docs.

## Data migration and authorization implications
The browser requests a session only; public account creation remains disabled. Permissions continue to be database-owned.

## Test cases (happy, failure, concurrency, AI-off as relevant)
The app test asserts that an unconfigured backend cannot expose operations. Hosted sign-in requires the project and redirect URL.

## Implementation notes
The initial role-specific records are intentionally narrow until later workflow-detail queries are connected;
the Command Center reads RLS-scoped live summary counts after sign-in.

## Validation evidence (exact command + result)
`pnpm typecheck` (pass); `pnpm lint` (pass); `pnpm test` (11 files, 29 tests passed); `pnpm build` (pass); `git diff --check` (pass), run 2026-10-09.

## Docs updated
`adr/0007-passwordless-approved-user-sign-in.md`, `docs/product.md`, `docs/style.md`, `docs/architecture.md` and `docs/tasks/TASKS.md`.

## Follow-ups / risks
Hosted Supabase provisioning is blocked by the connector's unavailable cost-confirmation endpoint; browser/device acceptance must follow deployment.
