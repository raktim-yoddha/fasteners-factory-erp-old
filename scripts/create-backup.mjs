// ADR 0018: read-only snapshot; encrypted output only, never restores a live target.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { join } from 'node:path'
import { databaseRunner, fingerprintSql, lastJson } from './operations-db.mjs'
import { backupKey, backupLimit, digest, openBackup, sealBackup } from './backup-format.mjs'

export async function collectBackup({ sql, dump, download }) {
  const before = sql(fingerprintSql)
  const objects = lastJson(sql("select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name,'metadata',coalesce(metadata,'{}'::jsonb)||coalesce(user_metadata,'{}'::jsonb)) order by bucket_id,name),'[]'::jsonb) from storage.objects;"))
  if (!Array.isArray(objects) || objects.length > 50_000) throw new Error('Storage snapshot exceeds its object limit.')
  const database = dump(), entries = [{ name: 'database.dump', bytes: database }]
  let size = database.length
  if (size > backupLimit) throw new Error('Database dump exceeds backup capacity.')
  const manifest = []
  for (const object of objects) {
    if (typeof object.bucket !== 'string' || !object.bucket || typeof object.path !== 'string' || !object.path) throw new Error('Invalid Storage metadata.')
    const bytes = await download(object, backupLimit - size)
    size += bytes.length
    if (size > backupLimit) throw new Error('Storage snapshot exceeds backup capacity.')
    const expected = object.metadata?.size
    if (expected !== undefined && String(bytes.length) !== String(expected)) throw new Error('Storage object size differs from recorded metadata.')
    const expectedHash = object.metadata?.sha256
    if (expectedHash && digest(bytes) !== expectedHash) throw new Error('Storage object hash differs from recorded metadata.')
    const entry = `object-${manifest.length}`
    entries.push({ name: entry, bytes })
    manifest.push({ entry, bucket: object.bucket, path: object.path, sha256: digest(bytes), size: bytes.length })
  }
  if (sql(fingerprintSql) !== before) throw new Error('Database or file metadata changed during backup. Retry in a quiet period; no partial snapshot is published.')
  entries.push({ name: 'manifest.json', bytes: Buffer.from(JSON.stringify({ format: 1, fingerprint: lastJson(before), objects: manifest })) })
  return { entries, objects: manifest.length }
}

export function storageDownloader(url, secret) {
  return async ({ bucket, path }, remaining) => {
    const encoded = [bucket, ...path.split('/')].map(encodeURIComponent).join('/')
    const response = await fetch(`${url}/storage/v1/object/authenticated/${encoded}`, { headers: { apikey: secret, Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60_000), redirect: 'error' })
    if (!response.ok || !response.body) throw new Error('Private object download failed; response redacted.')
    const chunks = []; let total = 0
    for await (const chunk of response.body) {
      total += chunk.length
      if (total > remaining) throw new Error('Storage snapshot exceeds backup capacity.')
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
}
async function main() {
  const local = process.argv.includes('--local')
  const status = local && existsSync('.env.supabase.local') ? parseEnv(readFileSync('.env.supabase.local', 'utf8')) : {}
  const key = process.env.ERP_BACKUP_KEY; backupKey(key)
  const url = local ? status.API_URL : process.env.ERP_SUPABASE_URL
  const secret = local ? status.SERVICE_ROLE_KEY : process.env.ERP_STORAGE_SERVICE_KEY
  const expected = local ? 'http://127.0.0.1:54321' : `https://${process.env.ERP_PROJECT_REF}.supabase.co`
  if (url !== expected || !secret) throw new Error('Matching Storage URL and runner-only service credential are required.')
  const db = databaseRunner(process.env, local)
  if (local && db.sql("select exists(select 1 from public.companies) and not exists(select 1 from public.companies where name not like 'SAMPLE%') and not exists(select 1 from auth.users where email is null or email not like '%@invalid.test');").split('\n').at(-1) !== 't') throw new Error('Local backup refuses non-SAMPLE data.')
  const snapshot = await collectBackup({ ...db, download: storageDownloader(url, secret) })
  const encrypted = sealBackup(snapshot.entries, key)
  openBackup(encrypted, key) // Authentication and every entry hash must pass before publication.
  mkdirSync('backups', { recursive: true, mode: 0o700 })
  const file = join('backups', `factory-${new Date().toISOString().replaceAll(':', '-')}.fferp`)
  writeFileSync(file, encrypted, { flag: 'wx', mode: 0o600 })
  console.log(`Encrypted backup PASS: ${snapshot.objects} private objects; ${encrypted.length} encrypted bytes. Output: ${file}`)
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/create-backup.mjs')) {
  main().catch((error) => { console.error(`Backup FAIL: ${error.message} No plaintext backup is written.`); process.exitCode = 1 })
}
