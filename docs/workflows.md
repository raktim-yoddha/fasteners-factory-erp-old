# Implemented workflows

**DESIGN PROPOSAL**: configurable generic workflows tested with fictional SAMPLE records. Factory SOP remains unverified; rules live in `AGENTS.md`.

| Operator job | Sequence | Server gate |
|---|---|---|
| Commercial | RFQ lines → line feasibility → priced quote → review/approval → PO/order acceptance | Company, revision, approved engineering/specification/customer-reference pins |
| Purchasing | Requisition → bounded supplier PO allocations → approval → partial receipts/returns | Locked demand, exact units, no overreceipt/overreturn; receipts enter QC hold |
| Production | Approved output-basis recipe → bounded work → ordered jobs → issue/consume/unused return → held output → close | Predecessors, custody, loss/output reconciliation and quality/disposition |
| Quality | Draft criteria/gauges → review/approve → complete readings → pass/fail → NCR disposition → release | Current inspection, configured samples, gauge readiness and resolved containment |
| Vendor work | Outward custody → partial return/loss → inspected return → close | Released unreserved issue, bounded custody and genealogy |
| Split/merge | Eligible source lots → explicit transformation → held destination → inspect/release | Conservation, compatible items/units and immutable source links |
| Dispatch | Reservation → bounded lot packages → partial gate-out → return containment | Current QC, actual remaining allocation and signed ledger entries |
| Equipment | Asset → calibration/maintenance/hold → pending-job assignment | Current evidence rechecked at actual start/inspection |
| Capacity | Plant shift/breaks → minute allocation → pending release/cancel | Serialized overlap/capacity checks; no inferred rates |
| Access | Existing approved account → membership/roles → deactivate or amend | Protected permission, revision and last-admin guard |
| Import/export | CSV → saved preview → apply/reconcile; signed events → snapshot → review/approve/export | Revalidation, no overwrite, exact values/currency, immutable approved snapshot |

Each transition uses one named/whitelisted server command with auth, active-company permission, state/revision,
unit/quantity and idempotency checks. Uncertain retries retain their key for unchanged input. Success appears after
confirmation. No browser multi-table transition or offline mutation queue exists.

Scanners enter exact identifiers plus Enter; ambiguous matches need selection. Lot/package labels carry identity
and recorded contents, not stale availability/QC claims. Search, durable record tabs, paged links, ledger/audit history
and reports supply read-only context. Private drawings/certificates use protected Storage and hash/size verification.

Offline reload restores the shell; backend responses are not service-worker cached. Update prompts require save/copy
and explicit reload confirmation. Automated rollback/browser and encrypted restore evidence are in `docs/testing.md`.
