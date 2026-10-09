# Domain model

**DESIGN PROPOSAL** — factory workflow entities begin after master-data discovery. This document records the
authorization foundation currently in the migration.

## Tenant access

```mermaid
erDiagram
  companies ||--o{ plants : has
  companies ||--o{ company_memberships : scopes
  company_memberships }o--|| profiles : identifies
  company_memberships ||--o{ user_company_roles : grants
  user_company_roles }o--|| role_permissions : maps
  role_permissions }o--|| permission_definitions : names
  companies ||--o{ audit_log : owns
```

- `companies` and `plants` are the tenant and plant boundaries.
- `company_memberships` records active tenancy. `user_company_roles` allows one person to have several roles.
- `permission_definitions` and `role_permissions` are protected database facts; user metadata is never authorization.
- `audit_log` is append-only: no authenticated insert/update/delete policy exists. Trusted future commands write it.
- Every future operational table carries `company_id`, enables RLS, indexes its RLS filters, and uses database
  commands for multi-record changes.

## Master data

`customers`, `suppliers`, `items`, `drawings`, `drawing_revisions`, `warehouses`, `stock_locations` and
`work_centres` are all company-scoped. Item, partner, warehouse and work-centre codes are unique inside the
company. A drawing revision belongs to the same company as its drawing and item. Once a revision is approved,
the database rejects every update; a replacement revision must be created instead.

## Engineering versions

`boms` and `routings` select an output item; their revisions are identified by immutable IDs. `bom_lines` keep
component quantity, UOM and scrap allowance as database numerics. `routing_operations` keep ordered work-centre
steps and numeric setup/run minutes. Approved headers reject updates and private draft checks block line/operation
mutation, so later commercial and production records can pin a revision without historical drift.

## Commercial order thread

`rfqs`, `feasibility_reviews`, `quotations` and `sales_orders` each hold their own status. Lines carry exact
`NUMERIC` quantities, explicit UOM, and monetary prices with currency held on the quotation. Feasibility, quote
and sales-order lines can pin the relevant drawing, BOM and routing revision IDs rather than resolving a newer
engineering revision later.

## Inventory ledger

`stock_lots` identify stock by item and location. `stock_ledger_entries` are append-only signed movements;
on-hand is the sum of those movements, not a mutable balance. `stock_reservations` represent the quantity
committed to sales-order lines, and `stock_positions` derives on-hand, reserved and available-to-promise.
The `reserve_finished_goods` command locks the sales order and lot, checks the expected order revision,
requires a released QC lot, enforces available stock, records an audit row and accepts a caller idempotency key.
