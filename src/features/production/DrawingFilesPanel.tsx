import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { CommandFeedback } from '@/components/CommandFeedback'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import { formatCommandError } from '@/lib/commandError'
import { plantTimestamp } from '@/lib/decimal'
import { drawingCommandSchema, drawingUploadMetadataSchema, type DrawingCommand, type DrawingUpload, type DrawingWorkspace } from './useDrawingWorkspace'

type ReadProps = {
  data: DrawingWorkspace | undefined; revisionId: string; online: boolean; busy: boolean
  onDownload: (id: string) => Promise<void>
}
export function DrawingFileSummary({ data, revisionId, online, busy, onDownload }: ReadProps) {
  const [message, setMessage] = useState<string | null>(null)
  const revision = data?.revisions.find((row) => row.id === revisionId)
  const drawing = data?.drawings.find((row) => row.id === revision?.drawing_id)
  const file = data?.documents.find((row) => row.drawing_revision_id === revisionId)
  return <section className="record-card" aria-label="Pinned drawing file">
    <strong>{drawing ? `${drawing.drawing_number} Rev ${revision?.revision}` : `Drawing revision ${revisionId}`}</strong>
    {revision && <p>{revision.status === 'approved' ? '✓ Approved' : `⚠ ${revision.status}`} {revision.approved_at && `· ${plantTimestamp(revision.approved_at)}`}</p>}
    {file ? <>
      <p>{file.original_name} · {file.byte_size} bytes · {file.status === 'ready' ? '✓ Stored' : '⚠ Upload incomplete'}</p>
      {file.status === 'ready' && <button className="secondary-button" type="button" disabled={!online || busy}
        onClick={() => { setMessage(null); void onDownload(file.id).catch((cause) => setMessage(formatCommandError(cause, 'the private drawing could not be downloaded.'))) }}>
        Download {drawing?.drawing_number ?? 'drawing'} Rev {revision?.revision ?? revisionId}
      </button>}
    </> : <p className="empty-state">No confirmed file is recorded for this exact revision.{revision?.status === 'approved' && ' Historical approval is retained; create a new revision to store a drawing file.'}</p>}
    <CommandFeedback message={message} />
  </section>
}
type Props = {
  data: DrawingWorkspace | undefined; options: MasterDataOptions; userId: string; permissions: string[]
  online: boolean; busy: boolean; loading: boolean; error: boolean
  onCreateDrawing: (input: { itemId: string; drawingNumber: string }) => Promise<void>
  onCommand: (input: DrawingCommand) => Promise<string>; onUpload: (input: DrawingUpload) => Promise<string>
  onDownload: (id: string) => Promise<void>
}
export function DrawingFilesPanel({ data, options, userId, permissions, online, busy, loading, error, onCreateDrawing, onCommand, onUpload, onDownload }: Props) {
  const [drawingId, setDrawingId] = useState('')
  const [revisionId, setRevisionId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [reviewedId, setReviewedId] = useState('')
  const revisions = data?.revisions.filter((row) => row.drawing_id === drawingId) ?? []
  const revision = revisions.find((row) => row.id === revisionId)
  const file = data?.documents.find((row) => row.drawing_revision_id === revisionId)
  const canManage = permissions.includes('drawings.manage')
  const disabled = !online || busy || loading || error || !canManage
  const value = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? '').trim()
  async function submit(input: DrawingCommand, form: HTMLFormElement) {
    const parsed = drawingCommandSchema.safeParse(input)
    if (!parsed.success) { setMessage('Blocked because a drawing, revision and change or approval reason are required.'); return }
    setMessage(null)
    try {
      const id = await onCommand(parsed.data)
      setRevisionId(id); setReviewedId(''); form.reset()
      setMessage(input.action === 'create' ? 'Drawing revision created. Upload its exact file before approval.' : 'Drawing approval confirmed. This revision and its file are immutable.')
    } catch (cause) { setMessage(formatCommandError(cause, 'the drawing action could not be confirmed. Retry the same request.')) }
  }
  if (loading) return <p role="status">Loading private drawings…</p>
  if (error) return <p role="alert">Blocked because drawing records could not be loaded.</p>
  return <section className="grid min-w-0 gap-3" aria-labelledby="drawing-files-title">
    <h4 id="drawing-files-title" className="font-bold">Controlled drawing files</h4>
    <p className="empty-state">Each revision stores one private PDF, PNG or JPEG up to 5 MiB. Review the stored file before approval. Corrections require a new revision; earlier orders and work orders keep their original pins.</p>
    {!online && <p className="feedback feedback-blocked">Offline. Cached drawing metadata is read-only; file actions require a connection.</p>}
    <CommandFeedback message={message} />
    {permissions.includes('master_data.manage') && <details><summary>Add drawing number</summary>
      <ActionForm title="Create drawing number" disabled={disabled} onSubmit={(form) => {
        void onCreateDrawing({ itemId: value(form, 'item'), drawingNumber: value(form, 'number') })
          .then(() => { form.reset(); setMessage('Drawing number confirmed. Select it below to create its first revision.') })
          .catch((cause) => setMessage(formatCommandError(cause, 'the drawing number could not be created.')))
      }}>
        <label className="form-label">Drawing item<select aria-label="Drawing item" className="form-input" name="item" required defaultValue=""><option value="">Select item</option>{options.items.map((row) => <option key={row.id} value={row.id}>{row.sku} — {row.description}</option>)}</select></label>
        <label className="form-label">Drawing number<input aria-label="Drawing number" className="form-input" name="number" maxLength={80} required /></label>
      </ActionForm>
    </details>}
    <label className="form-label">Controlled drawing<select aria-label="Controlled drawing" className="form-input" value={drawingId}
      onChange={(event) => { setDrawingId(event.target.value); setRevisionId(''); setReviewedId(''); setMessage(null) }}>
      <option value="">Select drawing</option>{data?.drawings.map((row) => <option key={row.id} value={row.id}>{row.drawing_number} · {options.items.find((item) => item.id === row.item_id)?.sku ?? row.item_id}</option>)}
    </select></label>
    {drawingId && <>
      <label className="form-label">Drawing revision<select aria-label="Drawing revision" className="form-input" value={revisionId}
        onChange={(event) => { setRevisionId(event.target.value); setReviewedId(''); setMessage(null) }}>
        <option value="">Select revision</option>{revisions.map((row) => <option key={row.id} value={row.id}>Rev {row.revision} · {row.status}</option>)}
      </select></label>
      {canManage && <ActionForm title="Create drawing revision" disabled={disabled} onSubmit={(form) => { void submit({ action: 'create', drawingId, revision: value(form, 'revision'), reason: value(form, 'reason') }, form) }}>
        <label className="form-label">New drawing revision<input aria-label="New drawing revision" className="form-input" name="revision" required maxLength={24} /></label>
        <label className="form-label">Drawing change reason<textarea aria-label="Drawing change reason" className="form-input" name="reason" required maxLength={2000} /></label>
      </ActionForm>}
    </>}
    {revision && <>
      <DrawingFileSummary key={revision.id} data={data} revisionId={revision.id} online={online} busy={busy} onDownload={onDownload} />
      {canManage && revision.status === 'draft' && (!file || (file.status === 'pending' && file.created_by === userId)) && <ActionForm key={`${revision.id}:${file?.id ?? ''}`} title={file ? 'Resume drawing upload' : 'Upload drawing file'} disabled={disabled} onSubmit={(form) => {
        const input = (form.elements.namedItem('file') as HTMLInputElement).files?.[0]
        if (!input) return
        const metadata = drawingUploadMetadataSchema.safeParse({ drawing_revision_id: revision.id, original_name: input.name, mime_type: input.type, byte_size: input.size, sha256: '0'.repeat(64) })
        if (!metadata.success) { setMessage('Blocked because the drawing needs a PDF, PNG or JPEG up to 5 MiB.'); return }
        setMessage(null)
        void onUpload({ revisionId: revision.id, file: input, pendingId: file?.id })
          .then(() => { setMessage('Drawing file upload confirmed. Download and review it before approval.'); form.reset() })
          .catch((cause) => setMessage(formatCommandError(cause, 'the upload is incomplete. Resume with the same file.')))
      }}>
        {file && <p>Resume {file.original_name}. The same filename and file bytes must match.</p>}
        <label className="form-label">Drawing file<input aria-label="Drawing file" className="form-input" type="file" name="file" accept="application/pdf,image/png,image/jpeg" required /></label>
      </ActionForm>}
      {canManage && revision.status === 'draft' && <ActionForm title="Approve drawing revision" disabled={disabled || file?.status !== 'ready' || reviewedId !== revision.id}
        onSubmit={(form) => { void submit({ action: 'approve', revisionId: revision.id, reason: value(form, 'reason') }, form) }}>
        {file?.status !== 'ready' && <p className="feedback feedback-blocked">Blocked because this revision has no confirmed file.</p>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={reviewedId === revision.id} disabled={file?.status !== 'ready' || disabled}
          onChange={(event) => setReviewedId(event.target.checked ? revision.id : '')} />I reviewed this exact drawing file</label>
        <label className="form-label">Drawing approval reason<textarea aria-label="Drawing approval reason" className="form-input" name="reason" required maxLength={2000} /></label>
      </ActionForm>}
    </>}
  </section>
}
