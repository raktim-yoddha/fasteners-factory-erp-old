import { describe, expect, it } from 'vitest'
import { formatCommandError } from '@/lib/commandError'

it('turns identifier collisions into a useful action without exposing constraint details', () => {
  const message = formatCommandError({ code: '23505', message: 'duplicate key value violates unique constraint SAMPLE_private_constraint' }, 'the action failed.')
  expect(message).toContain('identifier is already in use')
  expect(message).not.toContain('SAMPLE_private_constraint')
})

describe('formatCommandError', () => {
  it('turns protected stock errors into an actionable blocked reason', () => {
    expect(formatCommandError({ message: 'INSUFFICIENT_AVAILABLE_STOCK' }, 'fallback')).toBe('Blocked because released, unreserved stock is insufficient for this quantity.')
  })

  it('does not expose unknown server details', () => {
    expect(formatCommandError(new Error('database detail'), 'the operation could not be completed.')).toBe('Blocked because the operation could not be completed.')
  })
})
