# TASK-0014 — Inspection, NCR containment and lot traceability
- Status: DONE
- Owner/agent: Codex
- Milestone: UX-5 / L6
- Related ADRs / docs: ADR 0017; docs/research/standard-factory-erp.md
- Depends on: TASK-0013
- Discovery status: DESIGN PROPOSAL; configured SAMPLE criteria only

## Goal
Make quality decisions deterministic, inspection-gated and traceable from supplier lot to shipment.
## User-facing acceptance criteria
Quality creates and approves immutable numeric/attribute plans with explicit sample counts. Incoming/final lot and
in-process job checks retain readings and reviewer. Missing/out-of-range readings cannot release lots. Failed checks
and NCRs explain containment. QC holds block reservation, material issue, packing and dispatch even after reservation.
NCR decisions carry reasons and linked corrective records; no audit/measurement overwrite. Lot history links actual
receipts, material custody, outputs, inspections, NCRs and shipment sources.
## In scope
Plans, inspections, QC gate repair, NCR review, existing supplier certificate references and event-backed traceability.
## Out of scope
Invented acceptance limits/sampling, certification claims, automatic concessions, AI, real emails or production deploy.
## Planned files/modules
src/features/quality/*; shared command feedback; records/search; production_quality migration;
tests/integration/production-quality.sql and existing SQL suites; tests/e2e/*; docs/*.
## Data migration and authorization implications
Company RLS, protected quality permissions, read-only client grants. Existing release/packing/dispatch boundaries are
hardened rather than leaving alternate bypasses. Inspection corrections append a superseding result.
## Test cases (happy, failure, concurrency as relevant)
Approved-plan immutability, sample/criterion/unit bounds, pass/fail, stale inspection, release bypass, NCR containment,
scrap/return quantity protection, cross-tenant denial, genuine browser quality/production journey.
## Implementation notes
Follow docs/research/standard-factory-erp.md; factory SOP remains unverified.
## Validation evidence (exact command + result)
2026-10-12: `pnpm test:factory` PASS: 177 tests/61 files, 15 rollback SQL suites and 18 production-preview browser journeys with restored-database proof (128.1s). All 15 hosted rollback files PASS. Reconciled final gate is recorded in TASK-0016.
## Docs updated
ADR 0017 and non-AI roadmap; architecture/domain/design/workflows/testing/user manual updated with actual behavior.
## Follow-ups / risks
Generic gauges/calibration, controlled split/merge/vendor/rework genealogy and private document storage are implemented in TASK-0015. Actual factory evidence and certified practice remain open.


## Reconciled validation (2026-10-12)
`pnpm test:factory` PASS: typecheck, lint, 186 tests/62 files, 15 rollback SQL suites, read-only operations checks,
production PWA build/chunk checks, 20 browser journeys, encrypted DB/private-object backup and restored-DB regressions;
131.4 seconds. Recovery compared 114 tables and 93 private files. Later archive CLI guard test passed in the focused
operations suite; final unit count is recorded in TASK-0016. Installed factory acceptance remains TASK-0008.
