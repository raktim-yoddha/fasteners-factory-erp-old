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
Supabase session gate, passwordless sign-in surface, first-company bootstrap, responsive operations navigation, explicit company selection, master-data and stock setup, company-scoped summary reads, the read-only Order Command Center, commercial, reservation, packing and dispatch controls, unit and hosted-E2E coverage.

## Out of scope
Hosted project configuration, user invitations, real factory data, device installation validation and live data-query screens.

## Planned files/modules
`src/auth/*`, `src/app/*`, `src/features/*`, `src/lib/commandError.ts`, `supabase/config.toml`, the command-center
migration, app/integration tests, ADR and product/style/task docs.

## Data migration and authorization implications
The browser requests a session only; public account creation remains disabled. Permissions continue to be database-owned.

## Test cases (happy, failure, concurrency, AI-off as relevant)
The app test asserts that an unconfigured backend cannot expose operations. Unit tests cover protected-command error
translation without exposing unknown server details. The hosted Playwright manufacturing path exercises passwordless
sign-in, bootstrap, master data, commercial, stock and dispatch commands using SAMPLE data; it requires a freshly
migrated disposable project and approved test user.

The `Hosted E2E` GitHub Actions workflow is manual and secret-gated so the normal CI cannot accidentally point the
browser suite at a shared tenant.

## Implementation notes
The Command Center reads RLS-scoped live summary counts after sign-in. Browser forms only invoke guarded commands;
they read current revisions immediately before approval, reservation, preparation and dispatch.

## Validation evidence (exact command + result)
`pnpm typecheck` (pass); `pnpm lint` (pass); `pnpm test` (28 files, 54 tests passed); `pnpm e2e` (suite loads and
correctly skips without required hosted E2E secrets); `pnpm build` (pass); `git diff --check` (pass), run 2026-10-10.

Hosted database validation on 2026-10-10: ran `tests/integration/hosted-manufacturing-path.sql` through the
connected Supabase project. The command path completed and rolled back, including Order Command Center states before
reservation, after reservation and after dispatch; an unauthorized quotation approval; idempotent reservation and
dispatch retries; and a rejected oversell after a current revision read. A follow-up count confirmed zero Auth,
company, order, shipment and ledger rows remained. The new command is unavailable to `anon` and callable by
`authenticated` only.

## Docs updated
`adr/0004-domain-integrity.md`, `adr/0007-passwordless-approved-user-sign-in.md`, `adr/0012-initial-tenant-bootstrap.md`, `adr/0013-hosted-end-to-end-verification.md`, `docs/architecture.md`, `docs/domain-model.md`, `docs/security.md`, `docs/testing.md`, `docs/deployment.md` and this task record.

## Follow-ups / risks
The hosted Supabase project is ready for an administrator-created approved user. Browser/device acceptance and
unskipped E2E still require a Cloudflare Pages deployment plus its Auth redirect URL.
