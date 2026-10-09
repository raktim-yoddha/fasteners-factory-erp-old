# Fasteners Factory ERP — Foundation Design and Delivery Strategy

## Status

**DESIGN PROPOSAL** — reviewed in chat on 2026-10-09; implementation begins only after the owner approves this file.

## Product decisions

- The product is named **Fasteners Factory ERP**.
- The initial interface is English-only.
- The application is an installable PWA for Windows 11 Chrome and Android Chrome.
- Cloudflare Pages hosts the static PWA. Supabase is the entire backend: Auth, PostgreSQL, RLS, Storage, migrations, RPCs and Edge Functions. There is no custom Node backend.
- The L1 foundation excludes camera, barcode/QR scanning, Bluetooth/USB scanners and all other hardware integrations. Those are later, separately approved operational workflows.
- Every manufacturing process remains a **DESIGN PROPOSAL** until validated through factory discovery. Development and demo data is fictional and marked `SAMPLE`.

## Delivery strategy

The ERP is delivered as verified vertical slices. A slice may introduce only the data, commands, UI and tests needed for its acceptance criteria. No task creates inert future screens or bypasses trusted backend boundaries.

| Phase | Outcome | Delivery gate |
|---|---|---|
| L0 — Discovery | Confirm the operational assumptions, pilot volume, device constraints and fictional sample narratives. | Every unconfirmed process remains labelled; no real factory data is imported. |
| L1 — Foundation | Installable React/Vite PWA, Supabase local project, deployment-ready configuration, real checks and a signed-out shell. | Installs on agreed Chrome devices; offline shell state is explicit; CI is green. |
| L1 — Access control | Supabase Auth, companies/plants, permissions, RLS and append-only audit base. | UI and API both deny an unauthorized action. |
| L2 — Master data | Scoped customers, suppliers, items, drawings, locations and work centres using `SAMPLE` records. | RLS, validation and audit proof are present for each exposed entity. |
| L2 — Order context | Immutable BOM/routing versions, global identifier search and Order Command Center skeleton. | Concurrent sales/material/quality/packing status is visible without a false single status. |
| L3 — Order and stock | RFQ through sales order plus append-only finished-goods reservation. | The reservation command rejects concurrent over-allocation and reports a structured error. |
| L3 — Packing and shipment | Packing, idempotent shipment confirmation and traceability for the SAMPLE finished-goods path. | The same request cannot reduce stock twice; order/lot/carton history is traceable. |
| L3 — MVP hardening | Windows/Android demo, acceptance scenarios and operational polish. | Applicable Part M scenarios pass with AI disabled. |
| L4 — Material operations | Purchase receipt, lots, QC hold, ledger movement, issue/return and scanner workflow only if approved. | Transaction, quantity-conservation and concurrency checks pass. |
| L5 — Manufacturing | Work orders, job cards, WIP, output/scrap/rework and tablet workflows. | Version pinning and WIP conservation are proven. |
| L6 — Quality and subcontract | Inspections, NCR/rework, external custody and finished-goods release. | QC gates cannot be bypassed through the UI or API. |
| L7 — Dispatch and reports | Labels, partial shipment, gate-out, traceability and exception reporting. | Shipment/reversal audit and report reconciliation pass. |
| L8 — Optional AI | Flagged, auditable suggestions behind a backend gateway. | AI-off workflows pass; AI cannot commit transactional truth. |
| L9 — Evidence-led extensions | Only extensions justified by pilot use: scheduling, maintenance, finance integrations or native clients. | A new ADR and focused task justify each addition. |

The existing task sequence is retained: TASK-0001 foundation; 0002 access control; 0003 master data; 0004 versioning and command center; 0005 order thread; 0006 stock reservation; 0007 packing/dispatch; 0008 hardening. TASK-0005 and TASK-0006 may be developed independently after TASK-0004, but TASK-0007 waits for both.

## L1 foundation design

### Application structure

`src/app` owns composition, providers and the one signed-out route. `src/pwa` owns installation, update and network-state presentation. `src/lib` owns the narrow Supabase client boundary. Presentational UI components receive typed props and actions; they do not call Supabase or browser APIs directly.

The shell is intentionally small: product identity, a concise statement that the system is being prepared, an install control where Chrome provides one, browser guidance otherwise, and an accessible online/offline status. It does not imply that any operational action is available offline or that a backend action succeeded.

### PWA and deployment

Vite produces `dist`. `vite-plugin-pwa` produces the manifest, service worker and update lifecycle. The shell assets are cached for offline display; no business data or mutation queue is added. Cloudflare Pages builds the repository using `pnpm build` and serves `dist` over HTTPS. Preview URLs are adequate for install testing until a custom domain is selected.

### Supabase boundary

The browser receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`/legacy anon key through deployment configuration. There is no service-role key, database password or secret in the repository, client bundle or `VITE_*` variable. The repository includes Supabase CLI configuration and an empty, CLI-generated migration so subsequent schema work has a tested migration path. The hosted project is configured later through deployment variables; development runs against local Supabase.

No public business table, Auth UI, role model, RLS policy or server-side command is introduced in L1. TASK-0002 creates those together, then proves them.

### Tooling and verification

Pinned dependencies and the committed pnpm lockfile provide React, Vite, TypeScript, React Router, TanStack Query, `@supabase/supabase-js`, Zod, Tailwind/shadcn prerequisites, `vite-plugin-pwa`, ESLint and Vitest. A focused component-test setup proves the shell renders and PWA state components communicate the correct accessible status. CI runs `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`. The release workflow always archives the successful `dist` output.

Manual acceptance evidence is recorded against the actual Windows 11 Chrome and Android Chrome devices: install, standalone launch, update prompt and offline-shell behavior.

## Failure handling

- A missing public Supabase configuration makes the connection state explicit; it never substitutes fake operational data or reports a successful connection.
- Unsupported installation APIs show concise Chrome guidance, never claim the app is installed.
- Offline mode displays cached shell availability only; there are no mutation controls or queued writes.
- Future command errors retain the contract error codes and server-confirmed state model in `AGENTS.md`.

## Planned L1 changes

`package.json`, `pnpm-lock.yaml`, Vite/TypeScript/ESLint configuration, `index.html`, `src/app/**`, `src/pwa/**`, `src/lib/**`, `src/components/ui/**`, `public/**`, `supabase/**`, `tests/unit/**`, `.env.example`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `docs/style.md`, `docs/testing.md`, `docs/architecture.md`, `docs/tasks/TASK-0001-foundation.md`, `docs/tasks/TASKS.md`, `README.md`, and ADRs.

`AGENTS.md` and `CLAUDE.md` change together to rename the product, with an ADR. The master brief retains its historic placeholder title and is not silently rewritten.

## Commit and integration discipline

- Commit the approved design separately as documentation.
- Each completed task is one or more small Conventional Commits after its exact validation commands pass.
- Do not push, deploy, create hosted accounts or use production data without explicit authorization. Adding the requested `origin` remote does not authorize a push.
- Before a task is marked `DONE`, record its exact validation commands and results in its task file.

## Out of scope for L1

Authentication screens, user/role data, business entities, factory workflows, stock, inspection, AI, hardware access, real company data, payments and production deployment.

## Design review checklist

- No placeholder or undecided behavior is presented as implemented.
- L1 delivers the foundation in TASK-0001 and does not expand to later business stages.
- Supabase remains the authoritative backend and no browser secret is required.
- The plan preserves existing ADR-backed constraints and makes later phases conditional on verified evidence.
