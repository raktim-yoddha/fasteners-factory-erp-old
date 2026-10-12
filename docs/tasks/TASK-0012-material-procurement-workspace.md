# TASK-0012 — Materials, procurement and inventory control
- Status: IN_REVIEW
- Owner/agent: Codex
- Milestone: L4 / UX-3
- Related ADRs / docs: ADR 0016; knowledge/FASTENERS_FACTORY_ERP_UX_FEATURE_ROADMAP.md
- Depends on: TASK-0011
- Discovery status: DESIGN PROPOSAL; factory-specific policies OPEN

## Goal
Deliver a controlled purchase-to-receipt slice and explain stock from its ledger.

## User-facing acceptance criteria
Create a demand-linked requisition, approve a purchase order, receive partially into QC hold with supplier lot/certificate
references, reject/return with a reason, and inspect physical/reserved/held/available quantities and movements.
Cycle-count proposals require separate authorization and reject negative or reserved-stock-consuming adjustments.
Quantities use the base UOM without automatic conversion. No free-standing material issue is offered.

## In scope
Purchase requests/orders, receipts, supplier returns, stock explorer, count review, supplier and material context.

## Out of scope
Work-order/job-card issue/return until UX-4 supplies those objects; unverified conversions and inspection criteria;
certificate uploads, finance, hardware, AI and production deployment.

## Planned files/modules
src/features/procurement/*; src/features/stock/*; src/features/master-data/*; src/app/*;
supabase/migrations/*material_procurement.sql; tests/integration/*; tests/e2e/*;
docs/domain-model.md, architecture.md, design.md, workflows.md, testing.md, task board and ADR 0016.

## Data migration and authorization implications
New tenant-scoped tables with SELECT-only grants and named server commands; purchase/stores/quality permissions.

## Test cases (happy, failure, concurrency as relevant)
Partial receipt, duplicate receipt, over-receipt, stale revision, held lot, supplier return, reservation preservation,
count review, cross-tenant denial and concurrent commands, with AI absent.

## Implementation notes
The original procurement slice used base UOM and supplier evidence references. TASK-0015 adds approved measured alternate units, private files and split supplier allocations; Quality decisions remain distinct. Do not represent these as factory SOP.

## Validation evidence (exact command + result)
`pnpm e2e` — 4 Chromium tests passed in 30.9s, including request, draft PO, approval, partial held receipt and supplier return.
Supabase `execute_sql(project_id: configured SAMPLE project, query: tests/integration/material-procurement.sql)` —
all procurement/return/count/rejection/UOM/idempotency/tenant assertions passed; transaction rolled back.
`pnpm typecheck`, `pnpm lint`, `pnpm test` — passed; 38 files, 70 tests.
`pnpm e2e:stack` — all 26 migrations applied to a fresh local stack.
`pnpm e2e:seed` — invited SAMPLE operator, company and base fixtures provisioned; public signup denial verified.
`pnpm test:db` — both rollback assertion suites passed in the disposable local stack.
Final `pnpm check` against that local stack — typecheck, lint, 70 unit/component tests, production build and 4 E2E
journeys passed; browser suite 13.0s with no skips or retries, including balance/unit checks beside return and count actions.

## Docs updated
Design, architecture, domain model, workflows, testing, project audit, product, style, README, task board and ADR 0016.

## Follow-ups / risks
Generic work/job material issue/return and configured inspection are implemented by TASK-0013/0014; measured conversions/files/vendor custody by TASK-0015. Actual factory-policy acceptance remains open.


## Reconciled validation (2026-10-12)
`pnpm test:factory` PASS: typecheck, lint, 186 tests/62 files, 15 rollback SQL suites, read-only operations checks,
production PWA build/chunk checks, 20 browser journeys, encrypted DB/private-object backup and restored-DB regressions;
131.4 seconds. Recovery compared 114 tables and 93 private files. Later archive CLI guard test passed in the focused
operations suite; final unit count is recorded in TASK-0016. Installed factory acceptance remains TASK-0008.
