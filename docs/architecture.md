# Architecture

Explains structure; rules live in `AGENTS.md`; decisions in `adr/0002`-`0005`. Update this file in the same
change as any module, schema, API or runtime change.

## Runtime (MVP, Plan A)
```mermaid
flowchart TB
  subgraph Devices
    W[Windows installed PWA]
    A[Android installed PWA]
  end
  W & A -->|HTTPS| H[Static PWA host]
  W & A -->|HTTPS + JWT| S[Hosted Supabase]
  S --> AUTH[Auth]
  S --> DB[(PostgreSQL + RLS)]
  S --> ST[Private Storage]
  S --> EF[Edge Functions]
  DB --> Q[Outbox / Queues / Cron]
  EF -.->|L8 only, flagged| AI[AI provider]
```
Factory Wi-Fi only needs to reach the internet. Why cloud and not a factory LAN server, and when to
revisit: `adr/0003-installed-pwa-cloud-first-network.md`.

The static PWA deploys to Cloudflare Pages (`pnpm build` → `dist`) and Supabase is the complete backend.
Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are browser configuration; service-role
keys and database passwords remain server-side. See ADR 0006.

## Code layout
`src/app` owns providers, routes and the shell; `src/pwa` owns install, update and network-status UI;
`src/lib` owns the Supabase client boundary; `src/components/ui` is reserved for shadcn/ui primitives;
future features live in `src/features/<module>`. `supabase/migrations` holds CLI-generated migrations;
`tests/{unit,integration,e2e,fixtures}` separates verification by scope.

## Layers
Screen components -> feature hooks (TanStack Query) -> typed API wrappers in `src/lib` -> Supabase.
Reads are RLS-scoped queries. Writes that change business state go through named commands
(`reserveMaterial`, `issueMaterial`, `recordProductionOutput`, `submitInspection`, `releaseFinishedGoods`,
`verifyPacking`, `confirmDispatch`; brief G4), each atomic, idempotent and audited.

## Data
Domains and table sketch: brief G3 (names are not final). Key shapes: company/plant scoping on every row,
versioned BOM/routing/drawings, append-only `stock_ledger_entries`, `lot_genealogy`, `audit_log`,
`domain_outbox`, `idempotency_keys`. The ERD goes into `docs/domain-model.md` when L2 starts.

L1 now defines the authorization root: `companies`, `plants`, `profiles`, `company_memberships`,
`user_company_roles`, role-to-permission mappings and `audit_log`. RLS uses private security-definer helpers;
business tables and transactional commands are added only after this base is applied and integration-tested.

## Environments
Local Supabase (CLI + Docker) for development and migration tests; one hosted project for the pilot.
Secrets only in Supabase/GitHub secrets, never in the repo. Region and plan: open questions Q1-Q2.

## Trust boundaries
Browser (untrusted) -> Supabase Auth JWT -> RLS and commands (trusted). Service-role key only inside Edge
Functions. AI provider is a further boundary, absent until L8.
