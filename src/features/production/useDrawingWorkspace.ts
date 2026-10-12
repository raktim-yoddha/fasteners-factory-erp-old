import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { downloadPrivateFile, fileDigest, privateFileMetadataSchema, privateFileRecordSchema, storePrivateFile } from '@/lib/privateFiles'

export const drawingDocumentSchema = privateFileRecordSchema.extend({ drawing_revision_id: z.uuid() })
export const drawingWorkspaceSchema = z.object({
  drawings: z.array(z.object({ id: z.uuid(), item_id: z.uuid(), drawing_number: z.string() })),
  revisions: z.array(z.object({
    id: z.uuid(), drawing_id: z.uuid(), revision: z.string(), status: z.enum(['draft', 'approved', 'superseded', 'withdrawn']),
    approved_at: z.string().nullable(), approved_by: z.uuid().nullable(),
  })),
  documents: z.array(drawingDocumentSchema),
})
export type DrawingWorkspace = z.infer<typeof drawingWorkspaceSchema>
export type DrawingUpload = { revisionId: string; file: File; pendingId?: string }
export const drawingUploadMetadataSchema = privateFileMetadataSchema.extend({ drawing_revision_id: z.uuid() })
const reason = z.string().trim().min(1).max(2000)
export const drawingCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), drawingId: z.uuid(), revision: z.string().trim().min(1).max(24), reason }),
  z.object({ action: z.literal('approve'), revisionId: z.uuid(), reason }),
])
export type DrawingCommand = z.input<typeof drawingCommandSchema>
const fields = 'id,company_id,drawing_revision_id,original_name,mime_type,byte_size,sha256,object_path,status,created_by,created_at,confirmed_at'
export function useDrawingWorkspace(companyId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['drawing-workspace', companyId], enabled: Boolean(companyId && supabase && enabled),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const result = await supabase.rpc('get_drawing_workspace', { p_company_id: companyId })
      if (result.error) throw result.error
      return drawingWorkspaceSchema.parse(result.data)
    },
  })
}
export function useDrawingCommands(companyId: string | null, actorId: string | null) {
  const client = useQueryClient()
  const retry = useRef<{ request: string; beginKey: string; confirmKey: string; id?: string } | null>(null)
  const commandRetry = useRef<{ request: string; key: string } | null>(null)
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['drawing-workspace', companyId] }),
      client.invalidateQueries({ queryKey: ['engineering-revision-options', companyId] }),
      client.invalidateQueries({ queryKey: ['record-workspace'] }),
    ])
  }
  const command = useMutation({
    mutationFn: async (input: DrawingCommand) => {
      if (!supabase || !companyId || !actorId) throw new Error('Select a company and sign in.')
      const parsed = drawingCommandSchema.parse(input)
      const request = JSON.stringify({ companyId, actorId, parsed })
      if (commandRetry.current?.request !== request) commandRetry.current = { request, key: crypto.randomUUID() }
      const attempt = commandRetry.current
      const args = { p_company_id: companyId, p_reason: parsed.reason, p_idempotency_key: attempt.key }
      const result = parsed.action === 'create'
        ? await supabase.rpc('create_drawing_revision', { ...args, p_drawing_id: parsed.drawingId, p_revision: parsed.revision })
        : await supabase.rpc('approve_drawing_revision', { ...args, p_revision_id: parsed.revisionId })
      if (result.error) throw result.error
      const id = z.uuid().parse(result.data)
      if (commandRetry.current === attempt) commandRetry.current = null
      return id
    }, onSuccess: invalidate, onError: invalidate,
  })
  const upload = useMutation({
    mutationFn: async (input: DrawingUpload) => {
      if (!supabase || !companyId || !actorId) throw new Error('Select a company and sign in.')
      const metadata = drawingUploadMetadataSchema.parse({ drawing_revision_id: input.revisionId,
        original_name: input.file.name, mime_type: input.file.type, byte_size: input.file.size, sha256: '0'.repeat(64) })
      metadata.sha256 = await fileDigest(input.file)
      const request = JSON.stringify({ companyId, actorId, metadata, pendingId: input.pendingId })
      if (retry.current?.request !== request) retry.current = { request, beginKey: crypto.randomUUID(), confirmKey: crypto.randomUUID() }
      const attempt = retry.current
      if (!attempt.id) {
        if (input.pendingId) {
          const result = await supabase.from('drawing_documents').select(fields).eq('company_id', companyId).eq('id', z.uuid().parse(input.pendingId)).single()
          if (result.error) throw result.error
          const previous = drawingDocumentSchema.parse(result.data)
          if (previous.status !== 'pending' || previous.created_by !== actorId || previous.drawing_revision_id !== metadata.drawing_revision_id
            || previous.sha256 !== metadata.sha256 || previous.byte_size !== metadata.byte_size || previous.mime_type !== metadata.mime_type || previous.original_name !== metadata.original_name)
            throw new Error('DOCUMENT_FILE_MISMATCH')
          attempt.id = previous.id
        } else {
          const result = await supabase.rpc('begin_drawing_document', { p_company_id: companyId, p_data: metadata, p_idempotency_key: attempt.beginKey })
          if (result.error) throw result.error
          attempt.id = z.uuid().parse(result.data)
        }
      }
      await storePrivateFile(`${companyId}/${attempt.id}`, input.file, metadata)
      const confirmed = await supabase.rpc('confirm_drawing_document', { p_company_id: companyId, p_document_id: attempt.id, p_idempotency_key: attempt.confirmKey })
      if (confirmed.error) throw confirmed.error
      const id = z.uuid().parse(confirmed.data)
      if (retry.current === attempt) retry.current = null
      return id
    }, onSuccess: invalidate, onError: invalidate,
  })
  const download = useMutation({
    mutationFn: async (documentId: string) => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const result = await supabase.from('drawing_documents').select(fields).eq('company_id', companyId).eq('id', z.uuid().parse(documentId)).eq('status', 'ready').single()
      if (result.error) throw result.error
      await downloadPrivateFile(drawingDocumentSchema.parse(result.data))
    },
  })
  return { command, upload, download }
}
