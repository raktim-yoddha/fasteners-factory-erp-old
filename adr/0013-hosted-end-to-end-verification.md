# ADR 0013 — Hosted end-to-end verification

Builds on ADR 0002, ADR 0003 and ADR 0007. Decided by the product owner, 2026-10-10.

## Context

Unit tests verify browser adapters and migration structure, but they cannot prove the authenticated browser flow,
RLS policies and protected Postgres commands work together against Supabase.

## Decision

Use Playwright against a fresh disposable hosted Supabase project or database branch. The test runner receives a
service-role key only as a secret to generate the approved test user's passwordless link; it never exposes the key
to the browser. The suite runs SAMPLE records through bootstrap, master data, commercial, stock and dispatch flows.

## Consequences

Hosted E2E requires a deployed app URL, provisioned test user and freshly migrated isolated database. It is skipped
when secrets are absent and must never target the pilot or production tenant.
