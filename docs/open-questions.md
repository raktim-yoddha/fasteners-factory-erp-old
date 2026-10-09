# Open questions

Unresolved items. When one is answered, record it (an ADR if the contract's ADR rules apply), then delete
it here. Label: OPEN QUESTION. Nothing here may be hard-coded as fact.

## Needed before L1 ends
- Q1 answered: Cloudflare Pages is the static PWA host (ADR 0006). A custom domain remains open; its
  `pages.dev` URL is sufficient for initial HTTPS install tests.
- Q2 Supabase plan and region (an India region is likely best for latency). Who owns the account and pays?
- Q3 answered: English only for the initial release (ADR 0006).
- Q4 answered for the initial release: Windows 11 Chrome and Android phone Chrome. Exact Android model/
  OS remains needed before device acceptance testing.
- Q5 Expected users and concurrency for the pilot, SKUs and daily movements.
- Q6 deferred: no camera, scanner, Bluetooth/USB hardware or label printer support is in L1. Revisit
  before L4 warehouse workflows.

## Needed before the matching milestone
- Q7 (L3) Currency, tax (GST) treatment and numbering formats for quotes, SO, PO, challans.
- Q8 (L4) Do suppliers give heat/lot certificates today? Which UOMs (kg, pcs, bundles) and how are kg-pcs conversions measured?
- Q9 (L5) Real machine groups, shifts and how WIP is tagged on the floor.
- Q10 (L6) Real QC plans, gauges, calibration and concession rules.
- Q11 (L7) Required dispatch documents (invoice, e-way bill) and whether an existing accounting tool must be integrated.
- Q12 (L8) AI provider, data-sharing policy, monthly budget; any need for on-premises AI.

## Standing discovery list
Brief Part O (15 factory questions) still applies when a real factory pilot is chosen; the owner decided on
a generic product with fictional data for now, so those interviews are not blocking.
