# Open questions

Unresolved items. When one is answered, record it (an ADR if the contract's ADR rules apply), then delete
it here. Label: OPEN QUESTION. Nothing here may be hard-coded as fact.

## Needed before L1 ends
- Q1 answered: Cloudflare Pages is the static PWA host (ADR 0006). A custom domain remains open; its
  `pages.dev` URL is sufficient for initial HTTPS install tests.
- Q2 answered: a cloud Supabase project is provisioned in `ap-northeast-1`. Validate plant latency before the
  pilot; billing ownership remains with the product owner.
- Q3 answered: English only for the initial release (ADR 0006).
- Q4 answered for the initial release: Windows 11 Chrome and Android phone Chrome. Exact Android model/
  OS remains needed before device acceptance testing.
- Q5 Expected users and concurrency for the pilot, SKUs and daily movements.
- Q6: keyboard-wedge Code 39 and browser label sheets are implemented. Exact scanner/printer models, print dimensions and physical scan/readability evidence remain open; no camera/device driver is assumed.

## Needed before the matching milestone
- Q7 (L3) Currency, tax (GST) treatment and numbering formats for quotes, SO, PO, challans.
- Q8 (L4) Do suppliers give heat/lot certificates today? Which UOMs (kg, pcs, bundles) and how are kg-pcs conversions measured?
- Q9 (L5) Real machine groups, shifts and how WIP is tagged on the floor.
- Q10 (L6) Real QC plans, gauges, calibration and concession rules.
- Q11 (L7) Required dispatch documents (invoice, e-way bill) and whether an existing accounting tool must be integrated.
- Q12 (L8) Approved document retention, import mappings and accounting export ownership.

## Standing discovery list
Brief Part O (15 factory questions) still applies when a real factory pilot is chosen; the owner decided on
a generic product with fictional data for now, so those interviews are not blocking.


## Operational defaults and unresolved evidence (2026-10-12)

Owner delegated defaults: Cloudflare Pages/cloud Supabase; Windows Chrome/Android Chrome; keyboard-wedge Code 39 and
browser printing; nightly 03:30 plant-time encrypted exports retained 30 days and weekly SAMPLE restore proof (ADR 0018).
Exact live URL/project/credentials, backup/key custody and schedule activation remain unconfigured. A paid plan was not
purchased. Actual hardware models, real factory mappings/SOP/QC/calibration and a complete hosted restore drill need
verified evidence. `docs/pilot-acceptance.example.json` starts pending and the production gate refuses fake completion.


## Dual-authority owner decisions (2026-10-12)

The owner selected separate complete solo workspaces, optional cloud backup, and explicit masters/opening-balance
promotion with readable solo history. Automatic bidirectional shared-record sync is excluded. ADR 0019/spec/TASK-0017
record the design; runtime local feature parity is still implementation work, not part of prior cloud completion.
