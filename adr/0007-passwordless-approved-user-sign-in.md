# ADR 0007 — Passwordless approved-user sign-in

Builds on ADR 0002. Decided by the product owner, 2026-10-09.

## Context

The installed ERP needs a safe, low-friction sign-in experience before any tenant-scoped record can be shown.
The owner has requested the complete application build and has selected Supabase as the backend, but has not
provided a factory identity provider or password policy.

## Decision

Use Supabase passwordless email links for already approved accounts. The browser calls `signInWithOtp` with
user creation disabled; account provisioning and company-role assignment remain protected backend work. The app
shows no operational data until a valid session and the configured backend are both present.

## Consequences

There is no public self-registration or browser-side role assignment. The hosted Supabase project must allow its
deployed URL as an auth redirect URL and administrators must provision users before their first sign-in. SSO or a
different identity provider can supersede this decision in a future ADR.

## Amendment (2026-10-10): Closed project defaults

The committed Supabase configuration now disables both root and email sign-up defaults. The hosted project must use
the same setting; its first approved operator is created by an administrator, not by a browser request.
