# Security

Implemented generic boundaries verified with SAMPLE fixtures on local and hosted Supabase. This is not a certified production security audit. Rules live in `AGENTS.md`.

## Identity and company authorization

Browser configuration contains only the project URL/publishable key. Approved accounts use passwordless sign-in with user creation disabled. Auth, active company membership and protected role mappings govern reads/actions; user metadata is never permission truth. Administration changes existing accounts through a serialized command and protects the last active administrator. Self-access changes and sign-out clear private query caches. Company changes reset draft/paging context.

Every exposed business table has RLS. Browser grants for event/operational tables are SELECT-only. Trusted atomic commands validate auth/company permission, transition, revision, units/quantities and idempotency, then append audit/ledger truth. Anonymous/PUBLIC execution is revoked. Public SECURITY DEFINER commands intentionally permit authenticated execution: permission checks inside them provide the protected write boundary, not direct table mutation.

Search, scanner lookup, paged related records and operational views preserve caller RLS through SECURITY INVOKER where applicable. Literal filters avoid wildcard injection; bigint event IDs remain text. Read access never grants a transition.

## Documents and imports

The factory-evidence bucket is private. Drawing/certificate uploads bind company-owned records, verified byte size/hash and immutable approved revisions. Downloads recheck bytes; failed requests do not authorize replacement content. Certificate references alone are not uploaded evidence. CSV ingress is bounded/strict, persists the exact preview/source, and revalidates before atomic apply without overwrite. Approved export snapshots retain exact signed events/currencies.

## Device and delivery boundary

Service-worker cache contains static assets, not REST/Auth/Storage responses. Offline commands remain disabled; no hidden queue or server-success claim exists. Installed shell recovery was exercised automatically with an unexpired SAMPLE session. Update reload requires explicit confirmation. Cloudflare CSP restricts scripts, framing, objects and form origins; the shared policy allows only same-origin and Supabase cloud connections. Native scanner input still goes through bounded exact lookup and current RLS.

## Operations secrets and backups

Read-only backup/preflight tools run outside the browser. Database password, Management API token, Storage service credential and encryption key belong only in the operations runner. Remote connections must match the project and use encrypted direct/session-pool connections. Backup output is AES-256-GCM authenticated ciphertext with an encrypted manifest and per-entry hashes. Lost keys are unrecoverable; retain separate offline custody. Plaintext appears only after explicit unpack into a new directory. Exports reject changed sources, missing bytes and capacity overflow.

GitHub live exports are disabled until production-operations variables/secrets are configured. Only `.fferp` artifacts are uploaded; no env/plaintext dump. Routine and weekly recovery proofs use SAMPLE local DBs and owned temporary targets. Neither runs a production restore. Hosting/Auth delivery/configuration and key custody require separate recovery records.

## Hosted advisor evidence (2026-10-12)

Hosted SAMPLE advisors reported 58 authenticated SECURITY DEFINER executable warnings. These are the intentional protected command APIs; outsider/permission regressions pass. Do not grant direct browser writes or remove necessary execution merely to silence the warning. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Hosted Auth leaked-password protection remains disabled. The production gate explicitly blocks this unverified setting; source code cannot change the dashboard configuration. [Official setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). An owner-configured production environment, access review, real device evidence and actual hosted restoration are still necessary. No production deployment, real emails or real factory data were introduced.
