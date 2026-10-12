import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { authIssues, acceptanceIssues, databaseIssues } from './check-operations.mjs'
import { backupKey, openBackup, sealBackup } from './backup-format.mjs'
import { collectBackup } from './create-backup.mjs'
import { databaseRunner } from './operations-db.mjs'

describe('encrypted recovery snapshots', () => {
  const key = randomBytes(32).toString('base64')
  it('preserves exact binary contents, randomizes ciphertext and rejects tampering or the wrong key', () => {
    const entries = [{ name: 'database.dump', bytes: Buffer.from([0, 255, 1, 129]) }, { name: 'private/part.pdf', bytes: Buffer.from('SAMPLE private evidence') }]
    const first = sealBackup(entries, key), second = sealBackup(entries, key)
    expect(first.equals(second)).toBe(false)
    expect(first.includes(Buffer.from('SAMPLE'))).toBe(false)
    expect(openBackup(first, key).get('database.dump')).toEqual(entries[0].bytes)
    expect(openBackup(first, key).get('private/part.pdf')).toEqual(entries[1].bytes)
    first[first.length - 1] ^= 1
    expect(() => openBackup(first, key)).toThrow('authentication failed')
    expect(() => openBackup(second, randomBytes(32).toString('base64'))).toThrow('authentication failed')
  })
  it('rejects malformed keys, repeated entries and unsupported archives', () => {
    expect(() => backupKey('password')).toThrow()
    expect(() => sealBackup([{ name: 'same', bytes: Buffer.alloc(0) }, { name: 'same', bytes: Buffer.alloc(0) }], key)).toThrow('duplicate')
    expect(() => openBackup(Buffer.from('plain'), key)).toThrow('header')
  })
  it('verifies and unpacks through the CLI using fixed filenames and refuses an existing output directory', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sample-backup-')), file = join(directory, 'sample.fferp'), output = join(directory, 'unpacked')
    const manifest = { format: 1, objects: [{ entry: 'object-0', bucket: 'factory-evidence', path: '../../outside.pdf' }] }
    const archive = sealBackup([{ name: 'database.dump', bytes: Buffer.from('SAMPLE dump') }, { name: 'manifest.json', bytes: Buffer.from(JSON.stringify(manifest)) }, { name: 'object-0', bytes: Buffer.from('SAMPLE file') }], key)
    writeFileSync(file, archive)
    try {
      const result = spawnSync(process.execPath, ['scripts/read-backup.mjs', '--file', file, '--extract', output], { encoding: 'utf8', env: { ...process.env, ERP_BACKUP_KEY: key } })
      expect(result.status, result.stderr).toBe(0)
      expect(readFileSync(join(output, 'object-0'), 'utf8')).toBe('SAMPLE file')
      expect(result.stdout).not.toContain('../../outside.pdf')
      const repeated = spawnSync(process.execPath, ['scripts/read-backup.mjs', '--file', file, '--extract', output], { encoding: 'utf8', env: { ...process.env, ERP_BACKUP_KEY: key } })
      expect(repeated.status).toBe(1)
      expect(readFileSync(join(output, 'object-0'), 'utf8')).toBe('SAMPLE file')
    } finally {
      // Only fixed files in this exclusively created temp directory; no recursive deletion.
      for (const name of ['database.dump', 'manifest.json', 'object-0']) {
        try { unlinkSync(join(output, name)) } catch { /* May not exist if an assertion failed before unpack. */ }
      }
      try { rmdirSync(output) } catch { /* A failed unpack may not create it. */ }
      unlinkSync(file); rmdirSync(directory)
    }
  })
  it('refuses inconsistent snapshots, missing files and incorrect Storage metadata', async () => {
    const objects = [{ bucket: 'factory-evidence', path: 'SAMPLE.pdf', metadata: { size: 3 } }]
    let fingerprints = 0
    const sql = (query) => query.includes('storage.objects') ? JSON.stringify(objects) : JSON.stringify({ version: ++fingerprints })
    await expect(collectBackup({ sql, dump: () => Buffer.from('dump'), download: async () => Buffer.from('abc') })).rejects.toThrow('changed during backup')
    await expect(collectBackup({ sql, dump: () => Buffer.from('dump'), download: async () => Buffer.from('wrong') })).rejects.toThrow('size differs')
    await expect(collectBackup({ sql, dump: () => Buffer.from('dump'), download: async () => { throw new Error('missing') } })).rejects.toThrow('missing')
  })
  it('includes every private object and its recoverable original bucket/path in a stable snapshot', async () => {
    const objects = Array.from({ length: 103 }, (_, i) => ({ bucket: 'factory-evidence', path: `folder/part-${i}.pdf`, metadata: { size: 3 } }))
    const result = await collectBackup({ sql: (query) => query.includes('storage.objects') ? JSON.stringify(objects) : '[]', dump: () => Buffer.from('dump'), download: async () => Buffer.from('abc') })
    const restored = openBackup(sealBackup(result.entries, key), key)
    const manifest = JSON.parse(restored.get('manifest.json').toString())
    expect(result.objects).toBe(103)
    expect(manifest.objects.at(-1).path).toBe('folder/part-102.pdf')
    expect(restored.get(manifest.objects.at(-1).entry).toString()).toBe('abc')
  })
})

describe('deployment holds', () => {
  it('rejects mismatched projects, untrusted database hosts and transaction-pool endpoints before connecting', () => {
    const ref = 'abcdefghijklmnopqrst'
    expect(() => databaseRunner({ ERP_PROJECT_REF: ref, ERP_DATABASE_URL: 'postgres://postgres:placeholder@untrusted.example:5432/postgres' })).toThrow('matching Supabase')
    expect(() => databaseRunner({ ERP_PROJECT_REF: ref, ERP_DATABASE_URL: `postgres://postgres.otherproject:placeholder@aws-0-region.pooler.supabase.com:5432/postgres` })).toThrow('matching Supabase')
    expect(() => databaseRunner({ ERP_PROJECT_REF: ref, ERP_DATABASE_URL: `postgres://postgres:placeholder@db.${ref}.supabase.co:6543/postgres` })).toThrow('matching Supabase')
    expect(() => databaseRunner({ ERP_PROJECT_REF: ref, ERP_DATABASE_URL: `postgres://postgres:placeholder@db.${ref}.supabase.co:5432/postgres` })).not.toThrow()
  })
  it('requires RLS, private buckets, every company administrator and exact migration history', () => {
    const valid = { unprotected_tables: 0, public_buckets: 0, active_admins: 1, companies_without_admin: 0, migrations: ['001', '002'] }
    expect(databaseIssues(valid, ['001', '002'])).toEqual([])
    expect(databaseIssues({ ...valid, unprotected_tables: 1, public_buckets: 1, active_admins: 0, companies_without_admin: 1, migrations: ['001'] }, ['001', '002'])).toHaveLength(5)
  })
  it('rejects open sign-up, unverified password protection and wildcard/wrong redirects', () => {
    const config = { disable_signup: true, password_hibp_enabled: true, site_url: 'https://factory.example', uri_allow_list: 'https://factory.example' }
    expect(authIssues(config, config.site_url)).toEqual([])
    expect(authIssues({ ...config, disable_signup: false, password_hibp_enabled: false, uri_allow_list: 'https://*.example' }, 'https://other.example')).toHaveLength(4)
  })
  it('cannot substitute software emulation or stale evidence for real device/factory acceptance', () => {
    const now = Date.parse('2026-10-12T12:00:00Z')
    expect(acceptanceIssues({}, now)).toHaveLength(5)
    const evidence = { status: 'verified', reviewer: 'Factory owner', checked_at: '2026-10-12T10:00:00Z', evidence: 'Acceptance log reference' }
    const record = Object.fromEntries(['factory_configuration', 'windows_install', 'android_install', 'scanner_printer', 'production_restore'].map((id) => [id, evidence]))
    expect(acceptanceIssues(record, now)).toEqual([])
    expect(acceptanceIssues(record, Date.parse('2027-10-12T12:00:00Z'))).toHaveLength(5)
  })
  it('ships security headers without caching the service worker indefinitely', () => {
    const headers = readFileSync('public/_headers', 'utf8')
    expect(headers).toContain("frame-ancestors 'none'")
    expect(headers).toContain("script-src 'self'")
    expect(headers).toContain('X-Content-Type-Options: nosniff')
    expect(headers).toMatch(/\/sw\.js\s+Cache-Control: no-cache, no-store, must-revalidate/)
  })
})
