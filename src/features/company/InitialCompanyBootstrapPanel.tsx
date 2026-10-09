import { useState } from 'react'
import type { InitialCompanyBootstrapInput } from '@/features/company/useInitialCompanyBootstrap'

type InitialCompanyBootstrapPanelProps = {
  bootstrapping: boolean
  error: string | null
  onBootstrap: (input: InitialCompanyBootstrapInput) => void
}

export function InitialCompanyBootstrapPanel({ bootstrapping, error, onBootstrap }: InitialCompanyBootstrapPanelProps) {
  const [companyName, setCompanyName] = useState('')
  const [plantName, setPlantName] = useState('')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onBootstrap({ companyName, plantName })
  }

  return (
    <section className="mt-6 rounded-xl border border-line bg-panel p-5" aria-labelledby="company-bootstrap-title">
      <h3 className="font-bold" id="company-bootstrap-title">Set up the first company</h3>
      <p className="mt-1 text-sm leading-6 text-muted">This one-time action makes you the first company administrator. It is unavailable after a company already exists.</p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className="form-label">Company name
          <input className="form-input" required value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
        </label>
        <label className="form-label">First plant name
          <input className="form-input" required value={plantName} onChange={(event) => setPlantName(event.target.value)} />
        </label>
        <div className="sm:col-span-2"><button className="primary-button" disabled={bootstrapping} type="submit">{bootstrapping ? 'Creating secure setup…' : 'Create company and plant'}</button></div>
      </form>
      {error ? <p className="mt-4 rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning" role="alert">{error}</p> : null}
    </section>
  )
}
