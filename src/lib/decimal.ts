import { z } from 'zod'

// ADR 0016: transmit NUMERIC values as text; the database owns business arithmetic.
export const decimalSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(
    z
      .string()
      .regex(
        /^\d{1,12}(?:\.\d{1,6})?$/,
        'Use a decimal with up to six decimal places.',
      ),
  )
export const positiveDecimalSchema = decimalSchema.refine(
  (value) => /[1-9]/.test(value),
  'Quantity must be positive.',
)
export const priceSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(
    z
      .string()
      .regex(
        /^\d{1,14}(?:\.\d{1,4})?$/,
        'Use a price with up to four decimal places.',
      ),
  )

export function plantDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Remove insignificant display zeros without parsing exact database numbers as floats. */
export function displayDecimal(value: string) {
  return value.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, '$1')
}

export function plantTimestamp(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}
