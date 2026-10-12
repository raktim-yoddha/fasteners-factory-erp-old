# ADR 0016 — Commercial and material workspaces

Builds on ADR 0004, ADR 0010 and ADR 0015. Decided by the product owner, 2026-10-11.

## Context

The owner requested UX-2 and UX-3 and an audit of usability, maintainability and automated verification.
Existing commercial forms hide dates and pinned revisions. Stock has no balance explorer or purchase flow.
The knowledge corpus supplies industry patterns, not verified factory operating procedures.

## Decision

- Extend the existing command chain with an RFQ inbox, request detail, explicit quotation validity and order promise dates,
  visible engineering pins, approval review and approved quotation printing. Reuse existing master creation in context.
- Preserve decimal quantities and prices as strings at the browser boundary; PostgreSQL performs business arithmetic.
- Add requisition, approved purchase order, partial goods receipt into QC hold, supplier return and stock-count review commands.
  Each command checks company permission, state, revision and idempotency and records an atomic audit receipt.
- Inventory reads show per-lot physical, reserved, held and available quantities in the item's base unit, with ledger drill-down.
  WIP and vendor custody are not inferred from an absence of records. Multi-unit conversions remain blocked until verified.
- Factory-specific conversions, inspection criteria, work-order/job-card issue and return, certificate uploads and supplier
  qualification rules remain explicit discovery dependencies. Implement only authorized SAMPLE assumptions, not fictitious SOPs.
- Clear query caches when the authenticated identity changes and reset company-specific forms on company changes.
- Count approval requires a different authorized reviewer from the proposer. This is a generic SAMPLE control,
  not a verified factory approval SOP. Supplier certificate references are optional evidence references, not uploads.
- Explicitly grant Stores sales-read access to select demand for its existing reservation authority. New purchase
  and count permissions remain company-scoped. All new read views run as SECURITY INVOKER.
- Use the existing generic SAMPLE product decision for this slice: no automatic conversion, no invented QC criteria,
  existing warehouse/location hierarchy and explicit Quality release/rejection from hold. Factory policy stays open.

## Consequences

New exposed tables use company RLS and read-only browser grants; business transitions run only through named commands.
No finance, tax, hardware, AI or production deployment is included. UX-3 has a separate completion checklist for its
factory-dependent paths; a working procurement slice does not imply that shop-floor material issue is complete.


## Amendment (2026-10-12): Per-line feasibility and split supplier allocation

Different RFQ lines can carry independent immutable feasibility reviews. Quotation lines pin the selected feasible
review; mixed-item enquiries no longer require artificial RFQ separation. Legacy whole-request review remains for
compatible records. Approval checks retired specification versions while accepted historical pins remain unchanged.

Requisition positions derive allocated/remaining demand across supplier POs. Locked revision/quantity checks permit
split purchasing without concurrent over-allocation. Existing single-request full-demand paths remain compatible.
Item unit/specification pins and original-input conversion events protect downstream meaning (ADR 0017 amendment).
