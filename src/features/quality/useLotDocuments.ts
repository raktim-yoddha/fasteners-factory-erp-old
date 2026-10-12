import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { downloadPrivateFile, fileDigest, privateFileMetadataSchema, privateFileRecordSchema, storePrivateFile } from '@/lib/privateFiles'

export const documentSchema = privateFileRecordSchema.extend({
  lot_id: z.uuid(), label: z.string(),
  kind: z.enum(['certificate', 'inspection_evidence']), supersedes_id: z.uuid().nullable(),
})
export type LotDocument = z.infer<typeof documentSchema>
export type DocumentUpload = {
  lotId: string; label: string; kind: LotDocument['kind']; file: File
  supersedesId?: string; pendingId?: string
}
const fields = 'id,company_id,lot_id,label,kind,original_name,mime_type,byte_size,sha256,object_path,status,supersedes_id,created_by,created_at,confirmed_at'
export const uploadMetadataSchema = privateFileMetadataSchema.extend({
  lot_id: z.uuid(), label: z.string().trim().min(1).max(160), kind: z.enum(['certificate', 'inspection_evidence']),
  supersedes_id: z.uuid().nullable(),
})
export function useLotDocuments(companyId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['lot-documents', companyId], enabled: Boolean(companyId && supabase && enabled),
    queryFn: async () => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const result = await supabase.from('lot_documents').select(fields).eq('company_id', companyId).order('created_at', { ascending: false })
      if (result.error) throw result.error
      return z.array(documentSchema).parse(result.data)
    },
  })
}
export function useLotDocumentCommands(companyId: string | null) {
  const client = useQueryClient()
  const retry = useRef<{ request: string; beginKey: string; confirmKey: string; id?: string } | null>(null)
  const invalidate = () => client.invalidateQueries({ queryKey: ['lot-documents', companyId] })
  const upload = useMutation({
    mutationFn: async (input: DocumentUpload) => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      // Validate the file before creating a technical upload draft.
      const metadata = uploadMetadataSchema.parse({ lot_id: input.lotId, label: input.label, kind: input.kind,
        original_name: input.file.name, mime_type: input.file.type, byte_size: input.file.size,
        sha256: '0'.repeat(64), supersedes_id: input.supersedesId ?? null })
      metadata.sha256 = await fileDigest(input.file)
      const request = JSON.stringify({ companyId, metadata, pendingId: input.pendingId })
      if (retry.current?.request !== request) retry.current = { request, beginKey: crypto.randomUUID(), confirmKey: crypto.randomUUID() }
      const attempt = retry.current
      if (!attempt.id) {
        if (input.pendingId) {
          const result = await supabase.from('lot_documents').select(fields).eq('company_id', companyId).eq('id', z.uuid().parse(input.pendingId)).single()
          if (result.error) throw result.error
          const previous = documentSchema.parse(result.data)
          if (previous.status !== 'pending' || previous.lot_id !== metadata.lot_id || previous.sha256 !== metadata.sha256 || previous.byte_size !== metadata.byte_size || previous.mime_type !== metadata.mime_type)
            throw new Error('DOCUMENT_FILE_MISMATCH')
          attempt.id = previous.id
        } else {
          const result = await supabase.rpc('begin_lot_document', { p_company_id: companyId, p_data: metadata, p_idempotency_key: attempt.beginKey })
          if (result.error) throw result.error
          attempt.id = z.uuid().parse(result.data)
        }
      }
      const path = `${companyId}/${attempt.id}`
      await storePrivateFile(path, input.file, metadata)
      const confirmed = await supabase.rpc('confirm_lot_document', { p_company_id: companyId, p_document_id: attempt.id, p_idempotency_key: attempt.confirmKey })
      if (confirmed.error) throw confirmed.error
      const result = z.uuid().parse(confirmed.data)
      retry.current = null
      return result
    }, onSuccess: invalidate, onError: invalidate,
  })
  const download = useMutation({
    mutationFn: async (documentId: string) => {
      if (!supabase || !companyId) throw new Error('Select a company.')
      const result = await supabase.from('lot_documents').select(fields).eq('company_id', companyId).eq('id', z.uuid().parse(documentId)).eq('status', 'ready').single()
      if (result.error) throw result.error
      const document = documentSchema.parse(result.data)
      await downloadPrivateFile(document)
    },
  })
  return { upload, download }
}
