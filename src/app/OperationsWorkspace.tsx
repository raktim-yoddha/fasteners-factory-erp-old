import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AccessibleCompany } from '@/features/company/useAccessibleCompanies'
import type { DashboardSummary } from '@/features/dashboard/useDashboardSummary'
import { isSupabaseConfigured } from '@/lib/supabase'
import { NetworkStatus } from '@/pwa/NetworkStatus'
import { KeyboardHelpDialog } from '@/app/KeyboardHelpDialog'
import type { WorkspaceMode } from '@/local/mode'

const modules = [
  ['Command center', 'Order status across sales, stock, quality and dispatch.'],
  [
    'Sales orders',
    'RFQs, feasibility reviews, quotations and accepted orders.',
  ],
  ['Stock', 'Lots, ledger movements, reservations and availability.'],
  ['Dispatch', 'Packing orders and shipment gate-out.'],
  [
    'Master data',
    'Customers, suppliers, items, drawings, warehouses, locations and work centres.',
  ],
  [
    'Purchasing',
    'Material requests, approved purchase orders, supplier receipts and returns.',
  ],
  ['Production', 'Approved engineering, material planning, job cards and output lots.'],
  ['Quality', 'Inspection plans, measured results, NCR decisions and lot traceability.'],
  ['Reports', 'Order backlog, shortages, custody aging, quality and stock movement.'],
  ['Administration', 'Approved staff access and company audit history.'],
  ['Data transfer', 'Validated imports, reconciliation and approved accounting handoff.'],
  ['Equipment', 'Tool and gauge readiness, maintenance evidence and shift capacity.'],
] as const

type OperationsWorkspaceProps = {
  mode?: WorkspaceMode
  onSwitchMode?: () => void
  email: string
  onSignOut: () => Promise<void>
  summary: DashboardSummary | undefined
  summaryError: boolean
  companies: AccessibleCompany[]
  companyId: string | null
  onCompanyChange: (companyId: string) => void
  onModuleChange?: (index: number) => void
  salesPanel: ReactNode
  setupPanel: ReactNode
  masterDataPanel: ReactNode
  administrationPanel?: ReactNode
  dataTransferPanel?: ReactNode
  recoveryPanel?: ReactNode
  equipmentPanel?: ReactNode
  stockPanel: ReactNode
  productionPanel?: ReactNode
  qualityPanel?: ReactNode
  reportsPanel?: ReactNode
  procurementPanel?: ReactNode
  accessPanel?: ReactNode
  onOpenOperations?: () => void
  dispatchPanel: ReactNode
  commandCenterPanel: ReactNode
  searchPanel: ReactNode
  recordPanel?: ReactNode
  canBootstrap: boolean
  online?: boolean
  onClearSearch?: () => void
}

export function OperationsWorkspace({
  mode = 'team',
  onSwitchMode,
  email,
  onSignOut,
  summary,
  summaryError,
  companies,
  companyId,
  onCompanyChange,
  onModuleChange,
  salesPanel,
  setupPanel,
  masterDataPanel,
  administrationPanel,
  dataTransferPanel,
  recoveryPanel,
  equipmentPanel,
  stockPanel,
  dispatchPanel,
  commandCenterPanel,
  procurementPanel,
  productionPanel,
  qualityPanel,
  reportsPanel,
  accessPanel,
  onOpenOperations,
  searchPanel,
  recordPanel,
  canBootstrap,
  online = true,
  onClearSearch = () => undefined,
}: OperationsWorkspaceProps) {
  const [activeModule, setActiveModule] = useState(0)
  const [moduleName, moduleDescription] = modules[activeModule]!
  useEffect(() => { onModuleChange?.(0) }, [onModuleChange])

  useEffect(() => {
    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    const onKeyDown = (event: KeyboardEvent) => {
      const search = document.getElementById(
        'global-search-input',
      ) as HTMLInputElement | null
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        search?.focus()
        return
      }
      if (event.key === '/' && !isEditable(event.target)) {
        event.preventDefault()
        search?.focus()
        return
      }
      if (event.key === 'Escape' && search) {
        onClearSearch()
        search.blur()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClearSearch])

  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex min-h-16 max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-brand">
              OPERATIONS SYSTEM
            </p>
            <h1 className="text-lg font-bold">Fasteners Factory ERP</h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-sm text-muted sm:block">{email}</p>
            <KeyboardHelpDialog />
            <button
              className="secondary-button"
              type="button"
              onClick={() => void onSignOut()}
            >
              {mode === 'solo' ? 'Open team mode' : 'Sign out'}
            </button>
            {mode === 'team' && onSwitchMode && <button className="secondary-button" type="button" onClick={onSwitchMode}>Open solo workspace</button>}
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-screen-2xl lg:grid-cols-[var(--spacing-sidebar)_minmax(0,1fr)]">
        <nav
          aria-label="Main navigation"
          className="min-w-0 border-b border-line bg-panel p-3 lg:min-h-[calc(100dvh-4rem)] lg:border-b-0 lg:border-r"
        >
          <div className="flex gap-2 overflow-x-auto lg:grid">
            {modules.map(([name], index) => (
              <button
                aria-current={activeModule === index ? 'page' : undefined}
                className={
                  activeModule === index
                    ? 'nav-item nav-item-active'
                    : 'nav-item'
                }
                key={name}
                type="button"
                onClick={() => {
                  if (recordPanel) onOpenOperations?.()
                  setActiveModule(index)
                  onModuleChange?.(index)
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </nav>
        <section
          className="min-w-0 p-4 sm:p-6 lg:p-8"
          aria-labelledby="workspace-title"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-brand">
                {activeModule === 0 ? 'Today' : 'Workspace'}
              </p>
              <h2
                className="mt-1 text-2xl font-bold tracking-tight"
                id="workspace-title"
              >
                {moduleName}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                {moduleDescription}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <NetworkStatus mode={mode} />
              <span
                className={
                  mode === 'solo' || isSupabaseConfigured
                    ? 'status status-online'
                    : 'status status-offline'
                }
              >
                {mode === 'solo' ? 'Device SQLite' : isSupabaseConfigured
                  ? '◇ Backend configured'
                  : '⚠ Backend setup required'}
              </span>
            </div>
          </div>
          <label className="form-label mt-5 max-w-sm">
            Active company
            <select
              aria-label="Active company"
              className="form-input"
              value={companyId ?? ''}
              onChange={(event) => onCompanyChange(event.target.value)}
            >
              <option value="">
                {companies.length === 0
                  ? 'No accessible company'
                  : 'Select company'}
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          {searchPanel}
          {accessPanel}
          {activeModule === 10 ? recoveryPanel : null}
          {canBootstrap ? setupPanel : null}
          <section
            className="mt-6 rounded-xl border border-line bg-panel p-5"
            aria-labelledby="records-title"
          >
            <h3 className="font-bold" id="records-title">
              {summaryError
                ? 'Records could not be loaded'
                : mode === 'solo' ? 'Device company records' : 'Live company records'}
            </h3>
            <p className="mt-2 max-w-prose text-sm leading-6 text-muted">
              {summaryError
                ? 'The backend rejected or could not complete this read. Check your connection and company permissions before retrying.'
                : summary
                  ? mode === 'solo' ? 'Counts reflect this device’s solo records.' : 'Counts reflect only the records allowed by your current company permissions.'
                  : companyId
                    ? 'Loading your company-scoped records…'
                    : 'Select a company to load permitted records.'}
            </p>
          </section>
          <section
            className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Workflow status"
          >
            {[
              ['RFQs', summary?.rfqs],
              ['Sales orders', summary?.salesOrders],
              ['Available lots', summary?.availableLots],
              ['Shipments', summary?.shipments],
            ].map(([label, count]) => (
              <article
                className="rounded-xl border border-line bg-panel p-4"
                key={label}
              >
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-2 text-sm text-muted">
                  {typeof count === 'number' ? count : 'Loading…'}
                </p>
              </article>
            ))}
          </section>
          {!online && !recordPanel ? (
            <p
              className="mt-6 rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning"
              id="offline-read-only"
              role="alert"
            >
              Blocked because this device is offline. Commands are disabled
              until the server connection returns.
            </p>
          ) : null}
          {recordPanel ?? (
            <fieldset
              aria-describedby={online ? undefined : 'offline-read-only'}
              className="min-w-0 border-0 p-0"
              disabled={!online}
            >
              {activeModule === 0 ? commandCenterPanel : null}
              {activeModule === 1 ? salesPanel : null}
              {activeModule === 4 ? masterDataPanel : null}
              {activeModule === 9 ? administrationPanel : null}
              {activeModule === 10 ? dataTransferPanel : null}
              {activeModule === 11 ? equipmentPanel : null}
              {activeModule === 2 ? stockPanel : null}
              {activeModule === 3 ? dispatchPanel : null}
              {activeModule === 5 ? procurementPanel : null}
              {activeModule === 6 ? productionPanel : null}
              {activeModule === 7 ? qualityPanel : null}
              {activeModule === 8 ? reportsPanel : null}
            </fieldset>
          )}
        </section>
      </div>
    </main>
  )
}
