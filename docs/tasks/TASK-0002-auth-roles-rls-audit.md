# TASK-0002 — Tenant access, roles, RLS and audit foundation
- Status: IN_REVIEW
- Owner/agent: Codex
- Milestone: L1
- Related ADRs / docs: ADR 0002, 0004; `docs/architecture.md`, `docs/security.md`, `docs/domain-model.md`
- Depends on: TASK-0001
- Discovery status: DESIGN PROPOSAL

## Goal
Create the tenant-scoped database authorization foundation required before exposing business records.

## User-facing acceptance criteria
- An authenticated person can only read their own profile and rows from a company where they are active.
- Protected permissions come from database role assignments, never editable user metadata.
- An unauthorized API caller cannot read membership, plant or audit data from another company.

## In scope
Companies, plants, profiles, memberships, multi-role permission mapping, an append-only audit base, indexes,
RLS policies and security helper functions. A trigger creates a neutral profile when Supabase Auth creates a user.
The one-time first-company bootstrap creates the initial tenant, plant and caller administrator role.

## Out of scope
Inviting users, alternative identity providers, business entities, audit event producers and production deployment.

## Planned files/modules
`supabase/migrations/20261009172217_auth_rbac_audit.sql`, `supabase/migrations/20261009175817_initial_company_bootstrap.sql`, `docs/domain-model.md`, `docs/security.md`,
`docs/architecture.md`, `tests/unit/auth-schema.test.mjs`, `docs/tasks/TASKS.md`.

## Data migration and authorization implications
This creates all L1 authorization tables and enables RLS on each exposed table. There is no service-role key in the
browser. A restricted bootstrap command creates the first company and admin once; it rejects after that.

## Test cases (happy, failure, concurrency as relevant)
Static schema test: every public table has RLS, helper functions are private and `PUBLIC` execution is revoked.
Hosted/local rollback integration proves cross-company and inactive-member denial with isolated transaction fixtures.

## Implementation notes
Uses `TO authenticated`, `(select auth.uid())`, indexes for policy predicates, and private `SECURITY DEFINER`
helpers with explicit execute grants.

## Validation evidence (exact command + result)
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — passed: 31 files, 58 tests, including static RLS boundary assertions.
- `pnpm build` — passed: production PWA build generated.
- Hosted browser integration — passed 2026-10-10 against the connected Supabase project with a disposable SAMPLE
  account. The sign-in session, active-company scope and protected workflow commands completed through dispatch.

## Docs updated
`adr/0012-initial-tenant-bootstrap.md`, `docs/domain-model.md`, `docs/security.md`, `docs/architecture.md`, `docs/tasks/TASKS.md` and this task file.

## Follow-ups / risks
Cross-company/inactive-member denial is exercised by executable rollback fixtures without destructive resets. Real account/access review remains deployment acceptance.


## Reconciled validation (2026-10-12)
`pnpm test:factory` PASS: typecheck, lint, 186 tests/62 files, 15 rollback SQL suites, read-only operations checks,
production PWA build/chunk checks, 20 browser journeys, encrypted DB/private-object backup and restored-DB regressions;
131.4 seconds. Recovery compared 114 tables and 93 private files. Later archive CLI guard test passed in the focused
operations suite; final unit count is recorded in TASK-0016. Installed factory acceptance remains TASK-0008.
