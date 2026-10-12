import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

export const testSupabaseUrl =
  process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
export const testSupabasePublishableKey =
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY

export async function authenticateSampleUser(page: Page) {
  if (
    !testSupabaseUrl ||
    !testSupabasePublishableKey ||
    !process.env.E2E_TEST_EMAIL
  )
    throw new Error(
      'E2E requires the isolated Supabase URL, publishable key and SAMPLE test account. See docs/testing.md.',
    )
  if (process.env.E2E_ALLOW_SAMPLE_WRITES !== '1')
    throw new Error(
      'Set E2E_ALLOW_SAMPLE_WRITES=1 only for an isolated SAMPLE environment. E2E never silently skips.',
    )
  const client = createClient(testSupabaseUrl, testSupabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const result = process.env.E2E_TEST_PASSWORD
    ? await client.auth.signInWithPassword({
        email: process.env.E2E_TEST_EMAIL,
        password: process.env.E2E_TEST_PASSWORD,
      })
    : await (async () => {
        if (!process.env.E2E_SUPABASE_SERVICE_ROLE_KEY)
          throw new Error(
            'E2E requires either the SAMPLE password or runner-only service-role key.',
          )
        const admin = createClient(
          testSupabaseUrl,
          process.env.E2E_SUPABASE_SERVICE_ROLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } },
        )
        const { data, error } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email: process.env.E2E_TEST_EMAIL!,
        })
        if (error)
          throw new Error(
            `E2E sign-in link setup failed (${error.code ?? 'auth error'}).`,
          )
        return client.auth.verifyOtp({
          token_hash: data.properties.hashed_token,
          type: 'magiclink',
        })
      })()
  if (result.error || !result.data.session)
    throw new Error(
      `SAMPLE authentication failed (${result.error?.code ?? 'session unavailable'}).`,
    )
  const { data: companies, error } = await client
    .from('companies')
    .select('name')
  if (error || companies?.some((company) => !company.name.startsWith('SAMPLE')))
    throw new Error(
      'E2E refuses a non-SAMPLE company or unreadable environment.',
    )
  const session = result.data.session
  // Supabase's default storage key is project-scoped; no access token is placed in the navigation URL or logs.
  await page.addInitScript(
    ({ session, project }) =>
      localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify(session)),
    { session, project: new URL(testSupabaseUrl).hostname.split('.')[0]! },
  )
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Fasteners Factory ERP', exact: true }),
  ).toBeVisible({ timeout: 20_000 })
  return client
}
