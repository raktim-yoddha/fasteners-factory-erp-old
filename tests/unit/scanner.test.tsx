// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ScannerPanel } from '@/features/search/ScannerPanel'
import { scanInputSchema } from '@/features/search/useScannerLookup'
import { HistoryPagination } from '@/components/HistoryPagination'

afterEach(cleanup)
it('accepts scanner suffix whitespace, preserves identifiers and rejects combined codes', () => {
  expect(scanInputSchema.parse(' SAMPLE-LOT-001\r\n')).toBe('SAMPLE-LOT-001')
  expect(scanInputSchema.safeParse('SAMPLE-1\nSAMPLE-2').success).toBe(false)
  expect(scanInputSchema.safeParse(' ').success).toBe(false)
})
it('never executes a business action or guesses between ambiguous matches', async () => {
  const onOpen=vi.fn(),results=[{ record_type: 'Lot',record_id: 'SAMPLE-id',label: 'SAMPLE same code · hold' },{ record_type: 'Shipment',record_id: 'SAMPLE-other',label: 'SAMPLE same code · draft' }]
  const onLookup=vi.fn().mockResolvedValue(results)
  render(<ScannerPanel disabled={false} busy={false} onOpen={onOpen} onLookup={onLookup} />)
  fireEvent.click(screen.getByText('Scan an identifier'))
  fireEvent.change(screen.getByLabelText('Scanned identifier'),{ target: { value: 'SAMPLE-CODE' } })
  await act(async () => fireEvent.submit(screen.getByRole('button',{ name: 'Find scanned record' }).closest('form')!))
  expect(onLookup).toHaveBeenCalledWith('SAMPLE-CODE');expect(onOpen).not.toHaveBeenCalled()
  expect(screen.getByText(/Multiple records use this code/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{ name: /Lot · SAMPLE same code/ }));expect(onOpen).toHaveBeenCalledWith(results[0])
})
it('retains a failed scan and blocks offline lookups', async () => {
  const props={ disabled: false,busy: false,onOpen: vi.fn(),onLookup: vi.fn().mockRejectedValue(new Error('SAMPLE interrupted')) }
  const { rerender }=render(<ScannerPanel {...props} />)
  fireEvent.click(screen.getByText('Scan an identifier'))
  fireEvent.change(screen.getByLabelText('Scanned identifier'),{ target: { value: 'SAMPLE-CODE' } })
  await act(async () => fireEvent.submit(screen.getByRole('button',{ name: 'Find scanned record' }).closest('form')!))
  expect(screen.getByLabelText('Scanned identifier')).toHaveValue('SAMPLE-CODE')
  expect(screen.getByRole('alert')).toHaveTextContent('retry')
  rerender(<ScannerPanel {...props} disabled />)
  expect(screen.getByRole('button',{ name: 'Find scanned record' })).toBeDisabled()
})
it('blocks unavailable history pages and forwards the chosen page action', () => {
  const onOlder=vi.fn(),onNewer=vi.fn()
  const { rerender }=render(<HistoryPagination label="SAMPLE history pages" loading={false} canOlder canNewer={false} onOlder={onOlder} onNewer={onNewer} />)
  expect(screen.getByRole('button',{ name: 'Newer events' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{ name: 'Older events' }));expect(onOlder).toHaveBeenCalledOnce()
  rerender(<HistoryPagination label="SAMPLE history pages" loading canOlder canNewer onOlder={onOlder} onNewer={onNewer} />)
  expect(screen.getByRole('button',{ name: 'Older events' })).toBeDisabled()
})
