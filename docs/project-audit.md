# Project audit — 2026-10-11

Assumed load: a small factory with multiple company-scoped operators and concurrent stock commands. No real factory
data or production deployment was authorized. Review covered application composition, authentication, feature adapters,
high-risk Postgres commands/RLS, migrations, tooling, tests and documentation. No claim of exhaustive proof is made.

## Confirmed faults repaired

| Fault | Concrete failure | Repair / proof |
|---|---|---|
| Permission helper ignores membership activity | A deactivated member with retained roles can still read/write | Require active membership in the shared helper; executable SQL denial assertion |
| Reservation totals include consumed quantity | Partial dispatch double-counts consumed stock as still reserved | Derive remaining reservation; executable partial-dispatch balance assertion |
| Receipt tops up a released lot | New uninspected quantity becomes reservable immediately | Reject top-up unless the existing lot remains held; executable QC assertion |
| Reservations exceed order demand | Sufficient stock can be reserved beyond ordered quantity | Lock order and check active/consumed commitments against demand |
| Item UOM and approved parent identity drift | Later master changes alter the meaning of pinned historical records | Database triggers protect used UOM and approved engineering parent identity |
| Drawing pin is absent from quote/order lines | Acceptance loses the feasibility drawing revision | Persist exact drawing pins through quotation and acceptance |
| Decimal ingress uses JS number coercion | Large prices/quantities can round before reaching NUMERIC | Transmit decimal text; cast numeric reads to text; exact-value tests |
| Hidden quote/order dates | Every quote expires today and every order silently promises today | Explicit validity/currency/promise fields |
| E2E silently skips without credentials | A green run can execute no journey | Explicit configuration failure; isolated automatic CI setup and retained failure reports |
| SQL text tests treated as integration proof | Function names can exist while a command is broken | Two executable rollback suites, real browser commands and competing reservation calls |
| 320px form overflow | Operators must scroll the whole page to reach fields | Shrinkable labelled controls and navigation; six-width browser assertions |
| Authenticated cache survives identity change | A later operator can see an earlier operator's cached reads | Clear query state when identity changes and reset company form context |
| Documentation overclaims offline/backend modules | README implies persistent cached reads, drafts and private storage exist | Current-behavior design/architecture/workflow docs; planned features labelled explicitly |
| Fresh-database compatibility repairs duplicate keys | A new CI database fails while adding already-present composite keys | Guard compatibility repairs by constraint existence |
| Permission namespace rejects its own seed | Fresh setup rejects `master_data.read` before role creation | Repair the initial constraint and reconcile existing databases with an additive migration |
| Hardening assumes a hosted-only helper | Local migrations fail because `rls_auto_enable()` is absent | Revoke privileges only when that optional helper exists |
| Local Auth disables invited users | The email-provider flag is off even though the app requires email sign-in | Enable the provider; retain the global signup prohibition and assert it during test provisioning |
| Local SQL runner prepares an entire transaction as one statement | Rollback integration scripts fail before any assertions execute | Execute local scripts through container `psql` with `ON_ERROR_STOP=1`; preserve hosted runner error detection |
| Hosted migration timestamps differ from repository | CLI cannot match applied migrations to committed files | Normalize verified SAMPLE migration metadata by unique migration name; preserve stored statements and business rows |

The broadened E2E suite also caught a dispatch cache-key regression introduced during this work. It is repaired;
shipment preparation now refreshes the matching query before the UI can dispatch it.
Repeated authentication subscriptions could also clear a query while its initial company read was loading. Cache
identity now survives StrictMode subscriptions and route remounts, while actual operator changes still clear private data.
Initial company discovery also made two serial network requests for a scope already enforced by company RLS. It now
uses one RLS-scoped company read. Browser startup has a separate bounded timeout; command timeouts remain eight seconds.
Shared balance summaries now show exact quantities and actual units beside supplier returns, reservations and counts.

## Reconciliation and current limits (2026-10-12)

Earlier future-feature statements became stale during the owner-directed documentation pause. They are replaced by the
current design/domain/workflow/manual and ADR amendments. Delivered extensions now include per-line feasibility,
split supplier allocation, immutable specs/measured units/customer references, vendor custody, split/merge, private
files, actual packages/partial dispatch/returns, reports, staff/audit, imports/accounting snapshots and equipment/shift
capacity. Ledger/timeline/related links are paginated, and the custom build-chunk startup cycle is repaired.

| Later fault found | Repair / automatic evidence |
|---|---|
| Custom Vite grouping creates runtime import cycle | Default chunking and static chunk graph gate; actual production-preview startup |
| Offline startup waits indefinitely on a paused company query | Online-aware shell loading gate; real service-worker offline reload |
| Split supplier drafts can compete for the same demand | Serialized allocation and remaining-demand checks; concurrent browser/SQL proof |
| Equipment calibration/due date/locks can drift during start | Required dates and authoritative start/inspection checks; lost-confirmation and overbooking proof |
| History cuts off beyond 100 ledger/20 linked records | Keyset navigation, exact bigint IDs, 103-event/25-link browser proof |
| Database-only backup omits private bytes | Actual private downloads, authenticated encrypted manifest, file hashes and source comparison |

Full prior local gate: `pnpm test:factory`, 177 tests/61 files, 15 SQL suites, 18 browser journeys, build and restore PASS
in 128.1 seconds. All 15 hosted rollback suites plus six newest hosted browser journeys passed. Current operations
additions and final full-gate evidence are in TASK-0016. Tests are automatic; no manual UI result substitutes for a pass.

Still open: physical Windows/Android installation and scanner/printer sizing/readability; actual factory/QC/conversion/
accounting configuration; live host/operations credentials, key custody, backup activation and full hosted restoration.
Supabase's intentional protected SECURITY DEFINER advisories remain; hosted leaked-password protection is disabled.
The production gate blocks unverified configuration/evidence. No live deployment/real data/paid plan is introduced.
