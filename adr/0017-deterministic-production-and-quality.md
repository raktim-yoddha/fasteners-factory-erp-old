# ADR 0017 — Deterministic production and quality

Builds on ADR 0004, ADR 0010 and ADR 0016. Supersedes ADR 0005. Decided by the product owner, 2026-10-11.

## Context

The owner explicitly excludes AI and asks for the necessary standard factory ERP workflows in UX-4/UX-5.
Knowledge research is mainly Tally patterns; official Odoo/ERPNext manufacturing documentation validates the generic
work-order, job-card, inspection and lot-history patterns, not a particular factory SOP.

## Decision

The product is non-AI. Remove AI milestones, provider choices, gateways and assistant features from active scope.
Keep unrelated retail, ecommerce, payroll, banking and tax filing outside the factory operations roadmap.

Deliver approved engineering packages with an explicit BOM output basis, accepted-demand work orders with immutable
engineering pins, ordered operation cards, controlled material issue/unused return/consumption, held output lots and
close gates. Planned quantities and pending operation quantities are explicit; pending work is never silently scrap.
Work-centre queues show actual assigned work, without fabricated shift capacity or utilization.

Quality uses operator-defined numerical/attribute criteria and explicit sample counts in immutable approved plan
versions. Inspection results retain readings and reviewer identity. A passed current inspection is required by the
existing lot-release command as well as the new UI; NCR containment must block packing and dispatch of held lots.
NCR disposition is reasoned, authorized and traceable. Corrections add inspection/event history instead of rewriting it.
Genealogy links actual supplier receipts, material events, outputs and shipments; no inference converts one item's unit
into another. Future split/merge, vendor custody and document uploads remain separate explicit operational slices.

All business changes run through whitelisted, typed production/quality commands using existing auth, permission,
revision, idempotency and audit helpers. New tables have company RLS and SELECT-only browser grants.
Use fictional SAMPLE fixtures and explicit configured criteria; no real factory tolerance, machine or rate is invented.

## Consequences

Legacy unrestricted QC release becomes inspection-gated, including manual SAMPLE finished receipts. Existing tests and
operator documentation must use an approved plan and readings. Existing approved BOMs lacking an output basis remain
valid historical pins but cannot drive new material planning until a new fully defined revision is approved.
No AI dependency or runtime service is introduced. Physical pilot SOP, certified inspection practice, private evidence
uploads and factory conversions still require discovery; generic configurable workflows can be tested immediately.

## Amendment (2026-10-11): Recovery and automated validation
Closed batch operational/rework loss and resolved NCR scrap free bounded replacement demand; a work order and
external stock allocation cannot both claim the same demand. Approved BOM component/basis units are protected.
An explicit audited command releases unconsumed reservations while retaining shipped quantities. Prepared packing
can be cancelled with a reason before gate-out; allocations then remain until separately released. No posted
shipment or ledger event is erased. Held-lot top-ups invalidate earlier inspections; managed receipt/output lots
cannot accept manual receipts. Draft engineering line mutation serializes with approval.

`pnpm test:factory` starts a local SAMPLE stack, applies pending migrations, provisions or reuses only known
fictional credentials, and runs types, lint, unit, rollback SQL and real browser journeys. It restores the caller's
E2E configuration, never resets a database and keeps reports local. CI uses the same deterministic prerequisites.


## Amendment (2026-10-12): Standard factory extensions and controlled evidence

The owner's repeated approval covers generic vendor job-work outward/partial-return/loss custody, lot split/merge/rework,
private certificate/drawing files with immutable approved revisions and byte verification, actual shipment packages,
partial dispatch and bounded QC-held customer returns. Lot genealogy survives these events; file references alone are
not uploaded/certified evidence. Unit-safe operational reports paginate source truth. No tax ledger or direct financial
integration is inferred.

Item specification versions freeze fastener attributes/evidence and pin quotes/orders/work. Measured item-specific
alternate-unit versions retain original input plus exact base quantities; no kg-to-piece guess or rounding occurs.
Customer part/drawing references carry through documents. Approved-account company administration uses protected
revision-checked commands/last-admin locks; audit browsing pages existing protected history. Controlled CSV imports
save exact previews and revalidate atomically; accounting handoff approves immutable signed-event/currency snapshots.

Equipment assets and append-only calibration/maintenance/hold evidence bind pending jobs and draft-plan gauges. Trusted
start/inspection checks revalidate current readiness under locks. Explicit plant-time shifts and exact minute allocations
serialize overlap/overbooking and preserve released allocation history. Unconfigured legacy jobs/plans do not acquire
invented equipment requirements. All new business changes reuse auth/permission/revision/idempotency/audit helpers and
SELECT-only browser grants. Tests use fictional SAMPLE materials, dates and limits.

These additions are implemented by additive migrations after the original production/quality slice, through equipment
capacity readiness. Factory/device acceptance remains open. The subsequent scanner/history delivery is recorded in
ADR 0015; backup/preflight behavior is ADR 0018. Documentation was paused during implementation and is reconciled now.
