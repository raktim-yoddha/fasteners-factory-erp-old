# TASK-0015 — Complete standard non-AI factory extensions
- Status: DONE
- Owner/agent: Codex
- Milestone: L4-L9 / UX-3 onward
- Related ADRs / docs: ADR 0015, 0016, 0017 amendments; design, architecture, domain and workflows
- Depends on: TASK-0013, TASK-0014
- Discovery status: DESIGN PROPOSAL; fictional SAMPLE configuration

## Goal
Complete the owner's approved standard factory operations and reconcile delivery recorded during the documentation pause.
## User-facing acceptance criteria
Bounded vendor custody/returns/loss; conserving lot split/merge/rework; private immutable engineering/certificate files;
actual package/partial dispatch/customer returns; unit-safe paged reports/history; immutable customer/specification/
measured conversion pins; per-line feasibility and split supplier POs; protected staff/audit; controlled preview/apply
and approved accounting handoff; explicit equipment readiness and serialized shift allocations; exact scanner/labels.
## In scope
The completed generic modules above, typed adapters, database/RLS/idempotency guards, automatic tests and current docs.
## Out of scope
Invented real SOP/tolerances/ratios/rates, paid hardware, production data/deploy, general ledger/tax filing, AI.
## Planned files/modules
src/features/{jobwork,stock,quality,production,dispatch,reports,master-data,sales,procurement,administration,data-transfer,equipment,search,records}; shared decimal/CSV/privateFile/barcode/pagination components; migrations from lot transformations through paged_record_links; tests/integration and tests/e2e; docs and related ADR amendments.
## Data migration and authorization implications
Additive applied migrations are immutable; 44 canonical source versions match local and hosted SAMPLE. Company RLS,
protected command grants and atomic signed/event history remain authoritative. No service key reaches the browser.
## Test cases (happy, failure, concurrency as relevant)
All 15 executable rollback regressions; hosted role/tenant/quantity/state/version/retry checks; genuine browser flows,
competing allocations/reservations; actual private file upload/download; paging beyond initial limits and offline shell.
## Implementation notes
Delivery occurred in authorized incremental slices while documentation was paused. Current amendments explain the final
implemented behavior. Base tasks retain physical/factory acceptance where their criteria require it.
## Validation evidence (exact command + result)
2026-10-12: `pnpm test:factory` PASS (177 tests/61 files, 15 SQL scripts, 18 browser journeys, production build and restore;
128.1 seconds). Enhanced `pnpm test:restore` PASS (114 tables, 88 private file paths/hashes; all 15 rollback scripts).
Hosted Supabase SQL executor: all 15 regression files PASS/rollback; targeted `pnpm e2e` for item-controls,
line-feasibility-purchasing, administration-transfer, equipment-capacity and scanner-history-pwa PASS (6 tests, 56.3s).
Final reconciled-document gate is recorded in TASK-0016.
## Docs updated
Product/design/architecture/domain/workflows/style/manual/roadmap/security/testing/audit and ADR 0015/0016/0017 amendments.
## Follow-ups / risks
Actual factory/process and hardware acceptance remains TASK-0008; generic tests do not certify a factory.


## Reconciled validation (2026-10-12)
`pnpm test:factory` PASS: typecheck, lint, 186 tests/62 files, 15 rollback SQL suites, read-only operations checks,
production PWA build/chunk checks, 20 browser journeys, encrypted DB/private-object backup and restored-DB regressions;
131.4 seconds. Recovery compared 114 tables and 93 private files. Later archive CLI guard test passed in the focused
operations suite; final unit count is recorded in TASK-0016. Installed factory acceptance remains TASK-0008.
