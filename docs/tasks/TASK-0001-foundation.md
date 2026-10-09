# TASK-0001 — Installable app skeleton with real checks
- Status: IN_REVIEW
- Owner/agent: Codex
- Milestone: L1
- Related ADRs / docs: ADR 0001, 0002, 0003; `docs/architecture.md`
- Depends on: none
- Discovery status: ASSUMED (hosting and initial device/browser targets confirmed; Supabase region and exact Android model remain open)

## Goal
A signed-out shell that installs on Windows 11 Chrome and Android Chrome, backed by a local Supabase
project, with `typecheck`, `lint`, `test`, `build` doing real work in CI.

## User-facing acceptance criteria
- Opening the deployed URL on Android Chrome shows a designed install screen; after install it opens standalone.
- Windows 11 Chrome can install it as an app.
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
- React/Vite shell, Tailwind/shadcn configuration, React Router and TanStack Query providers are in place.
- `src/pwa` owns install, update and online/offline presentation. The cached shell makes no data or mutation claim.
- Supabase is configured only through the public URL/publishable-key variables. The generated empty migration
  establishes the CLI migration path; Auth, RLS and tables are deferred to TASK-0002.
- Cloudflare Pages deploys `dist`. The release archive now always packages the real build output.

## Validation evidence (exact command + result)
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — passed: 4 files, 16 tests.
- `pnpm build` — passed: Vite output plus generated PWA manifest and service worker.
- `pnpm exec supabase start` — blocked: Docker Desktop's `dockerDesktopLinuxEngine` is not running.
- Manual Windows 11 Chrome / Android Chrome installation, standalone launch, update and offline checks — pending deployed URL and physical devices.

## Docs updated
`docs/architecture.md`, `docs/style.md`, `docs/testing.md`, `docs/product.md`, `docs/open-questions.md`,
`docs/tasks/TASKS.md`, ADR 0006 and the foundation design spec.

## Follow-ups / risks
Docker Desktop must be running to validate the local Supabase stack. The hosted Supabase project URL/publishable
key, region and owner remain open. Device acceptance requires a Cloudflare Pages HTTPS deployment; no production
or real-factory connection is authorized.
