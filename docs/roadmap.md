# Roadmap

Milestones come from brief Part L. One vertical slice at a time; each task is a file in `docs/tasks/`.
Status of individual tasks lives in `docs/tasks/TASKS.md`.

| Milestone | Outcome | Needs from owner |
|---|---|---|
| L0 Discovery | Real routes, UOMs, approvals confirmed or marked assumed; fictional dataset | answers to `docs/open-questions.md` |
| **L1 Foundation (MVP)** | Vite/React/PWA app installs on Windows and Android; cloud Supabase; Auth, roles, RLS; app shell; CI real | hosting accounts |
| **L2 Master data + order thread (MVP)** | Customers, suppliers, items, drawings, warehouses, work centres, BOM/routing versions, global search, audit, Order Command Center skeleton | review of SAMPLE data |
| **L3 First slice (MVP)** | RFQ -> feasibility -> quote -> PO match -> sales order -> reserve finished stock -> pack -> ship, on SAMPLE data | demo review |
| L4 Material | MRP basics, PO, GRN, lots, QC hold, ledger, reserve/pick/issue, barcode scanning, concurrency tests | scanner/label decision |
| L5 Production | Work orders, routings, job cards, work-centre state, output/scrap/rework, tool readiness, tablet UX | shop-floor feedback |
| L6 Quality + subcontract | Inspections, NCR, rework, vendor custody, certificates, FG release | QC plan samples |
| L7 Dispatch + reports | Labels, shipment, gate-out, partial shipments, traceability, exception board | document formats |
| L8 Documents + migration | Private certificates/drawings, validated imports and approved accounting exports | real document samples and mappings |
| L9 Verified factory extensions | Tool/gauge readiness, maintenance and capacity/calendar only when needed | evidence from use |

MVP definition: L1-L3 complete, the brief's Part M scenarios that apply (1, 3, 10, 11, 13, and 15 in
part) passing, installed and demoed on one Windows PC and one Android device.

## Delivered software and remaining acceptance

The generic non-AI software through L9 is implemented on SAMPLE data: production/quality, vendor custody, split/merge,
private documents, packages/returns, reports, approved item conversions/specifications, per-line feasibility, split POs,
access/audit, controlled transfer, equipment/calibration/maintenance, explicit capacity, scanner/labels and paged history.
UX-0/1 foundations, UX-2 commercial, UX-3 materials, UX-4 production and UX-5 quality now have automatic test coverage.
TASK-0013/0014 record core production/quality; TASK-0015 records the completed standard extensions; TASK-0016 adds
operational gates, encrypted backups, restore scheduling and device software acceptance.

Physical Windows/Android installation, scan/print quality, real factory setup, live credentials/backup activation and
hosted production restoration remain acceptance work (TASK-0008). Do not mark a factory rollout complete from SAMPLE
software tests. Current behavior is in `docs/design.md`; exact command/results are in the task board and task records.
No unrelated payroll, banking, retail, tax-filing or AI phase is scheduled. Factory discovery governs future extensions.
