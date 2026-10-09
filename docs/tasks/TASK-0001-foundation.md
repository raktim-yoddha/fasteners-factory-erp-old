# TASK-0001 — Installable app skeleton with real checks
- Status: TODO
- Owner/agent: unassigned
- Milestone: L1
- Related ADRs / docs: ADR 0001, 0002, 0003; `docs/architecture.md`
- Depends on: none
- Discovery status: ASSUMED (open questions Q1-Q4)

## Goal
A signed-out shell that installs on Windows (Edge/Chrome) and Android (Chrome), backed by a local Supabase
project, with `typecheck`, `lint`, `test`, `build` doing real work in CI.

## User-facing acceptance criteria
- Opening the deployed URL on Android Chrome shows a designed install screen; after install it opens standalone.
- Windows Edge/Chrome can install it as an app.
- Going offline shows an offline badge and the cached shell; no data action pretends to succeed.
- An update prompt appears when a new version is deployed.

## In scope
Vite + React + strict TypeScript, Tailwind + shadcn/ui base, React Router, TanStack Query, vite-plugin-pwa
(manifest, icons, update flow), Supabase CLI project with an empty migration, `.env.example`,
replacing the placeholder scripts in `package.json`, removing the "no dist yet" branch in `release.yml`,
first versions of `docs/style.md` and `docs/testing.md`.

## Out of scope
Auth, any business table, AI, push notifications.

## Planned files/modules
`package.json`, `vite.config.ts`, `index.html`, `src/app`, `src/pwa`, `src/lib`, `supabase/`, `tests/`,
`.github/workflows/*`.

## Data migration and authorization implications
None yet; the Supabase anon key may be in the client, the service-role key never.

## Test cases (happy, failure, concurrency, AI-off as relevant)
Unit: app renders. PWA installability audit. Manual: install on one Windows and one Android device.
AI-off: not applicable yet.

## Implementation notes
-

## Validation evidence (exact command + result)
To be filled in.

## Docs updated
To be filled in (`architecture.md` code layout, `style.md`, `testing.md`).

## Follow-ups / risks
Hosting choice (Q1) is needed to test install on a real HTTPS URL; use the host's preview URL until then.
