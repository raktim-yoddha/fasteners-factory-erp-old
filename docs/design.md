# Product interaction design

Status: **DESIGN PROPOSAL**, generic product with fictional SAMPLE data. This document explains the implementation;
the engineering contract remains in `AGENTS.md`. Visual tokens and accessibility details are in `docs/style.md`.

## Operator jobs

| Workspace | Operator task | Confirmed result |
|---|---|---|
| Sales orders | Find an enquiry; review feasibility; price, approve and accept a quotation | Independent RFQ, quote and order states with exact engineering revision IDs |
| Purchasing | Request demand; draft and approve a PO; record partial deliveries or returns | Purchase commitment, held receipt lot, signed ledger receipt/reversal and audit confirmation |
| Stock | Explain physical, reserved, QC-held and available quantities; release/reject, reserve or propose a count | Server-confirmed command; an independent reviewer approves count variances |
| Production | Review engineering; plan accepted demand; execute jobs; account for materials and output | Revision-pinned work, explicit WIP custody, incremental job quantities and held output lots |
| Quality | Approve inspection criteria; record samples; contain failures and review disposition | Immutable plans/results, current inspection release gate and traceable NCR decisions |
| Dispatch | Pack an active reservation; confirm gate-out | Exact reservation consumption and signed stock shipment movement |
| Master data | Create controlled references and record verified material/supplier requirements | Company-scoped master data with audit history |

## Commercial flow (UX-2)

The RFQ inbox filters number/requirement, customer, due date, feasibility state, creator and age. “Created by me”
means the authenticated RFQ creator, not an invented assignment system. Missing information displays its blocker.
The request detail shows lines, quantities, UOM, target dates and feasibility notes. Multiple requested and quotation
lines are supported. Additional lines are staged locally; a single command creates the document.

Commercial steps are visible buttons: Feasibility, Quotation, Approval, Order acceptance. Each view focuses on one
stage. Approved drawing/BOM/routing options remain controlled references. Feasibility revisions are pinned into quote
and order lines; mismatched items or changed pins fail at the server. “Not specified” is explicit, never an invented revision.
RFQ lines can now carry independent immutable feasibility reviews; quotation lines pin the exact selected review. Legacy whole-RFQ review remains available for compatible requests. Different lines no longer require separate enquiries solely for engineering review.

Quotation validity, currency, pricing source and order promised date are explicit fields. Prices and quantities travel
as decimal text. Approval and acceptance display the exact quote lines and pins before the action is enabled. Printing
is available from an approved quotation review; this is an operational printout, not a tax invoice.

Authorized master owners can expand customer/item creation inside Sales. Other roles receive a clear handoff to a
master-data owner. Customer record links expose permitted order commitments; order links expose quotations and packing.
Communication channels, certificate attachments, cloning/template presets and customer portals are not implied by this slice.

## Material flow (UX-3 procurement slice)

Purchase requisitions record item, demand reason, optional sales-line reference, quantity/UOM and needed date. A requisition can allocate its demand across supplier purchase orders, each with explicit supplier, price/currency and promised date. Remaining allocation is derived; concurrent drafts cannot exceed the request. Approval
precedes receiving. Each partial delivery creates a distinct internal lot in QC hold, supplier lot/heat reference,
optional certificate reference and an immutable receipt. PO positions derive net received/outstanding quantity from
receipts and returns. A reference does not claim that a certificate was uploaded, inspected or accepted.

Quality release/rejection and supplier return are distinct commands. Release requires the latest passed inspection
of the current lot revision and no unresolved NCR, including for a manually received SAMPLE finished lot.
Returns preserve reserved stock and post reversals.
Cycle counts first create proposals with the server balance/revision. Another authorized reviewer confirms the variance.
Stale proposals fail; reversing an approved count adds another ledger event. No ledger or audit row is editable.

Material masters capture specification, grade, dimensions with units, storage requirements, optional verified reorder
quantity and preferred supplier. Supplier records capture qualification evidence and certificate requirements as notes;
there is no inferred supplier certification, approval or contact information.

The stock explorer filters item/lot, location and QC state. Each card shows physical, outstanding reservation, held and
available quantities in the base UOM. Ledger drill-down pages through 100 signed events at a time with exact event IDs. Issued WIP is explained in
Production's material custody view; the Quality view follows recorded material/output genealogy. Vendor job-work records show actual outward, returned and lost quantities with remaining custody; no fabricated at-vendor zero is displayed.
The same exact balance summary appears beside reservation, supplier-return and count actions; count and variance
labels show the actual item unit. A missing balance or unit is explicit rather than shown as a guessed zero.

## Planning and production flow (UX-4)

Production separates Engineering, Demand, Shop floor, Materials and Output. The engineering editor stages components
and ordered work-centre operations for an explicitly entered output basis and base unit. It does not infer kg-to-piece
conversion, cycle time, machine rate or acceptance limits. A single command saves the package's BOM/routing drafts.
The review screen then displays the persisted basis, component quantities/units, scrap allowance and routing together
with their exact revision identifiers. Approval requires the saved-definition review checkbox; changing the selected
package clears that review. Approval freezes the engineering references used by downstream work.

Demand shows accepted sales lines, promised dates and ordered/planned/remaining-to-plan quantities. A work order
selects approved same-item engineering, an explicit production quantity, work number and start/due dates. The server
rejects overplanning and changed order pins. Work-centre queues show assigned work. Equipment supplies explicit plant-time shifts, breaks and minute allocations; missing configuration stays unconfigured. No throughput, utilization or OEE is inferred. Materials explain required quantity, released stores stock,
expected receipts, issued WIP and consumption separately; an expected purchase receipt does not satisfy available stock.

Work-order release creates job cards from the approved routing. The operator selects the current ordered job, starts
it and records incremental good/scrap quantities with a reason. A preceding incomplete operation blocks later work.
Partial progress stays in progress; uncompleted quantity does not become scrap automatically. The final operation
and production output remain blocked when required material has not been accounted as consumed.

Material issue identifies work order, job card, eligible lot, quantity and unit next to the stock balance summary.
Normal work uses released unreserved stock. The only held-lot exception is the exact source authorized by the selected
NCR rework order; it does not make that lot generally available. Issued stock leaves stores availability and remains
WIP until the operator records consumption or unused return. Return brings the source lot back into QC hold with a
ledger reversal. Return/consumption cannot exceed the remaining issued custody.

After completed operations and material checks, Output records a new lot, quantity and storage location into QC hold.
Source material issues remain linked to each actual output. Work close remains blocked until jobs, material balances,
output/scrap reconciliation and Quality release or completed disposition satisfy the server's prerequisites. A command receipt confirms the action;
it does not fabricate the next production state or hide unfinished physical work.

## Quality, NCR and genealogy flow (UX-5)

Quality separates Inspections, Plans, NCRs and Traceability. Plans define an item, version, required sample count and
one or more numeric or attribute characteristics. Numeric criteria require explicit units and signed decimal limits;
attribute criteria require an explicit expected value. No tolerance, sampling plan or gauge practice is assumed.
The saved-plan review shows every criterion and sample requirement before the approval checkbox enables approval.
Selecting another draft clears that review. Approved versions remain immutable.

Incoming inspection targets received lots; final inspection targets recorded production outputs; in-process inspection
targets an active job card. Only approved plans for the target item are offered. The form generates a named input for
every characteristic/sample, displays its unit and accepted range/value, and transports exact decimal strings without
floating-point calculation. The server confirms passed/failed; a local form submission never announces a guessed pass.
History preserves inspector, time, reason, readings and plan version. A correction selects the prior inspection and
records a reason plus a new complete result; original readings remain visible through the supersession link.

NCR containment records affected quantity/unit and reason, while placing the entire source lot on QC hold. An
authorized reviewer selects reinspection, controlled scrap, supplier return or routed rework. Reinspection keeps the
lot held. Scrap checks unreserved physical quantity. Stores must record an actual authorized supplier return;
Production must execute the explicitly numbered/dated, approved self-component rework package. These dispositions
remain awaiting physical return/rework until the actual events complete their requirements.

Stock release requires a passed current inspection and resolved containment. Held stock is blocked consistently at
reservation, normal material issue, packing and dispatch. If Quality contains a lot after it was reserved or packed,
the backend rechecks the hold before further packing or dispatch; an old preparation never bypasses containment.

Traceability follows selectable source/output lot links with work-order and material-issue references. Supplier
receipt evidence shows supplied-lot and certificate references; shipment rows show recorded destination documents
and quantities. A certificate reference alone does not claim an uploaded or verified file. Private file evidence records verified byte size/hash and permissions. Controlled split/merge events preserve source links and hold new lots; these are not certified inspection packages.

## Responsive and recovery behavior

Windows and Android use the same data/actions. Navigation scrolls horizontally on narrow screens; forms and stock
cards collapse to one column. Controls have at least 44px height, explicit names, visible focus and no hover dependency.
Automated browser assertions check 320, 375, 412, 768, 1024 and 1440px widths for page overflow and reachable controls.
These are viewport checks, not evidence of physical Android installation.

Offline leaves navigation and in-memory reads available; operational fieldsets disable commands. The service worker
caches app assets, not Supabase data. No persistent offline drafts or automatic write queue is implemented. Success
appears only after the command resolves; failures retain operator meaning and never display raw backend details.
Identity changes clear query caches. Company changes reset form context so one company's draft cannot be sent to another.

## Discovery and phase completion

UX-2's existing commercial chain is implemented and automated. The broader roadmap's acceleration options remain
future choices rather than implicit factory requirements. UX-3 procurement/stock now includes work/job material
issue and return through UX-4, and configurable incoming inspection through UX-5. Generic production and quality
workflows are implemented; **full factory acceptance remains open** for real conversion evidence, inspection practice, equipment policy, device/printing behavior and document/accounting mappings. Generic vendor custody, controlled split/merge, private files and approved item-specific conversions are implemented. No configuration demonstration is
evidence that a particular factory or certification body accepts its process.

The owner previously chose a generic SAMPLE product, so factory interviews do not block this demonstration. No SAMPLE
inspection or conversion policy may be represented as a real factory SOP. See `docs/open-questions.md`.

## Research provenance

The `knowledge/` corpus was reviewed for master-data, stock, batch/location, keyboard, drill-down, error and workflow
patterns. Financial, tax, payroll and integration claims remain research, outside this implementation. It contains
stale/missing index entries and third-party assertions; its “no external lookups required” sentence is not reliable.

- **VERIFIED FROM PUBLIC SOURCE:** Tally ERP 9 [Stock Summary](https://help.tallysolutions.com/docs/te9rel65/Reports/Display_Inventory_Reports/displaying_stock_summary.htm)
  supports stock drill-down and avoids a quantity grand total across different units. Adopt that unit discipline.
- **VERIFIED FROM PUBLIC SOURCE:** Odoo's [purchase order model](https://github.com/odoo/odoo/blob/19.0/addons/purchase/models/purchase_order.py)
  is a reference for explicit purchase state and source-document relationships. Our QC and ledger authority remain project decisions.
- **DESIGN PROPOSAL:** focused steps, clear prerequisites, base-unit-only SAMPLE receipts and reviewer separation are this
  product's choices. Neither vendor documentation verifies this factory's SOP.
- Standard production/quality patterns and customization-service evidence are recorded in
  `docs/research/standard-factory-erp.md`; sample workflows remain explicitly separated from factory verification.


## Controlled setup, evidence and operations

Master data includes customer part references and Specifications and units. Approval freezes a specification or measured
item-specific conversion; downstream documents retain its exact version. Alternate-unit receiving/packing preserves the
original input and displays the confirmed base quantity. No inferred kg-to-piece ratio or silent rounding is permitted.

Quality Traceability supports forward/backward lot relationships, vendor custody and private certificate files. Master
data manages controlled drawing revisions/files. Dispatch supports actual package contents/labels, partial gate-out,
cancelled preparation and QC-held customer returns. Labels identify current lookup codes; availability/QC is checked by
scanning rather than printed as a stale assertion.

Equipment separates readiness and shift capacity. Operators see explicit reasons for missing/failed/expired calibration,
maintenance or hold evidence; trusted start/inspection checks revalidate them. Only pending jobs receive assignment
release/capacity edits. Capacity uses configured shifts and exact minutes, never a guessed productivity metric.

Administration presents approved account IDs, protected role/access changes and paged company audit. It does not send
invitations or expose Auth emails. Data transfer saves validated CSV previews/reconciliation and approves exact signed
accounting snapshots. It does not invent GST/accounts or replace Tally's financial ledger. Reports preserve units and
page results. Related records, timeline and stock ledger expose previous/next pages instead of silently dropping history.

The scanner lives beside global search. A keyboard-wedge scan or pasted exact identifier plus Enter returns permitted
matches; ambiguity requires selection. It opens a read-only record, never executes a stock/QC/dispatch action. Shared
Code 39 SVG labels preserve the identifier; unsupported codes show a clear text fallback rather than being altered.

Desktop/Android-touch automatic tests exercise scanner, durable links, print-only content and actual offline reload.
Physical acceptance remains distinct. Production checks report explicit holds when verified factory/device settings,
backup evidence, Auth config or hosting is absent. Operational tooling stays outside operator business workflows.
