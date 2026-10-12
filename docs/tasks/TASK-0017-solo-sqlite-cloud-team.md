# TASK-0017 — Device SQLite solo ERP alongside Supabase team ERP
- Status: IN_PROGRESS
- Owner/agent: Codex
- Milestone: dual local/cloud architecture
- Related ADRs / docs: ADR 0019; 2026-10-12 solo-sqlite-and-cloud-team design
- Depends on: TASK-0015, TASK-0016
- Discovery status: owner-decided authority split; generic workflow DESIGN PROPOSAL

## Goal
Implement separate device-authoritative solo workspaces and existing cloud-authoritative team workspaces.
## User-facing acceptance criteria
Persistent real SQLite/offline solo commands without Supabase; preserved cloud roles/commands; explicit mode and cache/
identity isolation; exact arithmetic and immutable events/versions; validated local export/restore; optional encrypted
account-owned backup; explicit approved migration preview. No silent sync or fabricated independent reviewer.
## In scope
Typed repository and runtime identity/capabilities, worker/OPFS schema, local transactional domain services/read models,
mode UI, reused feature presentation, local backup/cutover adapters, automated local and existing cloud tests, docs.
## Out of scope
Automatic shared-record sync, real factory migration/deployment, paid services, invented SOP, AI, native app wrappers.
## Planned files/modules
src/app mode/runtime boundary; src/lib cloud/local repository; src/local/{worker,protocol,database,domain,read-models};
existing typed feature adapters/panels as required; versioned local schema; optional Supabase backup/cutover migration;
SQLite dependency/lock; Vite/PWA/delivery headers; tests/unit and tests/e2e; docs/architecture/design/security/testing,
AGENTS.md/CLAUDE.md in sync, ADR 0019 and this task.
## Data migration and authorization implications
Preserve every existing cloud row. Local owner authority is not cloud authorization. Protected team approval/stock
commands stay server-enforced. Optional backup ownership uses auth.uid; cutover validates provenance/data explicitly.
## Test cases (happy, failure, concurrency as relevant)
Real SQLite/OPFS, exact arithmetic, invalid requests/units/quantities, transactional rollback, revisions/idempotency,
immutable pins/events, QC/material/job/dispatch gates, offline reload, second-tab exclusion, cloud compatibility and
mode isolation, corrupt/wrong-key restore, opt-in backup and reviewed migration without partial overwrite.
## Implementation notes
Architecture requires domain-port work because existing invariants are Postgres commands. Complete coherent local
paths while team remains usable. Unsupported/not-yet-validated local actions remain visibly unavailable.
## Validation evidence (exact command + result)
Pending implementation; no prior cloud-only test is claimed as local proof.
## Docs updated
ADR 0019 and reviewed direction specification; architecture/contract reconciliation accompanies runtime changes.
## Follow-ups / risks
Browser storage clearing/quota, retained backups/key custody, actual device acceptance. Cutover is owner-approved: masters/opening balances plus readable solo history; open work must be reconciled. Detailed design review precedes runtime implementation.
