# Automated verification

Rules live in `AGENTS.md`. All business fixtures are fictional SAMPLE data. No manual UI inspection is needed to decide whether a software test passes.

| Command | Executes |
|---|---|
| `pnpm test:factory` | Local Docker stack, pending migrations, safe SAMPLE setup, types, lint, unit/component tests, 15 rollback SQL suites, operations checks, production-build browser journeys, encrypted recovery proof |
| `pnpm test` | Behavioral units/components plus contract, migration-structure and release checks |
| `pnpm test:db` | The 15 transaction/permission/concurrency suites listed once in `scripts/database-regressions.mjs`; each rolls back |
| `pnpm e2e` | Authenticated production-preview journeys; fresh build and static chunk-cycle validation |
| `pnpm test:devices` | Windows desktop and Android-touch software profiles: scanner Enter, durable record links, label print isolation, offline reload and reconnect |
| `pnpm test:restore` | Download private objects, encrypt/decrypt/hash-check the portable backup, restore into an owned temporary database, compare 114 tables and physical Storage files, rerun all 15 SQL regressions |
| `pnpm check:operations --local` | Read-only RLS, bucket, administrator and source-migration checks against the local stack |
| `pnpm check:operations` | Configured production preflight; missing credentials, recent backup or dated device/factory evidence fail |
| `pnpm build` | Static PWA assets, PNG/SVG icons, manifest, service worker and Cloudflare headers |

Run the full routine gate with Docker available: `pnpm test:factory`. It preserves existing local records and restores the caller's E2E configuration even on failure. It never resets a DB or provisions real accounts. Cold image/browser setup adds time; install Chromium once with `pnpm exec playwright install chromium`.

## Diagnostics and isolation

Browser tests use three local workers or two hosted workers, no retries, no skipped tests and no fixed sleeps. Local command timeouts are eight seconds; hosted latency has a separately bounded timeout. JSON results are in `test-results/results.json`, traces and assertion contexts in `test-results/`, and the HTML report in `playwright-report/`. Check logs first. Reports and encrypted backup directories are ignored; credential files are never uploaded.

CI provisions local Postgres, Auth, gateway, REST and Storage using the pinned CLI. Storage is necessary for real private drawing/certificate uploads and byte recovery. Realtime, analytics, Studio, image proxy and Edge Functions are excluded. CI runs rollback SQL, browser journeys, operations checks and actual restore proof. A weekly Operations recovery workflow repeats the SAMPLE restore drill; its separate nightly live-export job requires explicitly configured production-operations secrets.

The final full factory gate passed on 2026-10-12: 186 tests in 62 files, 15 rollback SQL suites, 20 browser journeys,
operations checks and encrypted restore, 131.4 seconds. Recovery compared 114 tables and 93 private files/objects.
The final standalone `pnpm test` passed 187 checks in 62 files after adding the CLI extraction/overwrite guard; lint also passed. Exact evidence is in TASK-0016. Counts reflect the current accumulated SAMPLE fixtures; no skip/retry/manual result is counted as a pass.

## Hosted SAMPLE mode

Use an isolated test project only. Ignored runner variables: `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY`, `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `E2E_ALLOW_SAMPLE_WRITES=1`. Optional `E2E_BASE_URL` points to the test deployment. Magic-link mode substitutes runner-only `E2E_SUPABASE_SERVICE_ROLE_KEY` for the password and generates/verifies a link without sending email. The browser receives only the session.

Missing credentials or a visible non-SAMPLE company is an error. Never point these writing journeys at production. Hosted SQL uses `E2E_DATABASE_PROJECT_REF` and runner-only `SUPABASE_ACCESS_TOKEN`; ordinary `test:factory` forces local SQL. All 15 hosted rollback suites and the six most recent hosted browser journeys passed on 2026-10-12 against the approved SAMPLE project.

## Acceptance boundaries

Viewport checks cover 320, 375, 412, 768, 1024 and 1440 CSS pixels. Device profiles add touch, Android user agent, display-mode emulation, actual service-worker offline reload and print media. They do not certify OS installation, scanner optics, Bluetooth/USB compatibility, printer sizing or a factory's SOP. Physical acceptance evidence belongs in the ignored pilot acceptance record, not a fake passing automated test. The production gate rejects pending evidence.

SQL-text assertions are structural guards, not integration proof. Actual rollback transactions verify permissions, exact quantities, invalid transitions, revision checks, idempotency and competing allocations. Restoration checks recoverability, not just archive creation.
