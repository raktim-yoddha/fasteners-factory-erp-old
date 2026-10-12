# Task board

| ID | Title | Milestone | Status | Depends on |
|---|---|---|---|---|
| TASK-0001 | Foundation: Vite/React/TS/PWA app, cloud Supabase, real CI scripts | L1 | IN_REVIEW | - |
| TASK-0002 | Auth, roles, permissions, RLS, audit base | L1 | IN_REVIEW | 0001 |
| TASK-0003 | Master data (customers, suppliers, items, drawings, locations, work centres) | L2 | IN_REVIEW | 0002 |
| TASK-0004 | BOM/routing versioning | L2 | DONE | 0003 |
| TASK-0005 | Enquiry -> feasibility -> quote -> PO match -> sales order | L3 | IN_REVIEW | 0004 |
| TASK-0006 | Stock ledger, lots, reserve finished goods (with concurrency tests) | L3 | IN_REVIEW | 0004 |
| TASK-0007 | Packing, shipment, dispatch with idempotency | L3 | IN_REVIEW | 0005, 0006 |
| TASK-0008 | MVP demo on Windows + Android, hardening, acceptance run | L3 | IN_PROGRESS | 0007 |
| TASK-0009 | Global identifier search | L2 | DONE | 0004 |
| TASK-0010 | UX foundation and secure record workspaces | L3 | IN_REVIEW | 0009 |
| TASK-0011 | Commercial UX and project integrity repairs | L3 / UX-2 | IN_REVIEW | 0010 |
| TASK-0012 | SAMPLE material purchasing and inventory control | L4 / UX-3 | IN_REVIEW | 0011 |
| TASK-0013 | Production jobs/material control | L5 / UX-4 | DONE | 0012 |
| TASK-0014 | Quality/NCR/genealogy | L6 / UX-5 | DONE | 0013 |
| TASK-0015 | Standard non-AI factory extensions | L4-L9 | DONE | 0013, 0014 |
| TASK-0016 | Operations readiness and automated recovery | L9 | DONE | 0015 |
| TASK-0017 | Separate solo SQLite and cloud team architecture | Dual authority | IN_PROGRESS | 0015, 0016 |

Every task has a spec. Generic software is implemented on SAMPLE; task validation evidence is explicit. Existing
foundation/pilot tasks retain review status where installed-device/factory/live acceptance is part of their scope.
TASK-0008 owns physical acceptance; TASK-0016 prepares software tooling without claiming that hardware/live setup passed.
