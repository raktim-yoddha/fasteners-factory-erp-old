import { useState } from 'react'
import { isSupabaseConfigured } from '@/lib/supabase'

const modules = [
  ['Command center', 'Order status across sales, stock, quality and dispatch.'],
  ['Sales orders', 'RFQs, feasibility reviews, quotations and accepted orders.'],
  ['Stock', 'Lots, ledger movements, reservations and availability.'],
  ['Dispatch', 'Packing orders and shipment gate-out.'],
  ['Master data', 'Customers, items, drawings, locations and work centres.']
] as const

type OperationsWorkspaceProps = {
  email: string
  onSignOut: () => Promise<void>
}

export function OperationsWorkspace({ email, onSignOut }: OperationsWorkspaceProps) {
  const [activeModule, setActiveModule] = useState(0)
  const [moduleName, moduleDescription] = modules[activeModule]!

  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-brand">OPERATIONS SYSTEM</p>
            <h1 className="text-lg font-bold">Fasteners Factory ERP</h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-sm text-muted sm:block">{email}</p>
            <button className="secondary-button" type="button" onClick={() => void onSignOut()}>Sign out</button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-screen-2xl lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Main navigation" className="border-b border-line bg-panel p-3 lg:min-h-[calc(100dvh-4rem)] lg:border-b-0 lg:border-r">
          <div className="flex gap-2 overflow-x-auto lg:grid">
            {modules.map(([name], index) => (
              <button
                aria-current={activeModule === index ? 'page' : undefined}
                className={activeModule === index ? 'nav-item nav-item-active' : 'nav-item'}
                key={name}
                type="button"
                onClick={() => setActiveModule(index)}
              >
                {name}
              </button>
            ))}
          </div>
        </nav>
        <section className="p-4 sm:p-6 lg:p-8" aria-labelledby="workspace-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-brand">{activeModule === 0 ? 'Today' : 'Workspace'}</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight" id="workspace-title">{moduleName}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{moduleDescription}</p>
            </div>
            <span className={isSupabaseConfigured ? 'status status-online' : 'status status-offline'}>
              {isSupabaseConfigured ? 'Backend connected' : 'Backend setup required'}
            </span>
          </div>
          <section className="mt-6 rounded-xl border border-line bg-panel p-5" aria-labelledby="records-title">
            <h3 className="font-bold" id="records-title">{isSupabaseConfigured ? 'No permitted records yet' : 'Connect the backend to load records'}</h3>
            <p className="mt-2 max-w-prose text-sm leading-6 text-muted">
              {isSupabaseConfigured
                ? 'Your access is active, but this workspace has no records available for your current company permissions.'
                : 'Set the public Supabase URL and publishable key in the deployment environment. This app does not use local sample records as operational truth.'}
            </p>
          </section>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Workflow status">
            {['Sales order', 'Stock reservation', 'Quality release', 'Packing', 'Shipment', 'Audit trail'].map((label) => (
              <article className="rounded-xl border border-line bg-panel p-4" key={label}>
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-2 text-sm text-muted">No record selected</p>
              </article>
            ))}
          </section>
        </section>
      </div>
    </main>
  )
}
