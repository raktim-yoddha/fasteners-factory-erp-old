# Standard fastener factory ERP: research and delivery scope

Research date: 2026-10-11. Product scope: a deterministic factory operations ERP.
This document explains findings; the engineering contract remains in `AGENTS.md`.

## Evidence labels

- **VERIFIED FROM PUBLIC SOURCE**: a feature or service documented by its vendor.
- **INDUSTRY PATTERN**: a recurring operational pattern, not a factory-specific requirement.
- **DESIGN PROPOSAL**: the proposed implementation for this product.
- **OPEN QUESTION**: factory policy, measurement or equipment information still needed.
- **VERIFIED FROM FACTORY**: none of the research below carries this label.

Vendor marketing confirms what a vendor offers or claims, not independent performance,
certification, regulatory compliance or suitability for a particular factory.

## Knowledge-base coverage

The corpus contains 46 files: 39 Markdown files and seven extensionless files.
Its primary subject is Tally, not a verified fastener-manufacturing SOP.
The README advertises some absent filenames and inconsistent word/file totals.
Sources, prices, market-share numbers and competitor comparisons need fresh verification.

| Corpus group | Files and reading purpose |
|---|---|
| Orientation | `knowledge/README.md`, `raw-sources.md`: index, references and source reliability. |
| Delivery map | `FASTENERS_FACTORY_ERP_UX_FEATURE_ROADMAP.md`: existing UX-4 planning and UX-5 quality/genealogy scope. |
| Inventory | `features/inventory.md`: units, locations, batches, BOMs, manufacturing, job work, reorder and movement reports. |
| Masters | `features/masters-complete.md`: item taxonomy, unit precision, location hierarchy, numbering and historical-change risks. |
| Documents | `features/vouchers-complete.md`: stock movements, counts, receipts, returns, orders, numbering and permissions. |
| Reports | `features/reporting.md`, `features/reports-complete.md`: drill-down, period/filter controls, movements, aging and outstanding orders. |
| Other feature context | `features/accounting-core.md`, `ledgers-complete.md`, `gst-compliance.md`, `payroll.md`, `missing-features.md`: distinguish operational needs from accounting/HR/retail expansion. |
| Workflow | `userflow/pain-points.md`, `keyboard-only-full-workflow.md`, `complete-monthly-workflow.md`: fast entry, clear recovery, daily review and reconciliation. |
| UX | `ux-analysis/keyboard-shortcuts-master.md`, `power-user-secrets.md`: quick creation, keyboard traversal, discoverability and drill-down. |
| Complaints | `complaints/reddit-raw-insights.md`, `what-tally-cannot-do.md`: discovery signals; synthesized anecdotes are not verified vendor limitations. |
| Competitors | `competitive/tally-vs-sap-b1.md`, `tally-vs-zoho-books.md`, `why-tally-wins-india.md`, `tally-switching-analysis.md`: module boundaries and adoption costs. |
| Product history | `data/overview.md`, `versions.md`, `history-timeline.md`, `pricing.md`, `technical-specs.md`: background; do not treat dated prices/benchmarks as requirements. |
| Developer context | `developer/tdl-language-spec.md`, `tdl-complete-guide.md`, `xml-api-reference.md`, `xml-api-complete.md`, `rest-api-options.md`: future adapter risks, not permission for direct browser/local-service access. |
| Ecosystem | `ecosystem/github-repos.md`, `integrations-complete.md`: named service providers and possible handoff categories; no dependency selected from this catalog. |
| Visual references | `images/diagrams/index.md`, `logos/index.md`, `screenshots/index.md`: context only; vendor assets are not product assets. |

Seven substantive files are easily missed by a Markdown-only search:

| Actual path | Content |
|---|---|
| `knowledge/competitive/tally-vs-` | Tally versus Odoo comparison. |
| `knowledge/competitive/tally-vs-bus` | Tally versus BUSY comparison. |
| `knowledge/competitive/t` | Expanded Tally switching-cost analysis. |
| `knowledge/complaints/what` | Expanded list of Tally limitations. |
| `knowledge/developer/x` | Expanded XML API and integration reference. |
| `knowledge/features/banking` | Banking feature reference; outside operational delivery scope. |
| `knowledge/ux` | Accessibility audit; useful design questions, not a verified accessibility certification. |

The operational feature bodies and workflow sections inform the scope below. Peripheral
catalogs provide context, not an instruction to reproduce every Tally module.

## Verified vendor features

**VERIFIED FROM PUBLIC SOURCE**. Each row records documented functionality, not our implementation status.

| Source | Relevant documented feature |
|---|---|
| [ERPNext Work Order](https://docs.frappe.io/erpnext/work-order) | Work orders identify production quantity and BOM material requirements; production plans can originate from sales orders. |
| [ERPNext Job Card](https://docs.frappe.io/erpnext/job-card) | Operation/workstation progress, material-transfer references, time, quantities and in-process inspection. |
| [ERPNext Production Plan](https://docs.frappe.io/erpnext/production-plan) | Demand, BOM explosion, projected availability and purchase/transfer requirements. |
| [Odoo 19 Shop Floor](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/shop_floor/shop_floor_overview.html) | Scheduled operation cards, predecessor/material readiness, instructions, lot registration and quality checks before production close. |
| [ERPNext Quality Inspection](https://docs.frappe.io/erpnext/quality-inspection) | Incoming, in-process and outgoing checks; templates, numeric ranges, value-based criteria and inspector/verifier identity. |
| [Odoo 19 Quality](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/quality.html) | Quality control points, checks, measurements, failure locations and quality alerts. |
| [Odoo 19 Lots](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/product_tracking/lots.html) | Lot movement history from receipt and storage through manufacturing and shipment. |
| [ERPNext Subcontracting](https://docs.frappe.io/erpnext/subcontracting) | Supplied-material custody, supplier warehouses, processing receipts and consumed-material reconciliation. |
| [Tally manufacturing](https://help.tallysolutions.com/manage-inventory-in-manufacturing-tally/) | BOM inputs, manufacturing outputs, process-location movement, by-products and scrap. |
| [BUSY manufacturing](https://busy.in/accounting-software/manufacturing/) | BOM material planning, WIP, job work, consumption and wastage/scrap records. |
| [SAP Business One MRP](https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/44e98a287851363de10000000a1553f6.html) | Inventory/demand/supply-based material planning with recommendations and configured planning rules. |

ERPNext's Job Card documentation distinguishes pending production from process loss.
**DESIGN PROPOSAL**: incomplete quantity stays pending; never silently classify it as scrap.

Fastener-specific vendor checks add a useful cross-check:

- [Udyog fastener ERP](https://www.udyogsoftware.com/fastener-manufacturing-erp-software)
  advertises size/thread/grade/coating variants, heat/lot traceability, packing conversions,
  routing, WIP, outsourced processes and scrap/yield visibility.
- [eManage engineering ERP](https://emanage.in/engineering-erp-software) advertises drawings,
  routings, inspection plans, heat-number custody through job work and processor evidence.

These are **VERIFIED FROM PUBLIC SOURCE vendor claims**. Heat treatment, plating, particular
standards and specific gauges remain **OPEN QUESTIONS** for any actual customer factory.

## Delivery proposal: keep UX-4 and UX-5

Their core features are necessary. Replacing these phases with unrelated modules would
leave accepted orders disconnected from actual production and quality evidence.

| Order | DESIGN PROPOSAL | Acceptance evidence |
|---|---|---|
| 1 | Demand board with accepted order lines, dates, planned/unplanned quantities and engineering readiness. | Planned quantity cannot exceed eligible demand; stale or wrong revisions are blocked. |
| 2 | Revision-pinned work orders with BOM material requirements and shortage explanation. | Available, reserved, held and expected stock remain distinct; expected receipts never count as consumable stock. |
| 3 | Material issue/unused return tied to work order and job card; explicit WIP custody. | Released lots only; no negative stock, double issue or return beyond remaining custody. |
| 4 | Ordered operation job cards with work centre, instructions, progress and blocker reasons. | Prerequisites, permissions and quantity bounds enforced by the server; partial work stays pending. |
| 5 | Production output into a new held lot, with consumed-lot links and output/scrap accounting. | Retry creates no duplicate output; closure cannot leave unexplained material or job balances. |
| 6 | Approved inspection-plan versions and incoming/in-process/final queues. | No invented tolerances or sampling; readings preserve precision, units, plan and inspector identity. |
| 7 | Quality review, release/reject and NCR containment/disposition with reason and reviewer. | Failed, incomplete or unresolved quality evidence blocks stock use and dispatch. |
| 8 | Forward/backward genealogy and certificate evidence linked to packing/shipment records. | Investigator can trace output to supplied lots and the corresponding operational events. |

**OPEN QUESTIONS**: actual work-centre/shift policy, issue/consumption rules, permitted
process loss, sampling, gauges, concessions, certificate format and dispatch evidence.
Generic SAMPLE configuration can demonstrate these boundaries; it cannot assert factory SOP.
Capacity screens should show configured workload, not invented rates, OEE or promised throughput.

## Essential later backlog

**INDUSTRY PATTERN**, converted to implementation tasks only after the matching dependency is available:

- Controlled variant masters and customer drawing/item references; immutable approved engineering changes.
- Approved UOM and packing conversions, with explicit weight-versus-piece reconciliation where measured.
- Vendor job-work orders, outward custody, partial returns, shortages and processor certificates.
- Split/merge/rework genealogy without overwriting original lot or inspection records.
- Lot-labelled packing, package quantities, partial dispatch and customer-return containment.
- Backlog, shortages, WIP aging, stock movement, receipt delay, NCR aging and scrap/yield reports.
- Private drawing/certificate storage, controlled export/import and reconciliation receipts.
- Relevant tooling/gauge calibration and work-centre maintenance readiness when the factory uses them.
- Reliable installation, recovery, audit, roles and automated tenant/quantity/QC regression tests.

Retail POS, ecommerce, marketing, payroll, banking and tax-filing suites are outside this
factory-operations plan. Any later accounting handoff is a separately governed adapter.

## Why implementation agencies still earn

**VERIFIED FROM PUBLIC SOURCE**: vendors explicitly describe services beyond the software.

- [Frappe's partner role](https://docs.frappe.io/partner-guide/role-of-frappe-partners)
  includes implementation, custom features, support, annual maintenance and marketplace apps.
- [Frappe ecosystem](https://frappe.io/partner/frappe-ecosystem) separates hosting/product
  services from partner consultation, customization and maintenance.
- [Odoo implementation packs](https://www.odoo.com/pricing-packs) cover requirements analysis,
  configuration, data import, training and adapted business flows.
- Knowledge-named [Infintrix](https://infintrixtech.com/erpnext-for-manufacturing) describes
  manufacturing setup, migration, customization and adoption with standard features first.
- [Nova Technosys](https://www.novatechnosys.com/solutions/erp-for-manufacturers) advertises
  a Tally manufacturing extension across procurement, planning, inventory, quality and approvals.
- [Mark IT](https://www.markitsolutions.in/about.html) offers training, customization,
  integration and support; [PrecisionTech](https://precisiontech.in/casestudies/tally/)
  describes two-way integrations with business applications and portals.

**INFERENCE**: a standard ERP supplies common primitives. Customers pay agencies to map real
processes, clean/migrate data, fit documents and integrations, train users and own support.
That service demand does not justify unnecessary modules or a new general ledger.
No source reviewed establishes agency profit margins or guarantees profitable customization.
