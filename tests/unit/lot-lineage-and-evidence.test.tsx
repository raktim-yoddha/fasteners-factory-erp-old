// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lotAncestors } from '@/features/quality/lotLineage'
import { LotEvidencePanel } from '@/features/quality/LotEvidencePanel'
import { uploadMetadataSchema, type LotDocument } from '@/features/quality/useLotDocuments'
import { transformationSchema } from '@/features/stock/useLotTransformations'

afterEach(cleanup)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const parent = id(1), child = id(2), actor = id(3)
const document: LotDocument = {
  id: id(4), company_id: id(5), lot_id: parent, label: 'SAMPLE certificate',
  kind: 'certificate', original_name: 'sample.pdf', mime_type: 'application/pdf',
  byte_size: 8, sha256: 'a'.repeat(64), object_path: `${id(5)}/${id(4)}`,
  status: 'ready', supersedes_id: null, created_by: actor,
  created_at: '2026-10-11T12:00:00Z', confirmed_at: '2026-10-11T12:01:00Z',
}
const props = {
  lots: [
    { id: parent, item_id: id(6), lot_code: 'SAMPLE-PARENT', qc_status: 'released' as const, revision: 2 },
    { id: child, item_id: id(6), lot_code: 'SAMPLE-CHILD', qc_status: 'hold' as const, revision: 1 },
  ], documents: [document], selectedLotId: child,
  edges: [{ parent_lot_id: parent, child_lot_id: child }], userId: actor,
  permissions: ['documents.read', 'documents.manage'], online: true, busy: false,
  loading: false, error: false, onUpload: vi.fn(), onDownload: vi.fn(),
}

describe('retained lot evidence', () => {
  it('retains every merge/material ancestor, excludes unrelated lots and bounds cycles', () => {
    const edges = [
      { parent_lot_id: parent, child_lot_id: child },
      { parent_lot_id: id(7), child_lot_id: child },
      { parent_lot_id: id(8), child_lot_id: parent },
      { parent_lot_id: child, child_lot_id: id(8) },
      { parent_lot_id: id(9), child_lot_id: id(10) },
    ]
    expect(lotAncestors(child, edges)).toEqual(new Set([child, parent, id(7), id(8)]))
  })

  it('shows inherited files and keeps correction choices scoped to the selected lot', () => {
    render(<LotEvidencePanel {...props} />)
    expect(screen.getByRole('button', { name: 'Download SAMPLE certificate' })).toBeEnabled()
    expect(screen.getByText(/SAMPLE-PARENT · sample.pdf/)).toBeInTheDocument()
    expect(screen.getByLabelText('File correction reference').children).toHaveLength(1)
  })

  it('confirms only after the server responds', async () => {
    let confirm!: (value: string) => void
    const onUpload = vi.fn(() => new Promise<string>((resolve) => { confirm = resolve }))
    render(<LotEvidencePanel {...props} onUpload={onUpload} />)
    fireEvent.change(screen.getByLabelText('Evidence label'), { target: { value: 'SAMPLE check' } })
    const file = new File(['%PDF-1.7'], 'sample.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Certificate or inspection file'), { target: { files: [file] } })
    fireEvent.submit(screen.getByRole('button', { name: 'Upload lot evidence' }).closest('form')!)
    expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ lotId: child, file }))
    expect(screen.queryByText(/Evidence upload confirmed/)).not.toBeInTheDocument()
    await act(async () => confirm(id(11)))
    expect(screen.getByRole('status')).toHaveTextContent('Evidence upload confirmed.')
  })

  it('retains unconfirmed input and reports a failed upload without success', async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error('DOCUMENT_UPLOAD_INCOMPLETE'))
    render(<LotEvidencePanel {...props} onUpload={onUpload} />)
    fireEvent.change(screen.getByLabelText('Evidence label'), { target: { value: 'SAMPLE retry' } })
    const file = new File(['%PDF-1.7'], 'sample.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Certificate or inspection file'), { target: { files: [file] } })
    await act(async () => fireEvent.submit(screen.getByRole('button', { name: 'Upload lot evidence' }).closest('form')!))
    expect(screen.queryByText(/Evidence upload confirmed/)).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/Blocked because/)
    expect(screen.getByLabelText('Evidence label')).toHaveValue('SAMPLE retry')
    expect((screen.getByLabelText('Certificate or inspection file') as HTMLInputElement).files?.[0]).toBe(file)
  })

  it('exposes resumable incomplete uploads without a download or false confirmation', () => {
    render(<LotEvidencePanel {...props} documents={[{ ...document, lot_id: child, status: 'pending', confirmed_at: null }]} />)
    expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Resume SAMPLE certificate' }))
    expect(screen.getByText(/original file bytes must match/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Evidence label')).not.toBeInTheDocument()
  })

  it('blocks offline actions and hides upload for read-only staff', () => {
    const { rerender } = render(<LotEvidencePanel {...props} online={false} />)
    expect(screen.getByRole('button', { name: 'Download SAMPLE certificate' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Upload lot evidence' })).toBeDisabled()
    rerender(<LotEvidencePanel {...props} permissions={['documents.read']} />)
    expect(screen.queryByRole('button', { name: 'Upload lot evidence' })).not.toBeInTheDocument()
  })

  it('rejects unsupported, empty and oversized files before any upload draft', () => {
    const metadata = { ...document, supersedes_id: null }
    expect(uploadMetadataSchema.safeParse(metadata).success).toBe(true)
    for (const changes of [{ mime_type: 'text/html' }, { byte_size: 0 }, { byte_size: 5242881 }])
      expect(uploadMetadataSchema.safeParse({ ...metadata, ...changes }).success).toBe(false)
  })
})

describe('exact lot transformation boundaries', () => {
  const source = { lot_id: parent, revision: 2, quantity: '0.000001' }
  const split = { kind: 'split', sources: [source], location_id: id(12), lot_code: 'SAMPLE-SPLIT', uom: 'kg', reason: 'SAMPLE separation' }
  it('retains six-place decimals and rejects rounded, negative or missing quantities', () => {
    expect(transformationSchema.parse(split).sources[0]?.quantity).toBe('0.000001')
    for (const quantity of ['0.0000001', '-1', '0', '', '1e3'])
      expect(transformationSchema.safeParse({ ...split, sources: [{ ...source, quantity }] }).success).toBe(false)
  })
  it('requires exactly one source for split and distinct sources for merge', () => {
    expect(transformationSchema.safeParse({ ...split, kind: 'merge' }).success).toBe(false)
    expect(transformationSchema.safeParse({ ...split, kind: 'merge', sources: [source, source] }).success).toBe(false)
    expect(transformationSchema.safeParse({ ...split, sources: [source, { ...source, lot_id: child }] }).success).toBe(false)
    expect(transformationSchema.safeParse({ ...split, kind: 'merge', sources: [source, { ...source, lot_id: child }] }).success).toBe(true)
  })
})
