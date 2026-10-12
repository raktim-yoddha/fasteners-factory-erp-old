# ADR 0018 — Operations recovery and deployment gates

Builds on ADR 0003, ADR 0006, ADR 0013 and ADR 0017. Decided by the product owner, 2026-10-12.

## Context

The owner requested the remaining non-AI work together and delegated operational defaults. Software journeys pass,
but physical devices, verified factory settings, live deployment and an off-site backup policy have not been certified.
Database-only backups omit private Storage bytes. Documentation was paused during feature delivery and is now reconciled.

## Decision

Keep Cloudflare Pages and cloud Supabase. Use ordinary keyboard-wedge Code 39 input and browser printing; no camera,
device driver, paid hardware purchase or new backend. Add desktop and Android-touch browser acceptance profiles for
scanner Enter, record reload, print isolation and offline recovery. These are software checks, not OS installations.

Reuse the pinned Supabase CLI's Docker PostgreSQL tools for read-only backup/preflight operations. Nightly encrypted
exports include a PostgreSQL custom archive, every Storage object's bytes and original bucket/path manifest, each
hashed. AES-256-GCM authenticates the versioned compressed envelope with a separate random 32-byte runner key.
Refuse changed source fingerprints, missing objects, wrong project connections and over-capacity exports. No plaintext
is written by backup creation. An explicit unpack command writes only fixed/ordinal filenames into a new directory;
it never restores a live service. Capacity is explicitly bounded at 256 MiB and 50,000 files rather than silently truncated.

Default schedule: 03:30 Asia/Kolkata nightly, encrypted GitHub artifact retention 30 days, weekly local SAMPLE restore
proof. Live backup activates only when the owner configures the production-operations environment and repository flag.
Keys remain separate from the archive and must be retained outside GitHub for disaster recovery. No configuration
silently starts production traffic, provisions accounts, sends email, buys a plan or imports real factory records.

The read-only production gate requires exact migration versions, RLS, private buckets, an active administrator in every
company, closed signup, verified leaked-password protection, exact Auth origins, live delivery headers/assets, a recent
successful backup and dated factory/device/production-restore evidence. Missing evidence blocks completion.
Cloudflare headers protect scripts, framing and MIME handling while preserving Supabase connectivity and update recovery.

## Consequences

Automatic CI now runs actual restore regressions and operations checks, as well as database/browser tests. Recovery
tests decrypt the production-format backup, restore its database into an owned temporary local DB and verify private
file bytes. They never reset source data. Hosted service configuration, roles, extensions, credentials and Storage
re-upload require a separately verified production restore exercise; a local drill is not that exercise.
Auth/mail/hosting configuration and encryption-key custody are not database records and need separate recovery records.
Thirty days of exports can consume runner/artifact and egress capacity. A quiet export interval is necessary for the
strict consistency check; repeated failures must be investigated, not treated as backups. Larger factories must choose
a streaming/archive service or managed policy before exceeding these explicit limits.
