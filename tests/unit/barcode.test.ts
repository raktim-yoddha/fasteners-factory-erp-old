import { expect,it } from 'vitest'
import { code39 } from '@/lib/code39'

it('encodes start/stop, standard wide/narrow symbols and ten-module quiet zones', () => {
  const result=code39('A1')!
  // Four symbols, each 6 narrow + 3 wide, three inter-symbol gaps, two quiet zones.
  expect(result.width).toBe(83)
  expect(result.bars).toHaveLength(20)
  expect(result.bars.slice(0,5)).toEqual([{ x: 10,width: 1 },{ x: 14,width: 1 },{ x: 16,width: 3 },{ x: 20,width: 3 },{ x: 24,width: 1 }])
  expect(result.bars.at(-1)!.x+result.bars.at(-1)!.width).toBe(result.width-10)
  expect(result.bars.filter((bar) => bar.width===3)).toHaveLength(8)
})
it('preserves supported identifiers and refuses transformations or embedded delimiters', () => {
  expect(code39('SAMPLE-PACK/01')).not.toBeNull()
  for (const invalid of ['', 'sample-pack','A*B','A\nB','é','A'.repeat(101)]) expect(code39(invalid)).toBeNull()
})
