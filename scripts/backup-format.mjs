// ADR 0018: encrypted operator backups; this module never runs in the browser.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

const magic = Buffer.from('FFERPB01')
export const backupLimit = 256 * 1024 * 1024
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
export function backupKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('ERP_BACKUP_KEY must be a base64-encoded random 32-byte key.')
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32 || key.toString('base64') !== value) throw new Error('Invalid backup key.')
  return key
}
export function sealBackup(entries, keyValue) {
  const key = backupKey(keyValue)
  let total = 0
  const seen = new Set()
  const files = entries.map(({ name, bytes }) => {
    if (typeof name !== 'string' || !name || seen.has(name) || !Buffer.isBuffer(bytes)) throw new Error('Invalid or duplicate backup entry.')
    seen.add(name); total += bytes.length
    if (total > backupLimit) throw new Error('Backup exceeds the 256 MiB limit. Configure a larger-capacity backup service before rollout.')
    return { name, sha256: digest(bytes), data: bytes.toString('base64') }
  })
  const payload = gzipSync(Buffer.from(JSON.stringify({ version: 1, created_at: new Date().toISOString(), files })))
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(magic)
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()])
  return Buffer.concat([magic, iv, cipher.getAuthTag(), ciphertext])
}
export function openBackup(bytes, keyValue) {
  const key = backupKey(keyValue)
  if (!Buffer.isBuffer(bytes) || bytes.length < 37 || bytes.length > backupLimit * 2 || !bytes.subarray(0, 8).equals(magic)) throw new Error('Invalid backup header or size.')
  let payload
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(8, 20))
    decipher.setAAD(magic); decipher.setAuthTag(bytes.subarray(20, 36))
    payload = JSON.parse(gunzipSync(Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]), { maxOutputLength: backupLimit * 2 }).toString('utf8'))
  } catch { throw new Error('Backup authentication failed: wrong key, corruption or unsupported payload.') }
  if (payload.version !== 1 || !Array.isArray(payload.files)) throw new Error('Unsupported backup format.')
  const result = new Map(); let total = 0
  for (const file of payload.files) {
    if (typeof file.name !== 'string' || !file.name || result.has(file.name) || typeof file.data !== 'string') throw new Error('Invalid backup entries.')
    const data = Buffer.from(file.data, 'base64'); total += data.length
    if (total > backupLimit || digest(data) !== file.sha256) throw new Error('Backup entry integrity failed.')
    result.set(file.name, data)
  }
  return result
}
