import { expect, it } from 'vitest'
import { openSoloSnapshot, sealSoloSnapshot } from '../../src/local/backup'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

it('authenticates the SQLite bytes and metadata; wrong secrets and damaged envelopes fail', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'sample-solo-backup-')), path = join(directory, 'sample.sqlite3')
  try {
    const db = new DatabaseSync(path)
    db.exec("CREATE TABLE sample (label TEXT); INSERT INTO sample VALUES ('SAMPLE Factory')")
    db.close()
    const bytes = new Uint8Array(readFileSync(path)), workspace = crypto.randomUUID(), secret = 'SAMPLE backup passphrase'
    const sealed = await sealSoloSnapshot(bytes, workspace, secret)
    expect((await openSoloSnapshot(sealed.file, secret)).bytes).toEqual(bytes)
    await expect(openSoloSnapshot(sealed.file, 'SAMPLE incorrect passphrase')).rejects.toThrow('Backup authentication failed')
    const corrupt = sealed.file.slice(); corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1
    await expect(openSoloSnapshot(corrupt, secret)).rejects.toThrow('Backup authentication failed')
    const header = sealed.file.slice(); header[30] = header[30]! ^ 1
    await expect(openSoloSnapshot(header, secret)).rejects.toThrow()
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
