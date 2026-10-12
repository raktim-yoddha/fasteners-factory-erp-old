import { z } from 'zod'

// ADR 0019: portable solo snapshots are authenticated ciphertext, including document BLOBs.
const magic = new TextEncoder().encode('FFERPS01')
const limit = 128 * 1024 * 1024
const headerSchema = z.object({ version: z.literal(1), schema: z.literal(1), workspace_id: z.uuid(), created_at: z.iso.datetime(), sha256: z.string().regex(/^[a-f0-9]{64}$/), salt: z.string().length(24), iv: z.string().length(16), iterations: z.literal(310000) })
function base64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)) }
function unbase64(text: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(text), (value) => value.charCodeAt(0)) }
export async function snapshotDigest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('')
}
async function key(secret: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (secret.length < 12 || secret.length > 1024) throw new Error('Use a backup passphrase of at least 12 characters.')
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function sealSoloSnapshot(bytes: Uint8Array<ArrayBuffer>, workspaceId: string, secret: string) {
  if (bytes.length > limit || bytes.length < 100 || new TextDecoder().decode(bytes.slice(0, 16)) !== 'SQLite format 3\0') throw new Error('INVALID_SQLITE_SNAPSHOT')
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const header = headerSchema.parse({ version: 1, schema: 1, workspace_id: workspaceId, created_at: new Date().toISOString(), sha256: await snapshotDigest(bytes), salt: base64(salt), iv: base64(iv), iterations: 310000 })
  const encoded = new TextEncoder().encode(JSON.stringify(header)), prefix = new Uint8Array(12 + encoded.length)
  prefix.set(magic); new DataView(prefix.buffer).setUint32(8, encoded.length); prefix.set(encoded, 12)
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: prefix }, await key(secret, salt), bytes))
  const file = new Uint8Array(prefix.length + encrypted.length); file.set(prefix); file.set(encrypted, prefix.length)
  return { file, header }
}
export async function openSoloSnapshot(file: Uint8Array<ArrayBuffer>, secret: string) {
  if (file.length < 100 || file.length > limit + 4096 || !magic.every((value, index) => file[index] === value)) throw new Error('INVALID_SOLO_BACKUP')
  const size = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(8)
  if (size > 2048 || size + 28 >= file.length) throw new Error('INVALID_SOLO_BACKUP')
  const prefix = file.slice(0, 12 + size), header = headerSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.slice(12, 12 + size))))
  let bytes: Uint8Array<ArrayBuffer>
  try { bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(header.iv), additionalData: prefix }, await key(secret, unbase64(header.salt)), file.slice(prefix.length))) }
  catch { throw new Error('Backup authentication failed: wrong passphrase or damaged backup.') }
  if (await snapshotDigest(bytes) !== header.sha256 || new TextDecoder().decode(bytes.slice(0, 16)) !== 'SQLite format 3\0') throw new Error('SOLO_BACKUP_INTEGRITY_FAILURE')
  return { bytes, header }
}
