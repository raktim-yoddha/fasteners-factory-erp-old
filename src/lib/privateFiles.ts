import type { z } from 'zod'
import { supabase } from './supabase'

import type { privateFileMetadataSchema, privateFileRecordSchema } from './privateFileContract'
import { workspaceMode } from '@/local/mode'
import { localRequest } from '@/local/client'
export * from './privateFileContract'
export async function fileDigest(file: Blob) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('')
}
/** Immutable object recovery: a failed response never authorizes replacement bytes. */
export async function storePrivateFile(path: string, file: File, metadata: z.infer<typeof privateFileMetadataSchema>) {
  if (workspaceMode() === 'solo') {
    const stored = await localRequest({ operation: 'file_write', path, bytes: new Uint8Array(await file.arrayBuffer()), sha256: metadata.sha256 })
    if (stored.error) throw stored.error
    return
  }
  if (!supabase) throw new Error('The backend connection is unavailable.')
  const storage = supabase.storage.from('factory-evidence')
  const stored = await storage.upload(path, file, { contentType: metadata.mime_type, upsert: false, metadata: { sha256: metadata.sha256 } })
  if (!stored.error) return
  const recovered = await storage.download(path)
  if (recovered.error) throw stored.error
  if (recovered.data.size !== metadata.byte_size || await fileDigest(recovered.data) !== metadata.sha256)
    throw new Error('DOCUMENT_FILE_MISMATCH')
}
export async function downloadPrivateFile(record: z.infer<typeof privateFileRecordSchema>) {
  if (!supabase) throw new Error('The backend connection is unavailable.')
  const file = workspaceMode() === 'solo'
    ? await localRequest({ operation: 'file_read', path: record.object_path }).then((result) => ({ error: result.error, data: new Blob([result.data as Uint8Array<ArrayBuffer>], { type: record.mime_type }) }))
    : await supabase.storage.from('factory-evidence').download(record.object_path)
  if (file.error) throw file.error
  if (!file.data) throw new Error('DOCUMENT_FILE_MISSING')
  if (file.data.size !== record.byte_size || await fileDigest(file.data) !== record.sha256) throw new Error('DOCUMENT_FILE_MISMATCH')
  const url = URL.createObjectURL(file.data)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = record.original_name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
