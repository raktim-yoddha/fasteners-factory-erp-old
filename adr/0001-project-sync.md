# ADR 0001 — Agent contract, ADRs, releases and CI

Decided by the product owner, 2026-10-09.

## Context

The project starts from one source document, `FASTENER_ERP_MASTER_BRIEF.md`, and will be built by
several different coding agents over time. They need one rulebook, a decision log and a repeatable
release process, each enforced by checks.

## Decision

- `AGENTS.md` and `CLAUDE.md` are byte-identical; `GEMINI.md` points to `AGENTS.md`. Cursor and Copilot
  pointers are not created (owner uses Claude, Codex-style agents and Gemini); add them later by ADR.
- This differs from the brief (Part K2), which has `CLAUDE.md` delegate to `AGENTS.md`: the identical-file
  rule is kept because a test can enforce it. The brief's `docs/decisions.md` is replaced by `adr/`.
- Every rule lives in `AGENTS.md`; the brief and `docs/` explain and never add rules.
- Releases use the `release` command, Conventional Commits and SemVer, starting at `0.1.0`
  (docs-only). GitHub holds the code; CI runs on push and pull request; a tag `vX.Y.Z` publishes a
  GitHub Release with the built web app zip attached.
- CI runs on `ubuntu-latest` only: Windows and Android are the devices the PWA runs on, not build targets.
- `typecheck`, `lint` and `build` are placeholders that print a message until TASK-0001 creates the app.
- Branch protection is not applied yet; the owner decides once CI is green.

## Consequences

Agents cannot drift apart silently. The release workflow ships nothing but notes until a real build
exists. Replacing the placeholders is part of TASK-0001.
