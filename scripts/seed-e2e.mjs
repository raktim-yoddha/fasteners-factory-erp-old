import { randomBytes } from 'node:crypto'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.supabase.local')
const url = process.env.API_URL
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
  throw new Error('Automatic E2E provisioning only targets local Supabase.')
const email = 'sample-e2e@invalid.test'
const saved = existsSync('.env.e2e.sample.local') ? parseEnv(readFileSync('.env.e2e.sample.local', 'utf8')) : {}
const reusable = saved.E2E_SUPABASE_URL === url && saved.E2E_TEST_EMAIL === email && saved.E2E_TEST_PASSWORD
const password = reusable || randomBytes(24).toString('base64url')
const admin = createClient(url, process.env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const client = createClient(url, process.env.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const signupProbe = await client.auth.signUp({
  email: 'sample-public-signup@invalid.test',
  password,
})
if (signupProbe.error?.code !== 'signup_disabled') {
  if (signupProbe.data.user)
    await admin.auth.admin.deleteUser(signupProbe.data.user.id)
  throw new Error(
    'Local Auth must reject public signup while permitting invited-user sign-in.',
  )
}
const reused = reusable ? await client.auth.signInWithPassword({ email, password }) : null
let companyId
if (reused?.data.user) {
  const companies = await client.from('companies').select('id,name')
  if (companies.error || companies.data?.length !== 1 || companies.data[0]?.name !== 'SAMPLE E2E Factory')
    throw new Error('Reusable local test credentials must access only the isolated SAMPLE E2E company.')
  companyId = companies.data[0].id
} else {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(`SAMPLE provisioning failed (${created.error.code ?? 'auth error'}). Existing unknown users are never overwritten.`)
  const session = await client.auth.signInWithPassword({ email, password })
  if (session.error) {
    await admin.auth.admin.deleteUser(created.data.user.id)
    throw new Error(`SAMPLE sign-in failed (${session.error.code}).`)
  }
  const bootstrap = await client.rpc('bootstrap_initial_company', { p_company_name: 'SAMPLE E2E Factory', p_plant_name: 'SAMPLE Plant' })
  if (bootstrap.error) throw new Error(`SAMPLE bootstrap failed (${bootstrap.error.code}).`)
  companyId = bootstrap.data
}
if (!reused?.data.user) {
const plant = await client
  .from('plants')
  .select('id')
  .eq('company_id', companyId)
  .single()
const warehouse = await client
  .from('warehouses')
  .insert({
    company_id: companyId,
    plant_id: plant.data?.id,
    code: 'SAMPLE-WH',
    name: 'SAMPLE Test Warehouse',
  })
  .select('id')
  .single()
const item = await client.from('items').insert({
  company_id: companyId,
  sku: 'SAMPLE-BASE',
  description: 'SAMPLE Base Item',
  base_uom: 'pcs',
})
const location = await client.from('stock_locations').insert({
  company_id: companyId,
  warehouse_id: warehouse.data?.id,
  code: 'SAMPLE-LOC',
  name: 'SAMPLE Test Location',
})
if (plant.error || warehouse.error || item.error || location.error)
  throw new Error('SAMPLE master fixture provisioning failed.')
}
const env = `E2E_SUPABASE_URL=${url}\nE2E_SUPABASE_PUBLISHABLE_KEY=${process.env.ANON_KEY}\nE2E_TEST_EMAIL=${email}\nE2E_TEST_PASSWORD=${password}\nE2E_ALLOW_SAMPLE_WRITES=1\n`
writeFileSync('.env.e2e.sample.local', env, { mode: 0o600 })
writeFileSync(
  '.env.e2e.local',
  env,
  { mode: 0o600 },
)
console.log(
  'Disposable SAMPLE user and company provisioned. Credentials written to ignored .env.e2e.local.',
)
