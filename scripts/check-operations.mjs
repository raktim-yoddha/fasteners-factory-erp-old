// ADR 0018: read-only deployment gate. Missing evidence is a failure, never a skip.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { databaseRunner, lastJson } from './operations-db.mjs'

export const operationsSql = `select jsonb_build_object(
 'unprotected_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity),
 'public_buckets',(select count(*) from storage.buckets where public),
 'active_admins',(select count(distinct r.user_id) from public.user_company_roles r join public.company_memberships m on m.company_id=r.company_id and m.user_id=r.user_id where m.active and r.role='admin'),
 'companies_without_admin',(select count(*) from public.companies c where not exists(select 1 from public.user_company_roles r join public.company_memberships m on m.company_id=r.company_id and m.user_id=r.user_id where r.company_id=c.id and m.active and r.role='admin')),
 'migrations',(select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations)
);`
export function databaseIssues(status, expected) {
  const issues = []
  if (status.unprotected_tables !== 0) issues.push('Exposed tables lack RLS.')
  if (status.public_buckets !== 0) issues.push('Storage buckets must be private.')
  if (!(status.active_admins > 0)) issues.push('No active company administrator.')
  if (status.companies_without_admin !== 0) issues.push('A company lacks an active administrator.')
  if (JSON.stringify(status.migrations) !== JSON.stringify(expected)) issues.push('Applied migration versions differ from source.')
  return issues
}
export function authIssues(config, deployUrl) {
  const issues = []
  if (config.disable_signup !== true) issues.push('Public Auth sign-up must be disabled.')
  if (config.password_hibp_enabled !== true) issues.push('Hosted Auth leaked-password protection is disabled or unverified.')
  if (config.site_url !== deployUrl) issues.push('Auth Site URL differs from the deployment URL.')
  const redirects = (config.uri_allow_list ?? '').split(',').map((url) => url.trim()).filter(Boolean)
  if (!redirects.includes(deployUrl) || redirects.some((url) => url !== deployUrl)) issues.push('Auth redirects must list only the exact production URL.')
  return issues
}
export function acceptanceIssues(record, now = Date.now()) {
  const issues = []
  for (const id of ['factory_configuration', 'windows_install', 'android_install', 'scanner_printer', 'production_restore']) {
    const evidence = record?.[id], date = Date.parse(evidence?.checked_at ?? '')
    if (evidence?.status !== 'verified' || typeof evidence?.evidence !== 'string' || !evidence.evidence.trim() || typeof evidence?.reviewer !== 'string' || !evidence.reviewer.trim() || !Number.isFinite(date) || date > now || now - date > 90 * 86_400_000) issues.push(`${id}: dated verification evidence is missing or stale.`)
  }
  return issues
}
async function main() {
  const local = process.argv.includes('--local')
  const expected = readdirSync('supabase/migrations').filter((file) => /^\d+_.+\.sql$/.test(file)).map((file) => file.split('_')[0]).sort()
  const db = databaseRunner(process.env, local)
  const issues = databaseIssues(lastJson(db.sql(operationsSql)), expected)
  if (!local) {
    const ref = process.env.ERP_PROJECT_REF, token = process.env.SUPABASE_ACCESS_TOKEN
    let deploy
    try { deploy = new URL(process.env.ERP_DEPLOY_URL) } catch { throw new Error('ERP_DEPLOY_URL is required.') }
    if (deploy.protocol !== 'https:' || deploy.username || deploy.password || deploy.search || deploy.hash || deploy.pathname !== '/' || ['localhost', '127.0.0.1'].includes(deploy.hostname)) throw new Error('Production deployment requires an HTTPS origin.')
    const deployUrl = deploy.origin
    if (!token) throw new Error('Runner-only SUPABASE_ACCESS_TOKEN is required to verify hosted Auth configuration.')
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000), redirect: 'error' })
    if (!response.ok) throw new Error('Hosted Auth configuration could not be verified; response redacted.')
    issues.push(...authIssues(await response.json(), deployUrl))
    if (!process.env.ERP_ACCEPTANCE_FILE || !existsSync(process.env.ERP_ACCEPTANCE_FILE)) issues.push('Production acceptance evidence file is missing.')
    else issues.push(...acceptanceIssues(JSON.parse(readFileSync(process.env.ERP_ACCEPTANCE_FILE, 'utf8'))))
    if (process.env.ERP_BACKUP_ENABLED !== 'true') issues.push('Encrypted nightly backup scheduling has not been enabled.')
    const backupDate = Date.parse(process.env.ERP_LAST_BACKUP_AT ?? '')
    if (!Number.isFinite(backupDate) || backupDate > Date.now() || Date.now() - backupDate > 36 * 3_600_000) issues.push('A successful encrypted backup within 36 hours is required.')
    // Read-only checks of the actual host; never issue production business commands.
    for (const path of ['/', '/records/lot/00000000-0000-0000-0000-000000000000', '/manifest.webmanifest', '/sw.js']) {
      const page = await fetch(`${deployUrl}${path}`, { signal: AbortSignal.timeout(30_000), redirect: 'error' })
      if (!page.ok || (path === '/manifest.webmanifest' && !page.headers.get('content-type')?.includes('json')) || (path === '/sw.js' && !/javascript/.test(page.headers.get('content-type') ?? ''))) issues.push(`Deployment asset or route failed: ${path}`)
      if (path === '/' && (!page.headers.get('content-security-policy')?.includes("frame-ancestors 'none'") || page.headers.get('x-content-type-options') !== 'nosniff')) issues.push('Deployment security headers are missing.')
    }
  }
  if (issues.length) { for (const issue of issues) console.error(`BLOCKED: ${issue}`); process.exitCode = 1 }
  else console.log(`Operations checks PASS (${local ? 'local SAMPLE configuration only; production acceptance not asserted' : 'configured production target and supplied evidence'}).`)
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/check-operations.mjs')) {
  main().catch((error) => { console.error(`Operations checks FAIL: ${error.message} See docs/deployment.md.`); process.exitCode = 1 })
}
