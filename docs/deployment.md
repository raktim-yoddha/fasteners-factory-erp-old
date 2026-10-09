# Hosted deployment

Explains the deployment hand-off; rules live in `AGENTS.md`.

## Supabase

The production-like project is the cloud backend. Its database password is never stored in this repository, a Vite
variable, or a browser. The browser uses only the project URL and publishable key in the Cloudflare Pages build
variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

Before the first sign-in, the project owner must complete these dashboard-only operations:

1. In **Authentication → Users**, create the initial approved operator account and confirm its email.
2. In **Authentication → URL Configuration**, set the final Cloudflare Pages URL as Site URL and add it as an
   allowed redirect URL. Add the local development URL only when it is actively needed.
3. Do not enable public self-registration; the browser already requests passwordless links with
   `shouldCreateUser: false`.

The first approved user then opens the deployed app, requests their magic link, and uses the one-time company and
plant bootstrap screen. This creates the administrator role inside the database; it does not derive permissions
from user metadata.

## Cloudflare Pages

Connect the GitHub repository in Cloudflare Pages with build command `pnpm build` and output directory `dist`.
Set the two public Supabase build variables above in Pages. Do not add a database password, service-role key or
SMTP credential to Pages build variables.

After deployment, verify the final URL is present in Supabase Auth redirect configuration, install the PWA in
Windows Chrome and Android Chrome, then run the hosted Playwright suite using an isolated test project or branch.

## Hosted E2E runner

After creating an isolated deployment and test account, add these **GitHub Actions secrets** (not Pages variables):
`E2E_BASE_URL`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_SERVICE_ROLE_KEY` and `E2E_TEST_EMAIL`. Then manually run the
`Hosted E2E` workflow. It fails before Playwright if any secret is absent and must never point to this pilot project.
