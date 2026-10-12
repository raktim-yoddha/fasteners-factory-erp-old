import { privateFileMetadataSchema } from '@/lib/privateFileContract'
import { z } from 'zod'
import { type CommandHandler } from './context'
import type { Row } from './database'

function begin(table: 'lot_documents' | 'drawing_documents'): CommandHandler {
  return (c, a) => {
    const input = a.p_data as Row, metadata = privateFileMetadataSchema.parse(input)
    const targetKey = table === 'lot_documents' ? 'lot_id' : 'drawing_revision_id'
    const target = c.one(table === 'lot_documents' ? 'stock_lots' : 'drawing_revisions', z.uuid().parse(input[targetKey]))
    if (table === 'drawing_documents') { c.state(target, 'draft'); if (c.rows(table, { drawing_revision_id: target.id }).length) throw new Error('DRAWING_FILE_ALREADY_EXISTS') }
    const id = crypto.randomUUID()
    const values: Row = { ...metadata, id, [targetKey]: target.id, object_path: `${c.companyId}/${id}` }
    if (table === 'lot_documents') {
      values.label = z.string().trim().min(1).max(160).parse(input.label)
      values.kind = z.enum(['certificate', 'inspection_evidence']).parse(input.kind)
      values.supersedes_id = input.supersedes_id ?? null
      if (values.supersedes_id) { const old = c.one(table, values.supersedes_id); if (old.lot_id !== target.id || old.status !== 'ready') throw new Error('DOCUMENT_CONTEXT_MISMATCH') }
    }
    const document = c.insert(table, values); c.audit(table, document.id, 'document_pending'); return document.id
  }
}
function confirm(table: 'lot_documents' | 'drawing_documents'): CommandHandler {
  return (c, a) => {
    const document = c.one(table, a.p_document_id)
    c.state(document, 'pending')
    const file = c.store.db.all('SELECT bytes,sha256 FROM local_files WHERE path=?', [String(document.object_path)])[0]
    if (!file || !(file.bytes instanceof Uint8Array) || file.bytes.length !== document.byte_size || file.sha256 !== document.sha256) throw new Error('DOCUMENT_FILE_MISMATCH')
    c.update(table, document, { status: 'ready', confirmed_at: new Date().toISOString() }); c.audit(table, document.id, 'document_confirmed'); return document.id
  }
}
export const documentCommands: Record<string, CommandHandler> = {
  begin_lot_document: begin('lot_documents'), confirm_lot_document: confirm('lot_documents'), begin_drawing_document: begin('drawing_documents'), confirm_drawing_document: confirm('drawing_documents'),
}
