# Operator manual

Current generic Fasteners Factory ERP, verified with fictional SAMPLE fixtures. **DESIGN PROPOSAL** until the factory approves its actual SOP and settings. Commands require internet and authorized company access. Wait for server confirmation; a button click is not a posted operation.

## Start and find work

Sign in through the approved passwordless link, choose Active company, then open the workspace for your job. Administration assigns access only to existing approved accounts; it does not create accounts/send invitations. The first company setup is a protected one-time bootstrap.

Global search finds permitted identifiers/names. Ctrl/Cmd+K focuses it and Escape clears it. Expand Scan an identifier for an exact keyboard-wedge scan/paste plus Enter. Select a permitted match if ambiguous. Scanning opens context; it never automatically receives, releases or dispatches stock. Record tabs show overview, linked records and permitted timeline with page controls.

| Workspace | Operator job |
|---|---|
| Command center | Independent order, stock, packing and dispatch state/blockers |
| Sales orders | RFQ lines, per-line feasibility, pricing, review/approval and PO/order acceptance |
| Purchasing | Requisitions, split supplier POs, approval, partial held receipts and supplier returns |
| Stock | Lots/balances, reserve/release, held receipt, independent counts, split/merge, ledger pages and lot labels |
| Production | Controlled engineering, demand, ordered jobs, WIP/materials, output and vendor custody |
| Quality | Approved criteria, complete readings, current release checks, NCR disposition and file-backed traceability |
| Dispatch | Actual lot packages, labels, partial gate-out, cancellation and customer-return containment |
| Master data | Partners/items/locations/centres, customer parts, drawings/files, specifications and measured units |
| Equipment | Tool/gauge/machine readiness and explicit plant shifts/minute allocations |
| Reports | Unit-safe backlog, shortages, aging, quality and stock movement with pages |
| Administration | Approved staff roles/access and company audit pages |
| Data transfer | Saved CSV preview/apply/reconciliation and approved accounting snapshots |

## Configure before operations

Create plant/warehouse/location and actual customers/suppliers/items/base units/work centres. Record verified customer part references and drawing files. Review and approve a complete BOM/routing output-basis package before planning production. Configure explicit QC criteria/sample counts and relevant draft-plan gauge bindings before approving the plan. Never use fictional test tolerances for real acceptance.

Master data Specifications and units records immutable approved fastener specifications and measured item-specific alternate-unit ratios with evidence. Documents pin their version. Receiving/packing can use an approved alternate unit and retains original input plus confirmed base quantity. Do not guess kg-to-piece weights or round discrete pieces.

Equipment readiness records actual calibration/maintenance dates, result/reference/due date and holds. Link assets to pending jobs and gauges to draft plans. Missing, failed, expired or held evidence blocks start/inspection. Shift capacity uses configured plant-time start/end/breaks and explicit job minutes; it does not predict throughput.

## Enquiry to shipment

1. Create an RFQ with explicit lines, quantities/units and dates. Review each relevant line's feasibility/approved references.
2. Create a priced quotation with currency, validity and exact version pins; review saved definitions before approval. Printing an approved quote is an operational document, not a tax invoice.
3. Accept the approved quote against the customer's PO with an explicit promise date.
4. Reserve suitable released finished stock, or create bounded work against accepted demand and approved engineering.
5. Request shortages; allocate supplier POs within remaining requisition demand and approve before receiving. Every partial receipt has a distinct held lot and supplier evidence.
6. Release work into ordered jobs. Issue eligible materials, record actual consumption or unused return, account good/scrap progress and create held outputs. Predecessors/material/quantity/equipment checks explain blockers.
7. Quality records all approved-plan samples. Resolve any NCR through the authorized actual scrap/return/rework process, then release only with a current passed inspection. Holds block future use even if stock was already reserved or packed.
8. Prepare bounded package contents from remaining reservations, print lot/package identity labels, and confirm partial/final gate-out. The server posts consumption and signed shipment movement together.

Vendor work tracks outward custody, partial return/loss and close; returned lots need inspection. Controlled split/merge preserves source history and holds new lots. Private drawings/certificates remain permission-controlled with byte verification. References alone are not a certificate file or certification claim.

Customer returns must reference actual shipped quantity and always re-enter QC hold. Count corrections, inspection corrections and cancellation/return events preserve originals. Never edit ledger/audit history to fix a posted mistake.

## Failures and recovery

Read Blocked because and its reason. Refresh/review changed revisions; reduce excessive quantity; resolve actual QC/equipment/material prerequisites or request appropriate access. An unchanged uncertain retry retains the same command key; do not create duplicate paperwork after a lost confirmation.

Offline the shell may reload and already-loaded reads can remain in memory; server responses are not persistently cached. Business commands disable, drafts do not silently queue, and reload can lose unsaved fields. Save/copy before accepting an update. Reconnect and review server truth before resubmission. Sign-out removes private operational state.

## Import, accounting and printing

Data transfer first saves a strict CSV preview with exact source/errors. Correct the source and create a new preview if needed; apply only a valid saved preview and inspect reconciliation. Existing records are not overwritten. Accounting handoff is an approved signed-event CSV by currency, not direct Tally synchronization or GST filing.

Labels use unchanged supported Code 39 identifiers plus readable text; unsupported characters have a text fallback. Scan checks current stock/QC rather than trusting a printed balance. Browser print sheets exclude navigation. Selected scanner/printer size/readability and actual Windows/Android installation require physical acceptance; automatic device tests verify only software behavior.
