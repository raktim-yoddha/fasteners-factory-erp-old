// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { parseCsv,writeCsv } from '@/lib/csv'
import { parseImportCsv } from '@/features/data-transfer/importCsv'
import { DataTransferPanel } from '@/features/data-transfer/DataTransferPanel'
afterEach(cleanup)
it('parses quoted commas, escaped quotes, UTF-8 BOM and embedded newlines without changing decimals', () => {
  expect(parseCsv('\uFEFFa,b\r\n"hello, world","a""b\nnext"\r\n')).toEqual([['a','b'],['hello, world','a"b\nnext']])
  expect(parseImportCsv('sku,location_code,lot_code,quantity,uom,reference\nSAMPLE-RAW,SAMPLE-LOC,SAMPLE-LOT,999999999999.000001,kg,"SAMPLE count, checked"','opening_stock')[0]?.quantity).toBe('999999999999.000001')
})
it('rejects malformed files, wrong headers, units, precision and overlarge batches', () => {
  expect(() => parseCsv('a\n"unclosed')).toThrow('unclosed')
  expect(() => parseCsv('a\n"quoted"junk')).toThrow('after a quoted')
  expect(() => parseImportCsv('name,code\nSAMPLE,SAMPLE-C','customers')).toThrow('exact headers')
  expect(() => parseImportCsv('sku,description,base_uom\nSAMPLE-A,SAMPLE item,ton','items')).toThrow('base_uom')
  expect(() => parseImportCsv('code,name\n'+Array.from({ length: 501 },(_,n) => `SAMPLE-${n},SAMPLE name`).join('\n'),'customers')).toThrow('500 data rows')
})
it('neutralizes spreadsheet formulas while preserving exact signed numeric amounts', () => {
  const text=writeCsv(['name','amount'],[{ name: '=HYPERLINK("example")',amount: '-0.000001' },{ name: ' @SUM(1)',amount: '999999999999.000001' }])
  const rows=parseCsv(text)
  expect(rows[1]).toEqual(['\'=HYPERLINK("example")','-0.000001'])
  expect(rows[2]).toEqual(["' @SUM(1)",'999999999999.000001'])
})
it('never permits an erroneous import preview to apply', () => {
  const id='00000000-0000-4000-8000-000000000001'
  render(<DataTransferPanel imports={[{ id,kind: 'items',source_name: 'sample.csv',source_sha256: '0'.repeat(64),rows: [{ sku: 'SAMPLE-A',description: 'SAMPLE item',base_uom: 'pcs' }],errors: [{ row: 1,message: 'SAMPLE duplicate code' }],status: 'preview',created_at: '2031-01-01',approval_reason: null,records: [] }]} exports={[]} kind="items" source={null} fileError={null} reading={false} permissions={['imports.read','imports.approve']} online busy={false} loading={false} error={false} onKind={vi.fn()} onFile={vi.fn()} onCommand={vi.fn()} onDownload={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Import batch'),{ target: { value: id } })
  expect(screen.getByRole('button',{ name: 'Apply reviewed import' })).toBeDisabled()
  expect(screen.getByText('Data row 1: SAMPLE duplicate code')).toBeInTheDocument()
})
