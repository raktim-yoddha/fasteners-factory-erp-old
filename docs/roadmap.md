# Roadmap

Milestones come from brief Part L. One vertical slice at a time; each task is a file in `docs/tasks/`.
Status of individual tasks lives in `docs/tasks/TASKS.md`.

| Milestone | Outcome | Needs from owner |
|---|---|---|
| L0 Discovery | Real routes, UOMs, approvals confirmed or marked assumed; fictional dataset | answers to `docs/open-questions.md` |
| **L1 Foundation (MVP)** | Vite/React/PWA app installs on Windows and Android; Supabase local + hosted; Auth, roles, RLS; app shell; CI real | hosting accounts |
| **L2 Master data + order thread (MVP)** | Customers, suppliers, items, drawings, warehouses, work centres, BOM/routing versions, global search, audit, Order Command Center skeleton | review of SAMPLE data |
| **L3 First slice (MVP)** | RFQ -> feasibility -> quote -> PO match -> sales order -> reserve finished stock -> pack -> ship, on SAMPLE data | demo review |
| L4 Material | MRP basics, PO, GRN, lots, QC hold, ledger, reserve/pick/issue, barcode scanning, concurrency tests | scanner/label decision |
| L5 Production | Work orders, routings, job cards, work-centre state, output/scrap/rework, tool readiness, tablet UX | shop-floor feedback |
| L6 Quality + subcontract | Inspections, NCR, rework, vendor custody, certificates, FG release | QC plan samples |
| L7 Dispatch + reports | Labels, shipment, gate-out, partial shipments, traceability, exception board | document formats |
| L8 AI v1 (flagged) | RFQ/PO extraction, document search, similar items, read-only Q&A | provider + data-sharing + budget |
| L9 Extensions | Scheduling, supplier risk, maintenance, finance, native clients, telemetry | evidence from use |

MVP definition: L1-L3 complete, the brief's Part M scenarios that apply (1, 3, 10, 11, 13, and 15 in
part) passing, installed and demoed on one Windows PC and one Android device.

## First tasks

TASK-0001 is in review. TASK-0002 through TASK-0008 are implemented in local vertical slices and remain
in progress until their hosted Supabase integration, device installation and acceptance checks are complete.
