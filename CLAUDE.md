# Engineering Contract (AGENTS.md = CLAUDE.md)

This file is mandatory for every coding agent working in this repository.

**`AGENTS.md` and `CLAUDE.md` are one document in two files** (Claude reads `CLAUDE.md`, other agents
read `AGENTS.md`). Whenever you change either one, make the identical change to the other in the
same commit; a test fails when they differ. Never let them drift.

**This contract is the hub.** Every rule and process an agent must follow lives here. Other docs
(design, architecture, product spec, ADRs, READMEs) explain and record; they never add a rule an
agent must follow. A new rule goes here first, in both files, with a check when it can be checked.

## Source of Truth

Read in this order:

1. `AGENTS.md` (this file)
2. `FASTENER_ERP_MASTER_BRIEF.md` (product intent; a design proposal until verified)
3. `docs/product.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/open-questions.md`
4. `docs/tasks/TASKS.md` and the task you are working on
- relevant `adr/*.md` (how and when to write one: "ADRs" below)

If implementation and documentation disagree, do not silently choose one. Find out which is stale
and fix that one (and record the decision as an ADR when the rules below require one).

## Project Rules

**Product.** Fastener Factory OS: an internal, authenticated, installable PWA that runs a
fastener / precision-component factory from sales enquiry to dispatch. MVP targets **Windows
(installed PWA in Edge/Chrome)** and **Android (installed PWA in Chrome)**. iOS, Electron and React
Native are out of scope until an ADR says otherwise.

**Decided stack (change only by ADR).** React + Vite + TypeScript (strict), no Next.js. Tailwind CSS +
shadcn/ui. React Router. TanStack Query for server state; Zustand only for local UI state that must be
global. `vite-plugin-pwa` (Workbox). Supabase (PostgreSQL, Auth, RLS, Storage, Realtime where
justified, SQL migrations, Edge Functions). Zod at ingress, database constraints as final
enforcement. pnpm, one committed lockfile, pinned versions. No custom Node backend unless an ADR
shows Supabase cannot meet a concrete requirement. Check current official docs before using any
Supabase or dependency feature.

**Network model.** Cloud Supabase; the factory Wi-Fi only needs internet (ADR 0003). Critical writes
(stock, QC, job close, dispatch) are online-only. Offline means app shell, cached read-only screens
and clearly labelled local drafts. Never show success before the server confirms.

**Factory truth.** The brief is a design proposal, not Nitin Fasteners' real SOP. Label every
process claim `VERIFIED FROM FACTORY`, `VERIFIED FROM PUBLIC SOURCE`, `INDUSTRY PATTERN`,
`DESIGN PROPOSAL` or `OPEN QUESTION`. Never invent customers, machines, suppliers, rates or QC
criteria; development and demo data is fictional and marked `SAMPLE`.

**Domain integrity.**

1. The 16 stages are a navigation backbone, not one status field. Each object (rfq, quotation,
   sales_order, work_order, job_card, stock_movement, inspection, ncr, packing_order, shipment) has
   its own state machine, validated server-side.
2. Stock is an append-only signed ledger with idempotency keys. On-hand, reserved, QC-hold, WIP, at-vendor
   and available-to-promise are derived, never independent mutable truth. Negative stock is rejected.
3. Multi-entity or stock/QC/approval/dispatch changes run as one trusted server-side command (Postgres
   RPC or Edge Function) with auth, transition, quantity, revision and idempotency checks. Components
   never write several tables for a business transition. Errors are structured
   (`INSUFFICIENT_AVAILABLE_STOCK`, `LOT_QC_HOLD`, `INVALID_TRANSITION`, `REVISION_CONFLICT`).
4. BOM, routing and drawing versions are immutable once approved; quotes, orders and work orders pin
   version IDs. Lot genealogy survives split, merge, rework and packing.
5. Money and measurements are `NUMERIC` with unit and currency, never JS floats alone. Store UTC,
   display in plant timezone, show units everywhere, never convert silently.
6. Corrections are reversal events, never edits of ledger or audit rows.

**Security.** Authorization is enforced in the database and backend, never only by hiding UI. RLS on
every exposed table, scoped by `company_id`/plant; permissions live in protected tables, not user
metadata. Secret and service-role keys never reach the browser or any `VITE_*` variable. Storage
buckets are private. Audit log is append-only. No real customer or factory data until the owner
approves it. No real emails, WhatsApp, tax documents or production deploys without explicit user approval.

**AI is optional.** AI lives behind a backend gateway with provider adapters, feature flags
(`AI_ENABLED` plus per-capability), quotas and audit. AI output is an untrusted suggestion; it never
posts stock, approves QC, commits a quote or dispatches goods, and never does arithmetic the database
can do. Every core workflow must pass its tests with AI off. No AI work before milestone L8.

**UI.** Operations tool, not a marketing site. Touch targets large on tablet and phone, barcode/QR
entry, clear confirmation and recovery. Status is label + icon + reason, never colour alone;
`blocked` and `urgent` are different things. Show `Blocked because …`.

**Work protocol.** Inspect repo, docs, `docs/tasks/TASKS.md` and ADRs, then pick the smallest task,
state files and tests, build one vertical slice at a time using fictional data, validate, update docs,
report. Every task lives in `docs/tasks/TASK-NNNN-slug.md` from the template in `docs/tasks/README.md`.
Never mark a task DONE without the exact validation command and result. Two agents never edit the
same feature or migration at once; a task lists the files and interfaces it touches; DB and
architecture changes are reconciled in `docs/architecture.md` in the same change.

**Docs map (explain only; rules live here).** `docs/product.md` scope and roles;
`docs/architecture.md` system and deployment; `docs/roadmap.md` milestones L0-L9;
`docs/open-questions.md` unresolved discovery items; `docs/tasks/` delivery board. When first needed,
the agent creates `docs/style.md`, `docs/domain-model.md`, `docs/workflows.md`, `docs/ai.md`,
`docs/security.md`, `docs/testing.md` from the brief's matrix (Part K3). Decisions are recorded in
`adr/`, not a `decisions.md`.

## Core Rules

1. **Reuse before creating.** Search the repository before adding a component, hook, service,
   utility or adapter; extend what exists. Never duplicate functionality.
2. **Keep layers apart.** Presentational components receive typed props and actions; they don't
   fetch, persist, spawn processes or touch the filesystem.
3. **Narrow, typed boundaries** around privileged work (filesystem, processes, secrets, network).
4. **Design tokens only.** No scattered raw sizes, colors or radii; add a token centrally if needed.
5. **Accessibility.** Keyboard access, labels on icon buttons, visible focus, meaningful semantics.
6. **No silent product decisions.** If a requirement is ambiguous and affects architecture or UX:
   check the docs, the code and the ADRs; if still unclear, ask the user and record the answer as an ADR.
7. **Keep files focused.** A file that mixes screen layout, domain logic, persistence and I/O is a
   design failure; split by responsibility.
8. **Preserve existing work.** Understand why code exists, find its consumers and tests before
   changing it; prefer incremental refactors over rewrites.
9. **Privacy.** No real person's data (names, emails, usernames, home paths, accounts, keys) in
   source, tests, fixtures or prompts. Use neutral placeholders (`Alex`, `/home/me`).
10. **Tests** for every non-trivial logic change. Typecheck, lint and tests pass before a commit.
11. **Conventional Commits.** `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `build:`, `chore:`,
    `refactor:`, `perf:`, `style:`; a breaking change adds `!` or a `BREAKING CHANGE:` body.
    Releases are computed from these, so the type must be honest.
12. **Never bypass checks.** No `--no-verify`, no skipped hooks, no edited generated files, no
    force-push to `main`.

## Releases & Semantic Versioning

This project always follows [Semantic Versioning 2.0.0](https://semver.org): `MAJOR.MINOR.PATCH`.

- **PATCH** — bug fixes only, no behavior change.
- **MINOR** — new features, or a deliberate user-visible change (even one made in `fix` commits).
- **MAJOR** — breaking changes (data format, removed behavior). Before 1.0 a breaking change is a
  MINOR step (SemVer §4).
- Prereleases: `1.4.0-beta.1`, `1.4.0-rc.1`. Build metadata (`+…`) is never used for releases.

**The command is `release`.** When the user says "release" (in any wording), the agent decides the
version itself and releases, with no further confirmation — the word is the approval:

1. Run `pnpm release next`. It prints the next version and why (breaking → MAJOR, `feat` →
   MINOR, other user-facing commits → PATCH; docs, tests, CI and chores alone → nothing to release).
   If there is nothing to release, tell the user and stop.
2. Check the suggestion against the commits (a deliberate user-visible change in a `fix` is MINOR).
   Never skip a number.
3. Write the notes at the top of `CHANGELOG.md` as `## Unreleased — Title`: a title of up to
   ~10 words, then two to six `- ` highlights. They say what changed for the user, in the product's
   words, present tense; no code names, file names or ADR numbers; no marketing; a fix is written as
   the problem that is gone; a breaking change comes first and starts with "Breaking:".
4. Run `pnpm release X.Y.Z --check`. On failure do **not** release: report the exact reason and
   the valid next versions.
5. Run `pnpm release X.Y.Z` on `main`. Unrelated uncommitted work is never included:
   stash it (`git stash push -- <paths>`) and restore it afterwards. The script stamps the changelog,
   bumps every version file, commits `chore(release): vX.Y.Z`, tags `vX.Y.Z` and pushes.
6. The tag starts `.github/workflows/release.yml` (it attaches the built web app as a zip to the GitHub release). Watch the run; report the
   release URL, or the failing step verbatim, and ship the fix as the next PATCH.

If the user names a version ("release 1.4.0"), use it only if `--check` accepts it.
Never edit a version by hand, never reuse a tag, never skip the check.

## ADRs (Architecture Decision Records)

`adr/` is the project's memory of *why*. Every agent writes ADRs; this section is the only place
the process is described.

**An ADR is required when a change:**

- carries a product decision the user made (what the product does, or never does)
- adds or changes behavior users see (a feature, a removed option, a new default)
- adds or widens a permission, an API or IPC surface, or a server endpoint
- changes stored data, a file format, a protocol or a shared contract
- adds a dependency, a tool, a build or release step, or a CI workflow
- changes or adds a rule in this contract

**Not needed for:** bug fixes that restore intended behavior, refactors with no behavior change,
styling within the design tokens, tests, and typo-level docs.

**How:**

1. Read the related ADRs first. If one already covers the subject, add an
   `## Amendment (YYYY-MM-DD): …` section to it instead of writing a new one.
2. Otherwise create `adr/NNNN-short-kebab-name.md` with the next free number (highest + 1),
   from `adr/TEMPLATE.md`: title, "Decided by …, YYYY-MM-DD.", Context, Decision, Consequences.
3. Never rewrite the decision of an existing ADR: amend it, or write a new ADR that says
   "Supersedes ADR XXXX".
4. Commit the ADR with the change it explains, and mention its number where the rule is enforced
   in code (`// ADR 0007`).

`scripts/contract.test.mjs` fails on a bad file name, a duplicate or skipped number, a title that
doesn't match, or a missing section.

## Definition of Done

```text
[ ] Behavior matches the product spec; UI matches the design docs
[ ] Reused existing code; no duplicate logic
[ ] Types, lint and tests pass
[ ] Docs updated; ADR written or amended when required
[ ] AGENTS.md and CLAUDE.md are still identical
```
