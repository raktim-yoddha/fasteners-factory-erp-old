# ADR 0019 — Separate solo SQLite and cloud team workspaces

Supersedes ADR 0003 for solo operation; retains its cloud-team network rules. Amends the backend scope of ADR 0002.
Decided by the product owner, 2026-10-12.

## Context

The owner requests a device-local SQLite solo ERP alongside the existing shared Supabase ERP. They explicitly chose
separate solo workspaces with optional cloud backup and an explicit move into team mode, rather than automatic
bidirectional synchronization. Current business invariants reside in PostgreSQL commands; changing storage alone
would bypass them. Existing team records and permission boundaries must remain intact.

## Decision

One PWA offers two explicit authorities. Solo data, documents, audit and exact decimal transactions live in SQLite
on the device through the official SQLite WASM worker and persistent OPFS. Local operation requires no Supabase
account or connection. There is no in-memory fallback that pretends to save. The worker serializes commands, commits
idempotent business/audit/ledger changes atomically and confirms only after commit. Browser/device ownership, rather
than Supabase RLS, is the solo trust boundary. Local evidence cannot claim an independent staff approval.

Team data remains authoritative in Supabase with its existing Auth/RLS/trusted command contracts. Offline team
critical writes stay blocked. Local workspaces are not offline copies of a team company; IDs, queries, routes, files
and caches remain isolated. Optional solo backup is explicitly initiated, encrypted and account-owned, distinct from
shared company records. Switching modes never silently uploads, merges or rewrites records.

Use the pinned official SQLite WASM dependency in a dedicated worker and its OPFS VFS. Serve the necessary COOP/COEP
headers and test actual Supabase CORS/auth operation under those headers. Restrict a solo workspace to one active tab
with a Web Lock; failure/unsupported storage is visible. Use TEXT decimal representation plus exact integer arithmetic,
not SQLite REAL or JS float arithmetic, for money/measurements. Keep approved definitions and event history immutable.
Local backup/export and restore validation are required because clearing browser/site data can remove the database.

Cross-role membership, independent staff reviews and shared reservations belong only to team mode. Solo actions
identify the device owner and never fabricate a second approver. The owner selected masters plus opening balances with readable archived solo history. The implementation specification requires preview/mapping, reconciliation of open work, QC-held cloud opening stock, a retained verified archive and an explicit confirmed cutover before freezing solo writes.

## Consequences

This is a persistence/domain migration, not a connection toggle. Existing presentation is reused through typed
repository boundaries; local transaction services must receive meaningful parity/rollback/idempotency tests before
their actions are exposed. The existing cloud suite remains a required compatibility gate. SQLite worker/WASM assets
must be precached for offline solo reload. Domain command errors retain existing structured codes where equivalent.
Schema/data upgrades are versioned, transactional and preserve records; failed restore/import never replaces a good
workspace. No production data is migrated or cloud project reset as part of development.
