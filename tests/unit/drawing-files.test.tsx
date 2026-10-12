// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DrawingFilesPanel, DrawingFileSummary } from '@/features/production/DrawingFilesPanel'
import { drawingUploadMetadataSchema, type DrawingWorkspace } from '@/features/production/useDrawingWorkspace'

afterEach(cleanup)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const data: DrawingWorkspace = {
  drawings: [{ id: id(1), item_id: id(2), drawing_number: 'SAMPLE-DRAWING' }],
  revisions: [{ id: id(3), drawing_id: id(1), revision: 'A', status: 'draft', approved_at: null, approved_by: null }],
  documents: [],
}
const fileRecord = { id: id(4), company_id: id(5), drawing_revision_id: id(3), original_name: 'sample.pdf', mime_type: 'application/pdf' as const,
  byte_size: 8, sha256: 'a'.repeat(64), object_path: `${id(5)}/${id(4)}`, status: 'ready' as const, created_by: id(6), created_at: '2026-10-12T00:00:00Z', confirmed_at: '2026-10-12T00:00:01Z' }
const props = { data, options: { items: [{ id: id(2), sku: 'SAMPLE-ITEM', description: 'SAMPLE fastener', base_uom: 'pcs' as const }], plants: [], warehouses: [], locations: [] },
  userId: id(6), permissions: ['drawings.read', 'drawings.manage'], online: true, busy: false, loading: false, error: false,
  onCommand: vi.fn(), onUpload: vi.fn(), onDownload: vi.fn(), onCreateDrawing: vi.fn() }
function select() {
  fireEvent.change(screen.getByLabelText('Controlled drawing'), { target: { value: id(1) } })
  fireEvent.change(screen.getByLabelText('Drawing revision'), { target: { value: id(3) } })
}
it('requires a confirmed file and explicit review before approval', () => {
  const { rerender } = render(<DrawingFilesPanel {...props} />)
  select()
  expect(screen.getByRole('button', { name: 'Approve drawing revision' })).toBeDisabled()
  expect(screen.getByLabelText('I reviewed this exact drawing file')).toBeDisabled()
  rerender(<DrawingFilesPanel {...props} data={{ ...data, documents: [fileRecord] }} />)
  expect(screen.getByRole('button', { name: 'Approve drawing revision' })).toBeDisabled()
  fireEvent.click(screen.getByLabelText('I reviewed this exact drawing file'))
  expect(screen.getByRole('button', { name: 'Approve drawing revision' })).toBeEnabled()
})
it('does not confirm until the server responds; failed file input remains available for retry', async () => {
  let reject!: (error: Error) => void
  const onUpload = vi.fn(() => new Promise<string>((_, fail) => { reject = fail }))
  render(<DrawingFilesPanel {...props} onUpload={onUpload} />)
  select()
  const file = new File(['%PDF-1.7'], 'sample.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Drawing file'), { target: { files: [file] } })
  fireEvent.submit(screen.getByRole('button', { name: 'Upload drawing file' }).closest('form')!)
  expect(onUpload).toHaveBeenCalledWith({ revisionId: id(3), file, pendingId: undefined })
  expect(screen.queryByText(/upload confirmed/)).not.toBeInTheDocument()
  await act(async () => reject(new Error('DOCUMENT_UPLOAD_INCOMPLETE')))
  expect(screen.getByRole('alert')).toHaveTextContent('private file upload has not finished')
  expect((screen.getByLabelText('Drawing file') as HTMLInputElement).files?.[0]).toBe(file)
})
it('exposes only the original uploader’s resumable pending file', () => {
  const pending = { ...fileRecord, status: 'pending' as const, confirmed_at: null }
  const { rerender } = render(<DrawingFilesPanel {...props} data={{ ...data, documents: [pending] }} />)
  select()
  expect(screen.getByRole('button', { name: 'Resume drawing upload' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument()
  rerender(<DrawingFilesPanel {...props} userId={id(9)} data={{ ...data, documents: [pending] }} />)
  expect(screen.queryByLabelText('Drawing file')).not.toBeInTheDocument()
})
it('keeps legacy approved revisions read-only and requires a new revision for a file', () => {
  render(<DrawingFilesPanel {...props} data={{ ...data, revisions: [{ ...data.revisions[0]!, status: 'approved', approved_at: '2026-10-12T00:00:00Z', approved_by: id(6) }] }} />)
  select()
  expect(screen.getByText(/Historical approval is retained/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Drawing file')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Approve drawing revision' })).not.toBeInTheDocument()
})
it('downloads the pinned revision even when a newer revision exists; blocks offline and read-only writes', () => {
  render(<DrawingFileSummary data={{ ...data, documents: [fileRecord], revisions: [...data.revisions, { ...data.revisions[0]!, id: id(7), revision: 'B' }] }} revisionId={id(3)} online={false} busy={false} onDownload={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Download SAMPLE-DRAWING Rev A' })).toBeDisabled()
  expect(screen.queryByText(/Rev B/)).not.toBeInTheDocument()
  cleanup()
  render(<DrawingFilesPanel {...props} permissions={['drawings.read']} />)
  select()
  expect(screen.queryByRole('button', { name: 'Create drawing revision' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Drawing file')).not.toBeInTheDocument()
})
it('rejects unsupported, empty and oversized files before creating a server draft', () => {
  const metadata = { ...fileRecord }
  expect(drawingUploadMetadataSchema.safeParse(metadata).success).toBe(true)
  for (const changes of [{ mime_type: 'text/html' }, { byte_size: 0 }, { byte_size: 5242881 }])
    expect(drawingUploadMetadataSchema.safeParse({ ...metadata, ...changes }).success).toBe(false)
})
