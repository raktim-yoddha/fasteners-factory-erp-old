# TASK-0013 — Demand, work orders and shop-floor material control
- Status: DONE
- Owner/agent: Codex
- Milestone: UX-4 / L5
- Related ADRs / docs: ADR 0017; docs/research/standard-factory-erp.md
- Depends on: TASK-0012
- Discovery status: DESIGN PROPOSAL; fictional SAMPLE process only

## Goal
Turn accepted demand into revision-pinned work, visible shortages and explicit production/material events.
## User-facing acceptance criteria
Engineering owners create/review/approve BOM and routing packages with output basis and item units. Planning bounds
work to accepted demand and pins exact revisions. Release creates ordered job cards. Operators record partial good
and explicit scrap quantities; predecessors block out-of-sequence work. Stores issues released, unreserved material
to a job; unused returns and actual consumption are separate events. Output is held for inspection. Close requires
complete operations, accounted material and resolved output QC. All quantities show units; no guessed capacity.
## In scope
Engineering package, demand/shortage view, work-centre queue, work orders/job cards, WIP/material events, held output.
## Out of scope
Machine integration, fabricated SOP/rates/conversions, finance, AI, production deployment.
## Planned files/modules
supabase/migrations/*production_quality_workspaces.sql; src/features/production/*; src/app/*;
src/features/records/*; tests/integration/production-quality.sql; tests/e2e/production-quality.spec.ts; docs/*.
## Data migration and authorization implications
Add tenant-scoped production records and narrow permissions. Existing immutable engineering and signed stock ledger
remain authoritative; command helpers reused. Old BOM output-basis omissions do not receive invented values.
## Test cases (happy, failure, concurrency as relevant)
Wrong tenant/role/unit/revision, excessive plan/issue/output, QC hold, duplicate retry, ordered jobs, partial progress,
material return/consume, WIP/stock balances, incomplete close, actual browser factory journey.
## Implementation notes
One vertical chain; no autonomous MRP purchasing. Shortage recommendations never commit orders automatically.
## Validation evidence (exact command + result)
2026-10-12: `pnpm test:factory` PASS: 177 tests/61 files, 15 rollback SQL suites and 18 production-preview browser journeys with restored-database proof (128.1s). All 15 hosted rollback files PASS. Reconciled final gate is recorded in TASK-0016.
## Docs updated
ADR 0017, active non-AI contract/roadmap; design/architecture/domain/workflows/testing updated with implementation.
## Follow-ups / risks
Generic capacity/calendar, measured alternate units and equipment readiness are implemented in TASK-0015. Real SOP, measured evidence and physical hardware acceptance remain open.


## Reconciled validation (2026-10-12)
`pnpm test:factory` PASS: typecheck, lint, 186 tests/62 files, 15 rollback SQL suites, read-only operations checks,
production PWA build/chunk checks, 20 browser journeys, encrypted DB/private-object backup and restored-DB regressions;
131.4 seconds. Recovery compared 114 tables and 93 private files. Later archive CLI guard test passed in the focused
operations suite; final unit count is recorded in TASK-0016. Installed factory acceptance remains TASK-0008.
