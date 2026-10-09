# Product

Explains scope; rules live in `AGENTS.md`. Full detail: `FASTENER_ERP_MASTER_BRIEF.md` Parts B-F.

## What it is
A private ERP covering enquiry, feasibility, costing, quotation, order acceptance, planning, material,
tooling, production, WIP, quality, subcontracting, assembly, finished goods, packing and dispatch
(the 16-stage backbone, brief Part D). Generic product with fictional demo data first (owner decision);
Nitin Fasteners is only the reference business and public research basis.

## MVP target
- Devices: Windows desktop (installed PWA) and Android phone/tablet (installed PWA). iOS later.
- Backend: hosted Supabase. Network: cloud-first (ADR 0003).
- MVP = milestones L1-L3 of `docs/roadmap.md`: installable signed-in app, master data and the order thread,
  then one end-to-end happy path (enquiry to shipment from existing finished stock) on SAMPLE data.
  Material operations, shop floor, quality and AI follow in L4-L8.

## Roles
Admin, Management, Sales, Engineering, Costing, Planning, Purchase, Stores, Production supervisor,
Operator, Quality, Subcontract coordinator, Packing/Dispatch, Accounts (later), Auditor. A user holds several
roles; permissions are action + resource + scope (brief Part C).

## Surfaces
Windows: full office ERP (dense tables, search, shortcuts). Android tablet: shop-floor job and scan
screens. Android phone: warehouse, approvals, alerts. Required centrepiece: the Order Command Center.

## Out of scope for the MVP
Electron, React Native, public website, machine/PLC control, vision QC, tax filing, payroll, offline
stock writes, AI (before L8).

## Success checks
The 15 acceptance scenarios in brief Part M.
