import { useState } from 'react'

type SignInScreenProps = {
  onRequestLink: (email: string) => Promise<string | null>
  onSolo?: () => void
}

export function SignInScreen({ onRequestLink, onSolo }: SignInScreenProps) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(await onRequestLink(email))
    setSubmitting(false)
  }

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 text-ink sm:px-6 lg:px-10">
      <section className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-5xl content-center gap-8 rounded-2xl border border-line bg-panel p-6 shadow-sm sm:p-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-sm font-semibold tracking-wide text-brand">FASTENERS FACTORY ERP</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Factory operations, kept accountable.</h1>
          <p className="mt-4 max-w-prose text-base leading-7 text-muted">
            Use your approved work email. Access and data permissions are enforced by the factory backend.
          </p>
          {onSolo && <button className="secondary-button mt-5" type="button" onClick={onSolo}>Use solo on this device</button>}
          <p className="mt-3 text-sm text-muted">Solo records stay in this browser. Keep backups before changing device or clearing browser data.</p>
        </div>
        <form className="rounded-xl border border-line bg-canvas p-5" onSubmit={handleSubmit}>
          <h2 className="text-lg font-bold">Sign in</h2>
          <p className="mt-1 text-sm leading-6 text-muted">We will send a one-time sign-in link to an already approved account.</p>
          <label className="mt-5 grid gap-2 text-sm font-semibold" htmlFor="email">
            Work email
            <input
              className="min-h-11 rounded-lg border border-line bg-panel px-3 text-base font-normal"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button className="primary-button mt-5 w-full" disabled={submitting} type="submit">
            {submitting ? 'Sending secure link…' : 'Email me a sign-in link'}
          </button>
          {message ? <p className="mt-4 rounded-lg border border-line bg-panel p-3 text-sm leading-6" role="status">{message}</p> : null}
        </form>
      </section>
    </main>
  )
}
