# Fasteners Factory ERP

An authenticated, installable operations ERP for a fastener or precision-component factory. It is a React PWA with Supabase as its complete backend, designed for Windows 11 Chrome and Android Chrome first.

> **Project status:** the L1–L3 vertical slice is implemented with fictional `SAMPLE` data and automated checks. It is not yet approved for a live factory rollout. Real operating procedures, customers, rates, machines, quality plans, and tax documents are deliberately out of scope until factory discovery verifies them.

## What it does today

The implemented MVP demonstrates a protected, end-to-end finished-goods order path:

1. Approved user signs in with a passwordless link.
2. The first administrator creates the first company and plant once.
3. Users create customer, supplier, item, drawing, warehouse, location, and work-centre records.
4. Sales creates an RFQ, records feasibility, creates and approves a quotation, and accepts it as a sales order.
5. Stores receives a held finished-goods lot, Quality releases it, and Stores reserves it against the order.
6. Dispatch prepares a packing shipment and posts the final dispatch.

The UI also includes a company-scoped dashboard, Order Command Center, and global identifier search. All demo records are explicitly marked `SAMPLE`.

### Deliberate MVP boundaries

| Included | Not included yet |
| --- | --- |
| Hosted Supabase Auth, PostgreSQL, RLS, private storage boundary, audit trail | Local/offline Supabase as a production backend |
| Windows 11 Chrome and Android Chrome installed PWA | iOS, Electron, React Native |
| Existing finished-goods receipt, QC release, reservation, packing, dispatch | MRP, purchasing, job cards, WIP, full QC/NCR, subcontracting |
| Passwordless access for administrator-created users | Public sign-up, real customer/factory data |
| English UI | Other languages |
| Automated Chromium E2E with fictional data | Camera, barcode scanner, Bluetooth/USB hardware, printer integrations |
| AI-ready future boundary | AI features; these begin no earlier than L8 |

The planned 16-stage factory backbone is a **DESIGN PROPOSAL**, not a claim about a specific factory’s SOP. See [the product brief](FASTENER_ERP_MASTER_BRIEF.md) and [open discovery questions](docs/open-questions.md).

## Architecture

```text
Installed PWA (Windows Chrome / Android Chrome)
                  |
                  | HTTPS + Supabase session
                  v
Cloudflare Pages static host ───────> Supabase Auth
                                      Supabase PostgreSQL + RLS + RPC commands
                                      Private Storage / Realtime where justified
```

- **Frontend:** React, Vite, TypeScript (strict), Tailwind CSS, React Router, TanStack Query.
- **PWA:** `vite-plugin-pwa` / Workbox. The app shell and cached read screens may work offline; critical writes are online-only and never report success before Supabase confirms them.
- **Backend:** hosted Supabase only—PostgreSQL migrations, Auth, Row Level Security, RPC commands, private storage, and Realtime only where justified. There is no custom Node backend.
- **State:** server state stays in TanStack Query. Zustand is reserved for future truly global local UI state.
- **Data correctness:** money and measurements are stored as `NUMERIC`; stock is an append-only ledger; state changes run in server-side commands with authorization, revision, quantity, and idempotency checks.

More detail: [architecture](docs/architecture.md), [domain model](docs/domain-model.md), [security](docs/security.md), and [ADRs](adr/).

## Security and data rules

- Every exposed business table is protected by Supabase RLS and scoped by company/plant.
- Browser code receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Database passwords, service-role keys, SMTP credentials, and other secrets never belong in the repository or `VITE_*` variables.
- Permissions live in protected database tables; hiding a button is never authorization.
- Stock, QC release, quotation approval, reservation, packing, and dispatch run through protected transactional commands rather than multi-table browser writes.
- Ledger and audit corrections use reversal events rather than edits.
- Private files belong in private storage buckets. Do not add real personal, customer, factory, or financial data without owner approval.

## Repository layout

```text
src/
  app/             Application shell and workspace composition
  auth/            Session listener and passwordless sign-in screen
  features/        Company, master-data, sales, stock, dispatch, search, dashboard modules
  lib/             Supabase client and typed browser-facing helpers
  pwa/             Install, update, and network-status UI
supabase/
  migrations/      Ordered schema, RLS, function, and command migrations
tests/
  unit/            Component, utility, contract, and script tests
  integration/     Transactional hosted database command checks
  e2e/             Playwright manufacturing-path test
docs/              Product, architecture, security, deployment, testing, and task records
adr/               Architecture Decision Records
```

`AGENTS.md` is the engineering contract. `CLAUDE.md` must always be identical to it.

## Prerequisites

- Node.js 24
- pnpm 11.5.3 (`corepack enable` is recommended)
- A hosted Supabase project
- For deployment: a Cloudflare Pages project

No local Docker Supabase setup is required for the MVP. The included Supabase CLI configuration is retained for migration tooling and optional local inspection, not as the production backend.

## Local setup

```bash
pnpm install --frozen-lockfile
pnpm dev
```

On Windows PowerShell, create the local configuration with:

```powershell
Copy-Item .env.example .env
```

Set these public values in `.env` from **Supabase Dashboard → Connect**:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Apply the committed migrations to the intended Supabase project through the Supabase CLI or the connected Supabase workflow. Do not paste database passwords, service-role keys, or production credentials into `.env`, source files, test fixtures, or client build settings.

Before the first login, an owner must:

1. Create and confirm the initial approved user in Supabase Auth.
2. Configure the final app URL as Supabase Auth’s Site URL and allowed redirect URL.
3. Keep public sign-up disabled.
4. Let that approved user complete the one-time first-company bootstrap in the app.

Full hosted setup: [docs/deployment.md](docs/deployment.md).

## Commands and automated verification

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the Vite development server. |
| `pnpm typecheck` | Run strict TypeScript checks. |
| `pnpm lint` | Run ESLint. |
| `pnpm test` | Run unit, contract, and release-script tests. |
| `pnpm build` | Build the production PWA into `dist/`. |
| `pnpm e2e` | Run the full unattended Chromium manufacturing path. |
| `pnpm release next` | Preview the semver release calculated from commits. |

The E2E suite starts a production preview automatically and uses only fictional `SAMPLE` data. For a local automated run, place a disposable existing test account’s email and password in ignored `.env.e2e.local`:

```dotenv
E2E_TEST_EMAIL=
E2E_TEST_PASSWORD=
```

Never point E2E at production or a shared pilot tenant. The test creates records and the first-company bootstrap is intentionally one-time. Hosted CI uses a separate disposable project or database branch and a manual, secret-gated GitHub Actions workflow. See [docs/testing.md](docs/testing.md).

## Deploy to Cloudflare Pages

1. Connect this repository to Cloudflare Pages.
2. Use build command `pnpm build` and output directory `dist`.
3. Add only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as Pages environment variables.
4. Add the resulting Pages URL to Supabase Auth’s Site URL and redirect allow-list.
5. Verify sign-in, PWA installation, standalone launch, update prompt, and cached offline shell on one Windows Chrome device and one Android Chrome device.

Do not place a service-role key, database password, SMTP credential, or test password in Cloudflare Pages variables. Deployment details and the GitHub Actions E2E secret list are in [docs/deployment.md](docs/deployment.md).

## Product roadmap

| Milestone | Outcome |
| --- | --- |
| L0 | Factory discovery and clearly fictional demo data |
| L1 | PWA, cloud backend, Auth, roles, RLS, app shell, CI |
| L2 | Master data, revisions, search, audit, command-center foundation |
| L3 | RFQ-to-dispatch finished-goods vertical slice |
| L4 | Material operations, GRN, lot controls, barcode workflows |
| L5 | Manufacturing execution, work orders, job cards, WIP |
| L6 | Quality, NCR/rework, subcontracting, certificates |
| L7 | Dispatch hardening, traceability, operational reporting |
| L8 | Optional, backend-gated AI suggestions only |
| L9 | Evidence-driven extensions such as scheduling and integrations |

Read the [roadmap](docs/roadmap.md), [task board](docs/tasks/TASKS.md), and [open questions](docs/open-questions.md) before treating future capabilities as committed scope.

## Contributor rules

1. Read `AGENTS.md` before changing anything.
2. Keep `AGENTS.md` and `CLAUDE.md` byte-for-byte identical.
3. Work one documented vertical slice at a time; preserve `SAMPLE` labelling.
4. Use migrations for schema changes and ADRs for decisions that change architecture, contracts, dependencies, or user-visible behavior.
5. Run typecheck, lint, tests, and build before committing. Use Conventional Commits and do not bypass checks.
6. Never weaken RLS, expose secrets, mutate stock/audit truth directly, or replace server confirmation with optimistic success.

## Documentation index

- [Engineering contract](AGENTS.md)
- [Master product brief](FASTENER_ERP_MASTER_BRIEF.md)
- [Product scope](docs/product.md)
- [Architecture](docs/architecture.md)
- [Domain model](docs/domain-model.md)
- [Security](docs/security.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)
- [Roadmap](docs/roadmap.md)
- [Open questions](docs/open-questions.md)
- [Task board](docs/tasks/TASKS.md)
- [Architecture decisions](adr/)
