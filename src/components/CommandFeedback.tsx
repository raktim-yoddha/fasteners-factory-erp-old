export function CommandFeedback({ message }: { message: string | null }) {
  if (!message) return null
  const blocked = message.startsWith('Blocked because')
  return (
    <p
      className={blocked ? 'feedback feedback-blocked' : 'feedback'}
      role={blocked ? 'alert' : 'status'}
    >
      {blocked ? '⚠ ' : '✓ '}
      {message}
    </p>
  )
}
