import { describe, it, expect } from 'vitest'
import { displayDecimal, positiveDecimalSchema, priceSchema } from '@/lib/decimal'

describe('decimal command boundaries', () => {
  it('formats insignificant zeros while retaining exact large and signed values', () => {
    expect(displayDecimal('50.0000000000000000')).toBe('50')
    expect(displayDecimal('999999999999.000001000')).toBe('999999999999.000001')
    expect(displayDecimal('-0.0100')).toBe('-0.01')
    expect(displayDecimal('1200')).toBe('1200')
  })
  it('preserves decimal text without binary rounding', () => {
    expect(positiveDecimalSchema.parse('999999999999.123456')).toBe(
      '999999999999.123456',
    )
    expect(priceSchema.parse('99999999999999.1234')).toBe('99999999999999.1234')
    expect(priceSchema.parse('0')).toBe('0')
  })
  it('rejects non-finite, negative, over-precision and empty quantities', () => {
    for (const value of [
      'NaN',
      'Infinity',
      '-1',
      '0',
      '0.000000',
      '1e3',
      '0.0000001',
      '',
      ' 2 ',
    ])
      expect(positiveDecimalSchema.safeParse(value).success, value).toBe(false)
    expect(priceSchema.safeParse('1.12345').success).toBe(false)
  })
})
