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

`pnpm e2e` uses Chromium against a **fresh disposable** hosted Supabase project and its deployed app URL. It requires
`E2E_BASE_URL`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_SERVICE_ROLE_KEY` and `E2E_TEST_EMAIL` as secret runner variables.
The service-role key stays in the Node test runner and is used only to generate the approved test user's magic link;
the browser carries only the authenticated session. The suite then drives SAMPLE data through first-company bootstrap,
master data, RFQ, feasibility, quotation, approval, sales order, receipt, QC release, reservation, packing and dispatch.

The suite intentionally skips when those variables are absent. It must not target a shared or production project:
bootstrap is correctly one-time, so each run needs a new migrated project or disposable database branch.

## Hosted database integration check

`tests/integration/hosted-manufacturing-path.sql` is a transaction-based companion for an empty hosted test project
or branch. It runs every protected factory command as a simulated authenticated SAMPLE operator, asserts dispatch,
the resulting zero lot balance, duplicate reservation and dispatch idempotency, rejected oversell, Order Command
Center state changes, and denial for an authenticated user without a company role, then rolls back. It never leaves
users, companies, lots or ledger entries behind.

## Manual L1 evidence

Before TASK-0001 is `DONE`, record the deployed Cloudflare Pages URL and test results for Windows 11 Chrome
and Android Chrome: installation, standalone launch, update prompt and offline cached-shell behavior.

## Fixtures and data

L1 contains no business records. Every later fixture is fictional and labelled `SAMPLE`; no real factory or
customer data enters automated tests.
