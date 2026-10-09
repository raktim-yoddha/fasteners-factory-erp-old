const messages = {
  UNAUTHENTICATED: 'your secure session has expired. Sign in again.',
  FORBIDDEN: 'your role does not have permission for this action.',
  REVISION_CONFLICT: 'this record changed before the server could confirm your action. Refresh and try again.',
  INVALID_TRANSITION: 'this record is no longer ready for that step.',
  INSUFFICIENT_AVAILABLE_STOCK: 'released stock is insufficient for this reservation.',
  INSUFFICIENT_RESERVED_STOCK: 'the selected reservation no longer has enough quantity.',
  INSUFFICIENT_ON_HAND_STOCK: 'on-hand stock changed before dispatch could be confirmed.',
  LOT_QC_HOLD: 'the lot is still on QC hold.',
  LOT_ITEM_MISMATCH: 'the lot does not match the selected sales-order item.',
  UOM_MISMATCH: 'the quantity unit does not match the item.',
  ENGINEERING_REVISION_NOT_APPROVED: 'the selected engineering revision is not approved.',
  INITIAL_COMPANY_ALREADY_EXISTS: 'the first company has already been created.',
  DUPLICATE_RESERVATION_LINE: 'the same reservation was selected more than once.'
} as const

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message
  return ''
}

export function formatCommandError(error: unknown, fallback: string) {
  const message = errorMessage(error)
  const code = Object.keys(messages).find((candidate) => message.includes(candidate)) as keyof typeof messages | undefined
  return `Blocked because ${code ? messages[code] : fallback}`
}
