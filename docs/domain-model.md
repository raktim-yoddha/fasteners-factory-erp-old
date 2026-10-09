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
