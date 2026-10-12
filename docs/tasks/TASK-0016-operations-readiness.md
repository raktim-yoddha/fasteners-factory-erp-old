# TASK-0016 — Deployment checks, encrypted backups and device software acceptance
- Status: DONE
- Owner/agent: Codex
- Milestone: L9 / operational preparation
- Related ADRs / docs: ADR 0018; deployment/testing/design/architecture
- Depends on: TASK-0015
- Discovery status: DESIGN PROPOSAL; owner-delegated defaults, SAMPLE verification only

## Goal
Deliver all remaining software operations preparation together, without inventing physical/live acceptance.
## User-facing acceptance criteria
One automatic gate verifies software and actual encrypted recovery. Fail-fast live preflight reports missing unsafe
schema/Auth/host/backup/evidence. Encrypted exports include DB and private bytes, reject changes/errors/oversize and keep
secrets/plaintext out of artifacts. Unpack is explicit, into a new directory, and never restores live services. Desktop
and Android-touch profiles exercise scan/Enter, record links, isolated print media and offline recovery. Docs agree with
current modules; physical/live fields remain pending. No AI, dependency or application backend is introduced.
## In scope
Reusable runner DB/fingerprint and encrypted archive helpers; read-only backup/preflight CLIs; nightly configured export,
weekly SAMPLE restore workflow, CI restore gate; Cloudflare headers; device E2E; documentation/task/ADR reconciliation.
## Out of scope
Purchases/paid plans, real operator/factory data, production deployment/cutover, fabricated installed-device evidence,
unattended production restore, tax documents/emails, AI.
## Planned files/modules
scripts/{backup-format,operations-db,create-backup,read-backup,check-operations,operations.test,test-restore,test-factory}.mjs;
package.json; public/_headers; .github/workflows/{ci,operations}.yml; .gitignore; tests/e2e/device-acceptance.spec.ts;
docs/{deployment,testing,pilot-acceptance.example,design,architecture,domain-model,workflows,product,roadmap,security,style,user-manual,project-audit}; task records, ADR 0018 and related amendments, README.
## Data migration and authorization implications
No new migration; remote operations read through runner-only DB/Storage/Management credentials. Strict project/connection
match. No browser credential or new business permission. Ciphertext publication only; keys have separate custody.
## Test cases (happy, failure, concurrency as relevant)
Binary roundtrip, random ciphertext, tamper/wrong key, duplicate entries; actual private downloads/hash metadata,
changed source/missing files; project/pool mismatch; RLS/buckets/admin/migration holds; exact Auth redirects/signup/HIBP;
missing/stale factory/device evidence; Cloudflare headers; both real browser profiles; all existing gate regressions.
## Implementation notes
Defaults: Cloudflare Pages/cloud Supabase; keyboard-wedge Code 39/browser printing; nightly 03:30 Asia/Kolkata, 30-day
encrypted artifacts, weekly local restore. Live schedule is installed but inactive until operations secrets/flag exist.
Backup limit 256 MiB/50,000 objects fails explicitly; quiet interval required. Production config/key custody are separate.
## Validation evidence (exact command + result)
Focused `pnpm test:restore` PASS (114 tables, 88 physical files, 88 portable private objects, 15 restored SQL suites; 15.0s).
`pnpm check:operations --local` PASS. `pnpm test:devices` equivalent focused local Playwright command PASS (2 tests, 11.7s).
Final `pnpm test:factory` PASS (131.4s): types/lint, 186 tests/62 files, all 15 rollback scripts, local operations checks,
production build/chunk verification, 20 browser journeys, encrypted archive download/decryption and restored regressions;
114 tables and 93 private objects/files compared. Additional CLI guard test: focused operations suite PASS (10 tests).
Actual `pnpm backup:create --local` and `pnpm backup:verify --file <SAMPLE archive>` PASS: 93 private objects, authenticated
database archive, 1,523,887 encrypted bytes. This test used an ephemeral key and removed only its own encrypted artifact.
`git diff --check` PASS; contract/ADR shape PASS. `pnpm test` PASS after the CLI guard addition: 187 tests/62 files. `pnpm lint` PASS. Contract files remain byte-identical. Cloudflare HTML cache headers are scoped separately from immutable assets to avoid merged contradictory directives.
## Docs updated
Current README and product/design/architecture/domain/workflows/style/manual/security/testing/deployment/audit/roadmap;
ADR 0018, amendments to ADR 0013/0015/0016/0017, task board and reconciled delivery evidence.
## Follow-ups / risks
Live project/URL/credentials, secret/key custody/schedule activation, leaked-password protection and actual hosted/device/
factory acceptance remain external setup. No sample or emulator result is recorded as production readiness.
