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

## Amendment (2026-10-10): Manual secret-gated runner

The repository provides a manually triggered `Hosted E2E` workflow. It requires the deployed test URL, isolated
Supabase URL, service-role key and test email as GitHub Actions secrets, fails before Playwright when any is absent,
and is not part of the normal push CI. The service-role key exists only in the runner environment and is never a
Cloudflare Pages build variable.

## Amendment (2026-10-10): Local disposable-session runner

`pnpm e2e` also supports a local-only disposable SAMPLE user authenticated by an ignored password environment
variable. Playwright creates its session through Supabase Auth and passes only that session to the local preview;
the browser never receives a service-role key. This makes the existing manufacturing path executable automatically
on an empty development project while preserving the passwordless magic-link path for hosted CI.
