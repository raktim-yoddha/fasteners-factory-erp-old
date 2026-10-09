import { describe, expect, it } from 'vitest'
import { formatCommandError } from '@/lib/commandError'

describe('formatCommandError', () => {
  it('turns protected stock errors into an actionable blocked reason', () => {
    expect(formatCommandError({ message: 'INSUFFICIENT_AVAILABLE_STOCK' }, 'fallback')).toBe('Blocked because released stock is insufficient for this reservation.')
  })

  it('does not expose unknown server details', () => {
    expect(formatCommandError(new Error('database detail'), 'the operation could not be completed.')).toBe('Blocked because the operation could not be completed.')
  })
})
