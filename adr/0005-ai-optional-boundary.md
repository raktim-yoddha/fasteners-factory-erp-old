# ADR 0005 — AI is a separate optional layer, deferred to milestone L8

Builds on ADR 0004. Decided by the product owner, 2026-10-09.

## Context

The owner wants the system AI-ready without letting AI touch operational truth or adding early cost.

## Decision

AI sits behind a backend gateway with provider adapters, feature flags (`AI_ENABLED` and per
capability), budgets and audit, and its output is a suggestion a human accepts, corrects or rejects. No AI
code is built before L8; until then the only obligation is not to design the core in a way that blocks
it (stable ids, document storage, event outbox). Every core workflow must pass with AI off.

## Consequences

The MVP carries no AI cost or data-sharing risk. Adding AI later needs a provider choice and a
data-sharing decision by the owner, both open questions.
