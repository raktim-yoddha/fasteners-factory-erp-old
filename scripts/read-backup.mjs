// ADR 0018: inspect or unpack into a NEW runner-owned directory; never restores a database.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openBackup } from './backup-format.mjs'

try {
  const at = process.argv.indexOf('--file'), source = at >= 0 ? process.argv[at + 1] : null
  if (!source) throw new Error('Provide --file for an encrypted .fferp archive.')
  const entries = openBackup(readFileSync(source), process.env.ERP_BACKUP_KEY)
  const database = entries.get('database.dump'), manifestBytes = entries.get('manifest.json')
  if (!database || !manifestBytes) throw new Error('Backup database or manifest is missing.')
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  if (manifest.format !== 1 || !Array.isArray(manifest.objects) || manifest.objects.some((object, i) => object.entry !== `object-${i}` || !entries.has(object.entry))) throw new Error('Backup manifest is invalid.')
  const out = process.argv.indexOf('--extract')
  if (out >= 0) {
    const directory = process.argv[out + 1]
    if (!directory || directory.startsWith('--')) throw new Error('Provide a NEW output directory after --extract.')
    // mkdir is exclusive. Entries supply no filesystem path; output names are fixed or ordinal.
    mkdirSync(directory, { mode: 0o700 })
    writeFileSync(join(directory, 'database.dump'), database, { flag: 'wx', mode: 0o600 })
    writeFileSync(join(directory, 'manifest.json'), manifestBytes, { flag: 'wx', mode: 0o600 })
    manifest.objects.forEach((object, i) => writeFileSync(join(directory, `object-${i}`), entries.get(object.entry), { flag: 'wx', mode: 0o600 }))
    console.log('Backup unpacked into the new directory. It contains sensitive plaintext; original bucket/path mappings are in manifest.json. No database or Storage service was changed.')
  }
  console.log(`Backup verification PASS: ${manifest.objects.length} private objects and an authenticated database dump.`)
} catch {
  console.error('Backup verification FAIL: missing/wrong key, corrupt archive, invalid manifest, or unavailable/non-new output directory.'); process.exitCode = 1
}
