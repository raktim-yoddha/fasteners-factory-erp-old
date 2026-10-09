import { useState } from 'react'
import type { ReactNode } from 'react'
import type { AccessibleCompany } from '@/features/company/useAccessibleCompanies'
import type { DashboardSummary } from '@/features/dashboard/useDashboardSummary'
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
  summary: DashboardSummary | undefined
  summaryError: boolean
  companies: AccessibleCompany[]
  companyId: string | null
  onCompanyChange: (companyId: string) => void
  salesPanel: ReactNode
  setupPanel: ReactNode
  masterDataPanel: ReactNode
  canBootstrap: boolean
}

export function OperationsWorkspace({
  email, onSignOut, summary, summaryError, companies, companyId, onCompanyChange, salesPanel, setupPanel, masterDataPanel, canBootstrap
}: OperationsWorkspaceProps) {
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
          <label className="form-label mt-5 max-w-sm">Active company
            <select className="form-input" value={companyId ?? ''} onChange={(event) => onCompanyChange(event.target.value)}>
              <option value="">{companies.length === 0 ? 'No accessible company' : 'Select company'}</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          {canBootstrap ? setupPanel : null}
          <section className="mt-6 rounded-xl border border-line bg-panel p-5" aria-labelledby="records-title">
            <h3 className="font-bold" id="records-title">{summaryError ? 'Records could not be loaded' : 'Live company records'}</h3>
            <p className="mt-2 max-w-prose text-sm leading-6 text-muted">
              {summaryError
                ? 'The backend rejected or could not complete this read. Check your connection and company permissions before retrying.'
                : summary
                  ? 'Counts reflect only the records allowed by your current company permissions.'
                  : 'Loading your company-scoped records…'}
            </p>
          </section>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Workflow status">
            {[
              ['Open RFQs', summary?.rfqs],
              ['Sales orders', summary?.salesOrders],
              ['Available lots', summary?.availableLots],
              ['Shipments', summary?.shipments],
              ['Quality release', undefined],
              ['Audit trail', undefined]
            ].map(([label, count]) => (
              <article className="rounded-xl border border-line bg-panel p-4" key={label}>
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-2 text-sm text-muted">{typeof count === 'number' ? count : 'Not connected in this MVP'}</p>
              </article>
            ))}
          </section>
          {activeModule === 1 ? salesPanel : null}
          {activeModule === 4 ? masterDataPanel : null}
        </section>
      </div>
    </main>
  )
}
