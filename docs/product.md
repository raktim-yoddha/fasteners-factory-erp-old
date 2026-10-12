# Product

Explains scope; rules live in `AGENTS.md`. Full detail: `FASTENER_ERP_MASTER_BRIEF.md` Parts B-F.

## What it is
A private ERP covering enquiry, feasibility, costing, quotation, order acceptance, planning, material,
tooling, production, WIP, quality, subcontracting, assembly, finished goods, packing and dispatch
(the 16-stage backbone, brief Part D). Generic product with fictional demo data first (owner decision);
Nitin Fasteners is only the reference business and public research basis.

**Product name:** Fasteners Factory ERP (owner decision, ADR 0006). The historic master brief retains
its initial working title, Fastener Factory OS.

## MVP target
- Devices: Windows 11 Chrome and Android phone Chrome (installed PWA). iOS later.
- Backend: hosted Supabase. Network: cloud-first (ADR 0003).
- MVP = milestones L1-L3 of `docs/roadmap.md`: installable signed-in app, master data and the order thread,
  then one end-to-end happy path (enquiry to shipment from existing finished stock) on SAMPLE data.
  Material operations, shop floor, quality and dispatch hardening follow in L4-L7.
- UX-2 adds the RFQ inbox, contextual master creation, explicit dates/pricing, revision review and approved printing.
  The UX-3 SAMPLE procurement slice adds requisitions, PO approval, partial held receipts, supplier returns, stock
  explorer and independent count review. UX-4 adds work orders, ordered job cards, issues/returns/consumption and held output; UX-5 adds configured inspections, NCR and traceability.
- Global search covers current MVP identifiers and names only; each result remains limited by the caller's existing
  company-scoped record permissions. A permitted result opens its read-only record workspace, which identifies its
  source, current state, last recorded confirmation and next operations workspace.
- Sign-in uses a passwordless link sent only to an already approved account (ADR 0007); there is no public
  self-registration.

## Roles
Admin, Management, Sales, Engineering, Costing, Planning, Purchase, Stores, Production supervisor,
Operator, Quality, Subcontract coordinator, Packing/Dispatch, Accounts (approved accounting handoff), Auditor. A user holds several
roles; permissions are action + resource + scope (brief Part C).

## Surfaces
Windows: full office ERP (dense tables, search, shortcuts). Android tablet: shop-floor job and scan
screens. Android phone: warehouse, approvals, alerts. Required centrepiece: the Order Command Center.

## Out of scope for the MVP
Electron, React Native, public website, machine/PLC control, vision QC, tax filing, payroll, offline
stock writes, AI features or dependencies.

## Success checks
The 15 acceptance scenarios in brief Part M.


## Current implemented scope (2026-10-12)

L1-L9 generic software is implemented on SAMPLE data, including vendor job work, lot split/merge/rework, private drawing
and certificate files, package labels/partial shipment/customer returns, operational reports, item specification and
measured conversion versions, customer part references, per-line feasibility, split POs, approved staff access/audit,
controlled imports/accounting exports, equipment readiness and explicit shift capacity. Exact scanner lookup and paged
records preserve existing permissions. Operations backup/preflight tools and desktop/Android-touch browser profiles
prepare deployment; they do not certify physical devices or a real factory. See design, architecture and deployment.

The accounting handoff is signed-event CSV with currency totals, not a general ledger, tax invoice or direct Tally sync.
Hardware baseline is keyboard-wedge Code 39 plus browser printing. No camera decoder/device driver is implemented.
