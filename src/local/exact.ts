// ADR 0019: SQLite stores domain decimals as TEXT; calculations never use REAL.
const scale = 1_000_000n
export function decimal(value: unknown): bigint {
  const text = String(value)
  if (!/^-?\d{1,18}(?:\.\d{1,6})?$/.test(text)) throw new Error('INVALID_QUANTITY')
  const negative = text.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? text.slice(1) : text).split('.')
  const result = BigInt(whole) * scale + BigInt(fraction.padEnd(6, '0'))
  return negative ? -result : result
}
export function format(value: bigint): string {
  const absolute = value < 0n ? -value : value
  const fraction = (absolute % scale).toString().padStart(6, '0').replace(/0+$/, '')
  return `${value < 0n ? '-' : ''}${absolute / scale}${fraction ? `.${fraction}` : ''}`
}
export function quantity(value: unknown, unit?: unknown): string {
  const result = decimal(value)
  if (result <= 0n || ((unit === 'pcs' || unit === 'set') && result % scale !== 0n)) throw new Error('INVALID_QUANTITY')
  return format(result)
}
export function add(...values: unknown[]): string { return format(values.reduce<bigint>((sum, value) => sum + decimal(value), 0n)) }
export function subtract(a: unknown, b: unknown): string { return format(decimal(a) - decimal(b)) }
export function ratio(value: unknown, numerator: unknown, denominator: unknown): string {
  const divisor = decimal(denominator)
  if (divisor <= 0n) throw new Error('INVALID_QUANTITY')
  const product = decimal(value) * decimal(numerator)
  if (product % divisor !== 0n) throw new Error('QUANTITY_PRECISION_EXCEEDED')
  return format(product / divisor)
}
export function requirement(component: unknown, output: unknown, basis: unknown, allowance: unknown, unit: unknown): string {
  const divisor = decimal(basis) * 100n * scale
  if (divisor <= 0n) throw new Error('INVALID_QUANTITY')
  const product = decimal(component) * decimal(output) * (100n * scale + decimal(allowance))
  let value = (product + divisor - 1n) / divisor
  if (unit === 'pcs' || unit === 'set') value = ((value + scale - 1n) / scale) * scale
  return format(value)
}
function financial(value: unknown): bigint {
  const text = String(value)
  if (!/^-?\d{1,36}(?:\.\d{1,12})?$/.test(text)) throw new Error('INVALID_AMOUNT')
  const [whole = '0', fraction = ''] = text.replace('-', '').split('.')
  return (BigInt(whole) * 1_000_000_000_000n + BigInt(fraction.padEnd(12, '0'))) * (text.startsWith('-') ? -1n : 1n)
}
function financialFormat(value: bigint): string {
  const absolute = value < 0n ? -value : value
  const fraction = (absolute % 1_000_000_000_000n).toString().padStart(12, '0').replace(/0+$/, '')
  return `${value < 0n ? '-' : ''}${absolute / 1_000_000_000_000n}${fraction ? `.${fraction}` : ''}`
}
export function multiply(a: unknown, b: unknown): string { return financialFormat(decimal(a) * decimal(b)) }
export function sumAmounts(...values: unknown[]): string { return financialFormat(values.reduce<bigint>((sum, value) => sum + financial(value), 0n)) }
