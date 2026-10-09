# Security

**DESIGN PROPOSAL** — verify against a hosted Supabase project before production use.

## L1 authorization boundary

Browser clients use only a Supabase URL and publishable key. The service-role key never enters `.env.example`,
Cloudflare Pages configuration or the application bundle. Supabase Auth supplies identity; public tables use RLS
and permission state is held in protected tables, not `raw_user_meta_data`.

`private.is_company_member` and `private.has_company_permission` are narrowly scoped `SECURITY DEFINER`
helpers in an unexposed schema. `PUBLIC` execution is revoked; only `authenticated` can invoke them through RLS.
Every policy declares `TO authenticated`; write policies have both `USING` and `WITH CHECK`.

## Current limits

No login UI or first-admin bootstrap exists yet. Authentication method, invite flow, hosted project URL and RLS
integration proof remain open. No business data, storage bucket or service-role operation exists in the foundation.
