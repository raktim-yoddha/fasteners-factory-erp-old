import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { CommandFeedback } from '@/components/CommandFeedback'
import { formatCommandError } from '@/lib/commandError'
import { plantTimestamp } from '@/lib/decimal'
import type { StockLot } from '@/features/stock/useStockLots'
import { lotAncestors } from './lotLineage'
import { uploadMetadataSchema, type DocumentUpload, type LotDocument } from './useLotDocuments'

type Props = {
  lots: StockLot[]; documents: LotDocument[]; selectedLotId: string
  edges: { parent_lot_id: string; child_lot_id: string }[]; userId: string
  permissions: string[]; online: boolean; busy: boolean; loading: boolean; error: boolean
  onUpload: (input: DocumentUpload) => Promise<string>; onDownload: (id: string) => Promise<void>
}
export function LotEvidencePanel({ lots, documents, selectedLotId, edges, userId, permissions, online, busy, loading, error, onUpload, onDownload }: Props) {
  const [message, setMessage] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState('')
  const ancestors = lotAncestors(selectedLotId, edges)
  const visible = documents.filter((document) => ancestors.has(document.lot_id))
  const pending = documents.find((document) => document.id === pendingId && document.status === 'pending' && document.created_by === userId)
  const disabled = !selectedLotId || !online || busy || loading || error
  return <section aria-labelledby="lot-evidence-title" className="grid min-w-0 gap-3">
    <h4 id="lot-evidence-title" className="font-bold">Certificate and inspection files</h4>
    <p className="empty-state">Private files from this lot and its recorded ancestors. Upload confirmation proves storage; it does not approve a certificate or replace QC inspection.</p>
    <CommandFeedback message={message} />
    {loading && <p role="status">Loading private evidence…</p>}
    {error && <p role="alert" className="feedback feedback-blocked">Blocked because evidence records could not be loaded.</p>}
    {!visible.length && <p className="empty-state">No certificate or inspection file is recorded for this lineage.</p>}
    {visible.map((document) => <article className="record-card" key={document.id}>
      <strong>{document.label}</strong><p>{lots.find((lot) => lot.id === document.lot_id)?.lot_code ?? document.lot_id} · {document.original_name} · {document.byte_size} bytes</p>
      <p>{document.status === 'ready' ? '✓ Stored' : '⚠ Upload incomplete'} · {document.kind.replaceAll('_',' ')} · {plantTimestamp(document.confirmed_at ?? document.created_at)}</p>
      {document.supersedes_id && <p>Correction of file {documents.find((row) => row.id === document.supersedes_id)?.label ?? document.supersedes_id}; original retained.</p>}
      {documents.some((row) => row.status === 'ready' && row.supersedes_id === document.id) && <p>Superseded by a newer recorded file. History remains available.</p>}
      {document.status === 'ready' && <button className="secondary-button" type="button" disabled={!online || busy || !permissions.includes('documents.read')} onClick={() => {void onDownload(document.id).catch((cause) => setMessage(formatCommandError(cause,'the private file could not be downloaded.')))}}>Download {document.label}</button>}
      {document.status === 'pending' && document.created_by === userId && permissions.includes('documents.manage') && <button className="secondary-button" type="button" disabled={disabled} onClick={() => {setPendingId(document.id);setMessage('Choose the same file to resume this incomplete upload.')}}>Resume {document.label}</button>}
    </article>)}
    {permissions.includes('documents.manage') && <ActionForm key={`${selectedLotId}:${pendingId}`} title="Upload lot evidence" disabled={disabled}
      onSubmit={(form) => {
        const fields = new FormData(form); const file = (form.elements.namedItem('file') as HTMLInputElement).files?.[0]
        if (!file) return
        const metadata = uploadMetadataSchema.safeParse({lot_id:pending?.lot_id ?? selectedLotId,label:pending?.label ?? fields.get('label'),kind:pending?.kind ?? fields.get('kind'),original_name:file.name,mime_type:file.type,byte_size:file.size,sha256:'0'.repeat(64),supersedes_id:pending?.supersedes_id ?? (fields.get('supersedes') || null)})
        if (!metadata.success) {setMessage('Blocked because evidence needs a PDF, PNG or JPEG up to 5 MiB, a label and a selected lot.');return}
        void onUpload({lotId:metadata.data.lot_id,label:metadata.data.label,kind:metadata.data.kind,file,supersedesId:metadata.data.supersedes_id ?? undefined,pendingId:pending?.id})
          .then((id) => {setMessage(`Evidence upload confirmed. Confirmation: ${id}`);setPendingId('');form.reset()})
          .catch((cause) => setMessage(formatCommandError(cause,'the upload is incomplete. Resume with the same file; no evidence is confirmed yet.')))
      }}>
      {pending ? <p>Resume {pending.label} for {lots.find((lot) => lot.id === pending.lot_id)?.lot_code}. The original file bytes must match.<button className="secondary-button" type="button" onClick={() => setPendingId('')}>Cancel resume</button></p> : <>
        <label className="form-label">Evidence label<input aria-label="Evidence label" className="form-input" name="label" required maxLength={160} /></label>
        <label className="form-label">Evidence type<select aria-label="Evidence type" className="form-input" name="kind"><option value="certificate">Certificate</option><option value="inspection_evidence">Inspection evidence</option></select></label>
        <label className="form-label">File correction reference<select aria-label="File correction reference" className="form-input" name="supersedes" defaultValue=""><option value="">New evidence</option>{documents.filter((row) => row.lot_id === selectedLotId && row.status === 'ready').map((row) => <option key={row.id} value={row.id}>{row.label} · {row.original_name}</option>)}</select></label>
      </>}
      <label className="form-label">Certificate or inspection file<input aria-label="Certificate or inspection file" className="form-input" type="file" name="file" accept="application/pdf,image/png,image/jpeg" required /></label>
    </ActionForm>}
  </section>
}
