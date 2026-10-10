# Testing

Explains verification strategy; rules live in `AGENTS.md`.

## Automated checks

| Command | Evidence |
|---|---|
| `pnpm typecheck` | Strict TypeScript and import configuration compile. |
| `pnpm lint` | ESLint checks application, scripts and tests. |
| `pnpm test` | Vitest runs repository contract/release tests and focused UI tests. |
| `pnpm build` | Vite builds `dist` and generates the service worker/manifest. |

CI runs all four commands on Ubuntu. Unit tests use JSDOM only where a browser DOM is required; repository
scripts remain Node-environment tests. Command-error unit tests assert that known protected-command failures retain
their operator meaning while unknown backend details are never rendered.

## Hosted end-to-end suite

`pnpm e2e` runs Chromium automatically. Locally it starts or reuses the production preview and can sign in an existing
disposable `SAMPLE` test user with `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY`, `E2E_TEST_EMAIL` and
`E2E_TEST_PASSWORD` from ignored `.env` / `.env.e2e.local` files. Hosted CI continues to require
`E2E_BASE_URL`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_SERVICE_ROLE_KEY` and `E2E_TEST_EMAIL`; the service-role key stays
in the Node test runner and generates the approved test user's magic link. In both modes, the browser carries only an
authenticated session and drives SAMPLE data through first-company bootstrap, master data, RFQ, feasibility,
quotation, approval, sales order, receipt, QC release, two competing stock reservations, packing and dispatch. Exactly
one competing reservation succeeds; the other must receive a structured revision-conflict or insufficient-stock
failure, proving the server command cannot oversell under concurrent calls.

The suite intentionally skips when neither credential mode is configured. It must not target a shared or production
project: bootstrap is correctly one-time, so hosted CI needs a new migrated project or disposable database branch.
The manual `Hosted E2E` GitHub Actions workflow fails instead of skipping when the same four runner secrets are
absent, preventing a false-green deployment test.

## Hosted database integration check

`tests/integration/hosted-manufacturing-path.sql` is a transaction-based companion for an empty hosted test project
or branch. It generates its SAMPLE test identities per run, creates and approves SAMPLE BOM/routing revisions to prove immutable headers and draft-only children,
then runs every protected factory command as a simulated authenticated SAMPLE operator. It asserts dispatch, the
resulting zero lot balance, duplicate reservation and dispatch idempotency, rejected oversell, Order Command Center
state changes, an authorized caller's global-search result, and denial for an authenticated user without a company
role, then rolls back. It never leaves users, companies, engineering records, lots or ledger entries behind.

## Manual L1 evidence

Before TASK-0001 is `DONE`, record the deployed Cloudflare Pages URL and test results for Windows 11 Chrome
and Android Chrome: installation, standalone launch, update prompt and offline cached-shell behavior.

## Fixtures and data

L1 contains no business records. Every later fixture is fictional and labelled `SAMPLE`; no real factory or
customer data enters automated tests.
