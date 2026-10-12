# Separate solo SQLite and cloud team workspaces

Approved direction: the owner's 2026-10-12 request and selected separate-workspace option. **DESIGN PROPOSAL** for generic
factory configuration; the authority split is an owner decision. ADR 0019 changes architecture, not prior factory SOP.

## Acceptance

Solo opens without cloud configuration or Auth, stores its complete applicable single-owner business data/documents
in real persistent device SQLite, and remains usable offline after initial installation. Success requires a committed
local transaction. Cloud team retains all existing Auth/RLS/multi-role/online command behavior and records. Switching
modes does not leak query data, create cloud copies or consume team stock. Each mode clearly states its authority.

Optional encrypted backup stores a solo snapshot under the authenticated account, not in company workflow tables.
Migration into team mode is explicit, previewed and validated through trusted server commands. No automatic sync.
Independent-review actions and staff administration remain team-only. No fake reviewer or cloud approval is inserted.

## Boundaries

UI panels remain presentational. A mode owner selects a repository/identity/capability set. The cloud adapter keeps
existing Supabase transport. The local adapter dispatches bounded structured messages to a dedicated SQLite worker;
the UI cannot send arbitrary SQL. Worker domain services own validation, exact calculations, revisions, immutable
versions, signed movements, atomic idempotency and audit. Read models use the same typed shapes as existing panels.

Store exact decimals as TEXT and calculate with scaled integers. SQLite foreign keys, uniqueness and append-only
triggers enforce the final local record constraints. Keep company/workspace identity explicit even for one owner.
Private document bytes stay inside the snapshot's device storage boundary. Browser clearing/eviction is not a backup;
request durable storage and show backup/recovery state. Unsupported persistence fails visibly without a RAM fallback.

## SQLite runtime

Pinned official `@sqlite.org/sqlite-wasm`; OPFS database inside a dedicated worker, Web Lock for one active solo tab,
serial message processing and explicit commit/rollback. Normal OPFS VFS is selected because the currently published
SAH-pool release lacks the later preserve-on-initialization-failure option. Required cross-origin isolation headers
are applied on production and preview and verified against actual cloud journeys. WASM/worker assets join precache.

## Preservation and rollout

Expand first: add mode/repository boundaries, real local schema/transactions and automated local tests. Port applicable
single-owner features one coherent workflow at a time while preserving the team path. Expose each local action only
with its actual domain guards and confirmation. Do not present an unfinished local feature as available. Existing
records never move on upgrade or mode switch. Rollback can select team mode while retaining the solo database/export.

The owner chose masters plus opening balances with readable solo history. A move preview includes verified
customers/suppliers/items and explicitly mapped locations/base units, measured conversion/specification references
where supported, and actual closing stock quantities. Opening balances enter cloud QC hold. Use the existing controlled
import validation path; do not seed released/QC-passed stock or import local staff approvals. Existing company records
are never overwritten. The target must be authorized and compatible; duplicate codes and missing mappings are blockers.

Complete/reconcile open solo orders, jobs, vendor custody, reservations and NCRs before finalizing cutover. Show every
blocker and export a verified full solo archive first. Local historical engineering/transactions/files remain readable
with device provenance, distinct from new cloud operational records. A recorded cutover receipt links source snapshot
hash, import reconciliation and target company. Freeze that solo workspace read-only only after the cloud confirms the
final committed import. Failed/offline/retried promotion preserves the source; partial batches do not count as a move.
Rollback before confirmation keeps solo authoritative. After cloud operations begin, no silent switch resumes writing
the old solo ledger; a return to solo would be a separately reviewed new cutover.

## Validation

Exact large/fractional arithmetic; failed transactions leave no partial records/audit; changed retries conflict;
stale revisions fail; units, stock/QC, engineering immutability and production close gates are enforced. Use actual
SQLite for local logic tests and actual OPFS in desktop/Android browser tests. Exercise persistence across reload,
offline writes/reload, second-tab lock, mode isolation, backup corruption/wrong key and restore recovery. Existing
full team gate must remain green; no manual UI result substitutes for automated proof.


## Local scope and capabilities

Applicable single-owner operations cover the existing master/reference, commercial, purchasing, stock, production,
inspection/NCR, vendor, package/dispatch/return, reports, equipment/capacity, private-document and controlled-transfer
features. The local repository must enforce the equivalent domain guards; SQL syntax cannot be copied from PostgreSQL
into SQLite. Staff invitation/membership/role administration and genuinely independent reviewer actions are cloud-only.
A local owner can record their own ordinary commercial/QC decisions with local provenance; no fake independent identity
is created. Independent count review retains its team-only requirement rather than automatically approving oneself.

Mode selection is explicit: Solo on this device / Team online. The solo header states Device SQLite and saved locally;
the team header states Supabase and server confirmation. Local operation never silently redirects a command to cloud
because a feature is incomplete. Unvalidated commands remain disabled with a clear capability reason during rollout.
Changing workspace resets queries/forms/routes and releases the previous worker/lock; saved records remain intact.

## Optional backup and restore

Solo export is a versioned encrypted portable SQLite snapshot including document bytes, workspace identity, schema
version and entry hashes. Retain a local downloadable copy before depending on cloud backup. Optional authenticated
cloud storage is account-owned and private, requires explicit upload, and does not create company operational rows.
The owner supplies/retrieves the encryption secret separately; a service-role key never enters the device.

Restore into a fresh temporary workspace first. Verify authenticated envelope/hash, schema compatibility, SQLite
integrity, foreign keys, ledger balances, version pins and document bytes. A bad/wrong-key/newer-schema snapshot never
replaces the active workspace. Activate the verified restored workspace explicitly and retain the previous one until
its own deletion is separately requested. Backup cloud sign-in does not turn local commands into team commands.

## Ordered implementation and stop conditions

1. Expand mode/identity/repository boundaries without changing current team behavior. Automatic cloud suite remains green.
2. Add real SQLite worker, versioned schema, exact arithmetic, migration/rollback and local snapshot recovery. Prove
   OPFS survives real offline reload, failed commits preserve records and a second tab cannot acquire the writer.
3. Port coherent solo business paths and reuse presentational panels, starting with master/commercial/held receipt/
   configured inspection/reservation/dispatch, then production/vendor/equipment/transfer/evidence/report extensions.
   Every enabled command needs happy/failure/revision/idempotency/invariant tests against actual SQLite. No UI-only port.
4. Add opt-in encrypted account backup and read-only archive viewing. Prove privacy, corrupt/wrong-key recovery and mode
   isolation through real browser and RLS tests. No automatic upload or shared-company data cache.
5. Add previewed cutover through trusted controlled import, mapping/blockers/archive hash and atomic final receipt.
   Prove source preservation, held openings, retries, wrong target/permission/quantity and post-cutover write freeze.

Complete only when all applicable existing features run locally without a backend, local and unchanged team suites
pass, and docs accurately distinguish device owner evidence from shared permissions. This specification is not proof
that local features are already implemented. Physical Windows/Android storage/install acceptance remains separate.
