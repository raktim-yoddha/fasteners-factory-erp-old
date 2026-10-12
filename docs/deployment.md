# Deployment and recovery

Implemented setup tooling; live rollout remains **OPEN QUESTION** until the configured target and factory/device evidence pass. Rules live in `AGENTS.md`; defaults are recorded in ADR 0018.

## Static host and Auth

Use Cloudflare Pages: `pnpm build`, output `dist`, Node 24 and the pinned pnpm version. Build variables contain only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Publish the existing static PWA; no Node server is required. Cloudflare's SPA fallback serves durable record routes when there is no top-level 404 page. `public/_headers` supplies CSP, no framing, no MIME sniffing, no referrer, immutable hashed assets and revalidated service worker/manifest. These headers apply on Pages, not Vite preview.

The owner configures the final HTTPS origin as Supabase Auth Site URL and the exact redirect allow-list. Public signup stays disabled. Create/approve operator Auth accounts outside the browser; Administration then assigns company access and roles to existing account IDs. Keep an active administrator in every company. Review actual roles before a factory pilot; no SAMPLE account belongs in production. Enable hosted leaked-password protection; its existing disabled setting is not repaired by source changes.

Backend migration deployment and real company/account provisioning use an explicitly chosen production project. Do not treat the existing SAMPLE project as production by renaming its records. No production deployment, real email or paid plan was performed by this task.

## Read-only deployment gate

`pnpm check:operations --local` checks the local SAMPLE schema. For the live gate, set runner-only values:

- `ERP_PROJECT_REF`, `ERP_DATABASE_URL` (matching direct or session-pool PostgreSQL URL on port 5432), `ERP_DEPLOY_URL` (HTTPS origin).
- `SUPABASE_ACCESS_TOKEN` for read-only Management API Auth-config verification.
- `ERP_BACKUP_ENABLED=true`, `ERP_LAST_BACKUP_AT` from the last successful encrypted export.
- `ERP_ACCEPTANCE_FILE`: ignored dated owner evidence; start from `docs/pilot-acceptance.example.json`.

Run `pnpm check:operations`. It reports holds and exits nonzero on missing evidence, RLS, private buckets, any company's missing admin, migration-history mismatch, open signup, unverified leaked-password protection, wrong/wildcard redirects, missing host assets/routes/headers or stale backup. Evidence needs a reviewer, date and actual log reference for factory configuration, Windows install, Android install, scanner/printer and production restoration. No sample placeholder counts as verification. The gate reads; it does not change production.

## Encrypted nightly export

The Operations recovery workflow exports nightly at 03:30 Asia/Kolkata and keeps encrypted artifacts for 30 days. Enable `ERP_BACKUP_ENABLED=true` as a repository variable only after configuring the **production-operations** GitHub environment:

| Kind | Name | Purpose |
|---|---|---|
| Variable | `ERP_PROJECT_REF`, `ERP_SUPABASE_URL` | Exact matching project reference/API URL |
| Secret | `ERP_DATABASE_URL` | Privileged read connection; direct or session pool, not transaction pool |
| Secret | `ERP_STORAGE_SERVICE_KEY` | Runner-only private-object download credential |
| Secret | `ERP_BACKUP_KEY` | Base64 random 32-byte encryption key, retained separately offline |

Run `pnpm backup:create` locally in a secure operator environment, or dispatch Operations recovery after secrets are installed. Docker uses the existing pinned CLI's database container tools; it receives the remote password through environment, not command arguments. A full PostgreSQL custom archive and all Storage objects are collected. The encrypted manifest retains original bucket/path, size, SHA-256 and DB fingerprints. Source changes during export, missing/corrupt files, over 50,000 objects or over 256 MiB fail without publishing a partial backup. Choose a quiet window and investigate failed runs. Upgrade backup capacity before exceeding that explicit bound.

The exporter writes only authenticated AES-256-GCM `.fferp` files under ignored `backups/`. Only those files are uploaded. The key is not in the artifact, manifest or logs. Keep copies of the key and recovery instructions outside this GitHub account; lost keys make archives unrecoverable. GitHub retention is not legal document retention. Billing/egress/artifact limits and ownership remain owner configuration.

For local SAMPLE-only export use `pnpm backup:create --local` with an operator-generated key and local status file. Validate an archive using `pnpm backup:verify --file backups/<archive>.fferp`. An explicit `--extract <new-directory>` unpacks sensitive plaintext into an exclusively new directory. Outputs are `database.dump`, `manifest.json` and ordinal `object-N` files; original file paths never control filesystem writes. This command does not restore a database or upload objects.

## Recovery

`pnpm test:restore` is fully automatic and non-destructive: actual private downloads, encrypted-envelope authentication, temp DB restore, exact record/RLS/policy comparison, source-unchanged comparison, local private-file SHA-256 comparison and all 15 rollback suites. CI runs it on each PR and weekly. A successful local drill demonstrates software recovery against SAMPLE data.

Production recovery needs a new compatible isolated target, its roles/extensions/settings, a verified archive/key, restore of the DB, and re-upload of ordinal files to their manifest bucket/path with private bucket policies retained. Compare fingerprints/file hashes, permissions, pinned revisions and business balances before cutover. Never restore over the live database as an unattended scheduled action. Validate this complete hosted procedure separately; the source backup does not contain Auth delivery/redirect settings, host configuration, custom-role passwords or encryption-key custody.

Supabase managed database backup retention depends on plan and excludes Storage object bytes; do not represent it as a file backup. See [official backup scope](https://supabase.com/docs/guides/platform/backups). Optional managed daily/PITR configuration is an owner plan choice, not automatically purchased here.

## Pilot configuration and devices

The chosen software baseline is Windows 11 Chrome and Android Chrome, keyboard-wedge Code 39 input ending in Enter, and browser printing of the existing lot/package sheet. No hardware is purchased or assumed tested. Configure actual items/base units, measured alternate-unit evidence, customer parts, immutable engineering, warehouses, shifts, maintenance/calibration evidence, QC criteria and document/accounting ownership before adding real records.

Run `pnpm test:factory` and `pnpm test:devices` against SAMPLE first. Install from the real HTTPS origin on each physical device, verify standalone launch/update/reload, scan a printed supported code, verify the exact current record, and confirm the selected printer's size/quiet zones/readability. Record physical evidence separately. Automated logs remain authoritative for software test failures; emulation does not replace hardware evidence.
