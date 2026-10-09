# Task board

| ID | Title | Milestone | Status | Depends on |
|---|---|---|---|---|
| TASK-0001 | Foundation: Vite/React/TS/PWA app, Supabase local, real CI scripts | L1 | IN_REVIEW | - |
| TASK-0002 | Auth, roles, permissions, RLS, audit base | L1 | IN_PROGRESS | 0001 |
| TASK-0003 | Master data (customers, suppliers, items, drawings, locations, work centres) | L2 | IN_PROGRESS | 0002 |
| TASK-0004 | BOM/routing versioning, global search, Order Command Center skeleton | L2 | IN_PROGRESS | 0003 |
| TASK-0005 | Enquiry -> feasibility -> quote -> PO match -> sales order | L3 | IN_PROGRESS | 0004 |
| TASK-0006 | Stock ledger, lots, reserve finished goods (with concurrency tests) | L3 | TODO | 0004 |
| TASK-0007 | Packing, shipment, dispatch with idempotency | L3 | TODO | 0005, 0006 |
| TASK-0008 | MVP demo on Windows + Android, hardening, acceptance run | L3 | TODO | 0007 |

Only TASK-0001 has a spec file so far. Write the next spec just before starting it.
