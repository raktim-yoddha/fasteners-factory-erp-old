# Security

**DESIGN PROPOSAL** — verify against a hosted Supabase project before production use.

## L1 authorization boundary

Browser clients use only a Supabase URL and publishable key. The service-role key never enters `.env.example`,
Cloudflare Pages configuration or the application bundle. Supabase Auth supplies identity; public tables use RLS
and permission state is held in protected tables, not `raw_user_meta_data`.

`private.is_company_member` and `private.has_company_permission` are narrowly scoped `SECURITY DEFINER`
helpers in an unexposed schema. `PUBLIC` execution is revoked; only `authenticated` can invoke them through RLS.
Every policy declares `TO authenticated`; write policies have both `USING` and `WITH CHECK`.

## Auth and command boundaries

Passwordless email links use `shouldCreateUser: false`, and the committed Supabase configuration disables both root
and email sign-up. An administrator must create the first approved Auth user; the browser never provisions users or
assigns roles. The hosted project must retain that Auth setting and list the deployed HTTPS URL as an allowed redirect.

Transactional public RPCs are intentionally `SECURITY DEFINER`: each explicitly revokes anonymous and `PUBLIC`
execution, requires `auth.uid()`, then validates the caller's protected company permission. The read-only
`get_order_command_center` RPC follows the same pattern and requires `sales.read`; it is the only cross-domain
read used by the browser Command Center.

## Current limits

There is no user-invitation UI, real factory data, storage bucket, service-role browser operation or deployed Pages
URL yet. Passwordless email delivery, installation on the target Windows and Android devices, and unskipped browser
E2E remain deployment acceptance work.
