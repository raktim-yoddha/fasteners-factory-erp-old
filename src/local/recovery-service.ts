import { z } from 'zod'
import { getCloudConnection } from '@/lib/supabase'
import { localRequest } from './client'
import { openSoloSnapshot, sealSoloSnapshot, snapshotDigest } from './backup'
import { cutoverReceiptSchema } from './cutover'
import type { LocalRequest } from './protocol'

const identitySchema = z.object({ id: z.uuid(), workspace_id: z.uuid(), state: z.enum(['active', 'archived']) })
const backupSchema = z.object({ id: z.uuid(), owner_id: z.uuid(), workspace_id: z.uuid(), ciphertext_sha256: z.string(), snapshot_sha256: z.string(), byte_size: z.number(), object_path: z.string(), status: z.enum(['pending', 'ready']), created_at: z.string() })
export type SoloBackup = z.infer<typeof backupSchema>
const intentSchema = z.object({ id: z.uuid(), company_id: z.uuid(), cloud_owner_id: z.uuid(), reason: z.string(), snapshot_sha256: z.string().nullable(), backup_id: z.uuid().nullable() })
export const previewSchema = z.object({ blockers: z.array(z.string()), masters: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))), openings: z.array(z.object({ source_lot_id: z.uuid(), item_id: z.uuid(), location_id: z.uuid(), lot_code: z.string(), quantity: z.string(), uom: z.string() })), source_company_id: z.uuid() })
export type SoloPreview = z.infer<typeof previewSchema>
export async function deviceRequest(request: LocalRequest) {
  const result = await localRequest(request)
  if (result.error) throw new Error(result.error.message)
  return result.data
}
export async function soloExport(secret: string) {
  const identity = identitySchema.parse(await deviceRequest({ operation: 'identity' }))
  const snapshot = z.instanceof(Uint8Array).parse(await deviceRequest({ operation: 'snapshot' }))
  return sealSoloSnapshot(snapshot as Uint8Array<ArrayBuffer>, identity.workspace_id, secret)
}
export function downloadSoloBackup(file: Uint8Array<ArrayBuffer>) {
  const url = URL.createObjectURL(new Blob([file], { type: 'application/octet-stream' })), anchor = document.createElement('a')
  anchor.href = url; anchor.download = `factory-solo-${new Date().toISOString().slice(0, 10)}.fferp`; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
export async function restoreSoloBackup(file: File, secret: string) {
  if (file.size > 128 * 1024 * 1024 + 4096) throw new Error('Backup exceeds the 128 MiB limit.')
  const opened = await openSoloSnapshot(new Uint8Array(await file.arrayBuffer()), secret)
  return z.uuid().parse(await deviceRequest({ operation: 'restore', bytes: opened.bytes, workspaceId: opened.header.workspace_id }))
}
export function activateSoloFile(id: string) {
  z.uuid().parse(id)
  const previous = localStorage.getItem('factory-solo-file') ?? 'original'
  const files = z.array(z.string()).catch([]).parse(JSON.parse(localStorage.getItem('factory-solo-files') ?? '[]'))
  localStorage.setItem('factory-solo-files', JSON.stringify([...new Set([...files, previous, id])]))
  localStorage.setItem('factory-solo-file', id); window.location.assign('/')
}
export function retainedSoloFiles(): string[] {
  try { return z.array(z.string().refine((value) => value === 'original' || z.uuid().safeParse(value).success)).parse(JSON.parse(localStorage.getItem('factory-solo-files') ?? '[]')) } catch { return [] }
}
export function openRetainedSoloFile(id: string) {
  if (!retainedSoloFiles().includes(id)) throw new Error('UNKNOWN_RETAINED_WORKSPACE')
  if (id === 'original') localStorage.removeItem('factory-solo-file')
  else localStorage.setItem('factory-solo-file', id)
  window.location.assign('/')
}
export async function cloudOwner() {
  const cloud = getCloudConnection(), { data, error } = await cloud.auth.getUser()
  if (error || !data.user) throw new Error('Sign in to team mode first, then return to solo for optional account backup.')
  return { cloud, ownerId: data.user.id }
}
export async function listCloudBackups() {
  const { cloud, ownerId } = await cloudOwner()
  const [backups, companies] = await Promise.all([cloud.from('solo_backups').select('*').eq('owner_id', ownerId).eq('status', 'ready').order('created_at', { ascending: false }), cloud.from('companies').select('id,name').order('name')])
  if (backups.error) throw backups.error
  if (companies.error) throw companies.error
  return { backups: z.array(backupSchema).parse(backups.data), companies: z.array(z.object({ id: z.uuid(), name: z.string() })).parse(companies.data) }
}
export async function uploadSoloBackup(sealed: Awaited<ReturnType<typeof soloExport>>, id = crypto.randomUUID()) {
  const { cloud } = await cloudOwner(), hash = await snapshotDigest(sealed.file)
  const begun = await cloud.rpc('begin_solo_backup', { p_id: id, p_workspace_id: sealed.header.workspace_id, p_ciphertext_sha256: hash, p_snapshot_sha256: sealed.header.sha256, p_byte_size: sealed.file.length })
  if (begun.error) throw begun.error
  const metadata = backupSchema.parse(begun.data)
  const upload = await cloud.storage.from('solo-backups').upload(metadata.object_path, sealed.file, { contentType: 'application/octet-stream', upsert: false, metadata: { sha256: hash } })
  // Recover a lost upload response by reading and verifying the immutable ciphertext.
  const stored = await cloud.storage.from('solo-backups').download(metadata.object_path)
  if (stored.error) throw upload.error ?? stored.error
  if (stored.data.size !== metadata.byte_size || await snapshotDigest(new Uint8Array(await stored.data.arrayBuffer())) !== metadata.ciphertext_sha256) throw new Error('BACKUP_FILE_MISMATCH')
  const confirmed = await cloud.rpc('confirm_solo_backup', { p_id: metadata.id })
  if (confirmed.error) throw confirmed.error
  return backupSchema.parse(confirmed.data)
}
export async function downloadCloudBackup(backup: SoloBackup) {
  const { cloud } = await cloudOwner(), result = await cloud.storage.from('solo-backups').download(backup.object_path)
  if (result.error) throw result.error
  const bytes = new Uint8Array(await result.data.arrayBuffer())
  if (bytes.length !== backup.byte_size || await snapshotDigest(bytes) !== backup.ciphertext_sha256) throw new Error('BACKUP_FILE_MISMATCH')
  downloadSoloBackup(bytes)
}
export async function moveSoloToTeam(companyId: string, targetCompanyId: string, secret: string, reason: string) {
  const { cloud, ownerId } = await cloudOwner()
  const identity = identitySchema.parse(await deviceRequest({ operation: 'identity' }))
  let intent = intentSchema.parse(await deviceRequest({ operation: 'cutover_prepare', companyId, targetCompanyId, cloudOwnerId: ownerId, reason }))
  let backup: SoloBackup
  if (intent.backup_id) {
    const existing = await cloud.from('solo_backups').select('*').eq('id', intent.backup_id).eq('owner_id', ownerId).eq('status', 'ready').single()
    if (existing.error) throw existing.error
    backup = backupSchema.parse(existing.data)
  } else {
    const sealed = await soloExport(secret)
    downloadSoloBackup(sealed.file)
    backup = await uploadSoloBackup(sealed)
    await deviceRequest({ operation: 'cutover_attach_backup', backupId: backup.id, sha256: sealed.header.sha256 })
    intent = intentSchema.parse(await deviceRequest({ operation: 'cutover_pending' }))
  }
  const preview = previewSchema.parse(await deviceRequest({ operation: 'cutover_preview', companyId }))
  if (preview.blockers.length) throw new Error('CUTOVER_RECONCILIATION_REQUIRED')
  const committed = await cloud.rpc('commit_solo_cutover', { p_id: intent.id, p_company_id: intent.company_id, p_workspace_id: identity.workspace_id, p_backup_id: backup.id, p_snapshot_sha256: backup.snapshot_sha256, p_manifest: { masters: preview.masters, openings: preview.openings }, p_reason: intent.reason })
  if (committed.error) throw committed.error
  const receipt = cutoverReceiptSchema.parse(committed.data)
  await deviceRequest({ operation: 'cutover_finish', receipt })
  if (receipt.status !== 'committed') throw new Error('CUTOVER_ABORTED')
  return receipt
}
export async function cancelSoloMove() {
  const { cloud, ownerId } = await cloudOwner(), identity = identitySchema.parse(await deviceRequest({ operation: 'identity' }))
  const intent = intentSchema.parse(await deviceRequest({ operation: 'cutover_pending' }))
  if (intent.cloud_owner_id !== ownerId) throw new Error('CUTOVER_OWNER_MISMATCH')
  const result = await cloud.rpc('abort_solo_cutover', { p_id: intent.id, p_company_id: intent.company_id, p_workspace_id: identity.workspace_id, p_snapshot_sha256: intent.snapshot_sha256 ?? '0'.repeat(64), p_reason: 'Owner cancelled the pending solo move.' })
  if (result.error) throw result.error
  const receipt = cutoverReceiptSchema.parse(result.data)
  await deviceRequest({ operation: 'cutover_finish', receipt })
  return receipt.status
}
