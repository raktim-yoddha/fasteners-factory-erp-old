# TASK-0002 — Tenant access, roles, RLS and audit foundation
- Status: IN_PROGRESS
- Owner/agent: Codex
- Milestone: L1
- Related ADRs / docs: ADR 0002, 0004; `docs/architecture.md`, `docs/security.md`, `docs/domain-model.md`
- Depends on: TASK-0001
- Discovery status: DESIGN PROPOSAL (authentication method remains open)

## Goal
Create the tenant-scoped database authorization foundation required before exposing business records.

## User-facing acceptance criteria
- An authenticated person can only read their own profile and rows from a company where they are active.
- Protected permissions come from database role assignments, never editable user metadata.
- An unauthorized API caller cannot read membership, plant or audit data from another company.

## In scope
Companies, plants, profiles, memberships, multi-role permission mapping, an append-only audit base, indexes,
RLS policies and security helper functions. A trigger creates a neutral profile when Supabase Auth creates a user.

## Out of scope
Choosing an email/password, magic-link or SSO user experience; inviting users; business entities; audit event
producers; hosted deployment until the Supabase project connector can create a project.

## Planned files/modules
`supabase/migrations/20261009172217_auth_rbac_audit.sql`, `docs/domain-model.md`, `docs/security.md`,
`docs/architecture.md`, `tests/unit/auth-schema.test.mjs`, `docs/tasks/TASKS.md`.

## Data migration and authorization implications
This creates all L1 authorization tables and enables RLS on each exposed table. There is intentionally no browser
bootstrap or service-role key. An eventual trusted admin bootstrap command must create the first company and admin.

## Test cases (happy, failure, concurrency, AI-off as relevant)
Static schema test: every public table has RLS, helper functions are private and `PUBLIC` execution is revoked.
Hosted integration: pending a created Supabase project; prove cross-company denial with two users.

## Implementation notes
Uses `TO authenticated`, `(select auth.uid())`, indexes for policy predicates, and private `SECURITY DEFINER`
helpers with explicit execute grants.

## Validation evidence (exact command + result)
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — passed: 5 files, 18 tests, including static RLS boundary assertions.
- `pnpm build` — passed: production PWA build generated.
- Hosted migration/RLS integration — pending Supabase project creation; the connector's cost-confirmation endpoint remains unavailable.

## Docs updated
`docs/domain-model.md`, `docs/security.md`, `docs/architecture.md`, `docs/tasks/TASKS.md` and this task file.

## Follow-ups / risks
The connected Supabase plugin lists the organization but its project-cost confirmation endpoint is unavailable,
blocking hosted migration execution.
