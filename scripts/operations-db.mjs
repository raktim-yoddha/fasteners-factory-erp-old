// ADR 0018: runner-only database boundary; no password in argv or diagnostics.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

export function databaseRunner(env = process.env, local = false) {
  const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1]
  if (!project) throw new Error('Local Supabase project ID is unavailable.')
  const container = `supabase_db_${project}`
  let options = ['-U', 'postgres', '-d', 'postgres'], extra = [], childEnv = { ...env }
  if (!local) {
    const ref = env.ERP_PROJECT_REF
    if (!/^[a-z]{20}$/.test(ref ?? '')) throw new Error('ERP_PROJECT_REF is required.')
    let connection
    try { connection = new URL(env.ERP_DATABASE_URL) } catch { throw new Error('ERP_DATABASE_URL is required.') }
    const user = decodeURIComponent(connection.username)
    const direct = connection.hostname === `db.${ref}.supabase.co` && user === 'postgres'
    const pool = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(connection.hostname) && user === `postgres.${ref}`
    if (!['postgres:', 'postgresql:'].includes(connection.protocol) || (!direct && !pool) || connection.pathname !== '/postgres' || !connection.password || (connection.port && connection.port !== '5432')) throw new Error('Use the matching Supabase direct or session-pool connection on port 5432.')
    options = ['-h', connection.hostname, '-p', '5432', '-U', user, '-d', 'postgres']
    extra = ['-e', 'PGPASSWORD', '-e', 'PGSSLMODE']
    childEnv = { ...env, PGPASSWORD: decodeURIComponent(connection.password), PGSSLMODE: 'require' }
  }
  function execute(command, args, input, binary = false) {
    const result = spawnSync('docker', ['exec', '-i', ...extra, container, command, ...options, ...args], { env: childEnv, input, encoding: binary ? null : 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 120_000 })
    if (result.error || result.status !== 0) throw new Error(`${command} failed. Check database connectivity, permissions and Docker; command output is redacted.`)
    return result.stdout
  }
  return {
    sql: (query) => execute('psql', ['--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1'], `set statement_timeout='90s';\n${query}`).trim(),
    dump: () => execute('pg_dump', ['--format=custom'], undefined, true),
  }
}

// Shared with restore proof; fingerprints contain hashes and counts, never rows.
export const fingerprintSql = `
set timezone='UTC';
create temporary table restore_fingerprints(name text,rows bigint,digest text,rls boolean,policies integer);
do $$ declare r record;n bigint;h text;begin
 for r in select n.nspname,c.relname,c.relrowsecurity,(select count(*) from pg_policy p where p.polrelid=c.oid) policies from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private','auth','storage','supabase_migrations') order by n.nspname,c.relname loop
  execute format('select count(*),md5(coalesce(string_agg(h,'''' order by h),'''')) from (select md5(to_jsonb(t)::text) h from %I.%I t) rows',r.nspname,r.relname) into n,h;
  insert into restore_fingerprints values(r.nspname||'.'||r.relname,n,h,r.relrowsecurity,r.policies);
 end loop;
end $$;
select coalesce(jsonb_agg(to_jsonb(f) order by name),'[]'::jsonb) from restore_fingerprints f;
`
export const lastJson = (output) => JSON.parse(output.trim().split(/\r?\n/).at(-1))
