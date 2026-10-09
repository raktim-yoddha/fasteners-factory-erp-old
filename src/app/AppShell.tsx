import { useState } from 'react'
import { UpdatePrompt } from '@/pwa/UpdatePrompt'
import { OperationsWorkspace } from '@/app/OperationsWorkspace'
import { SignInScreen } from '@/auth/SignInScreen'
import { useAuthSession } from '@/auth/useAuthSession'
import { useAccessibleCompanies } from '@/features/company/useAccessibleCompanies'
import { InitialCompanyBootstrapPanel } from '@/features/company/InitialCompanyBootstrapPanel'
import { useInitialCompanyBootstrap } from '@/features/company/useInitialCompanyBootstrap'
import { useDashboardSummary } from '@/features/dashboard/useDashboardSummary'
import { MasterDataSetupPanel } from '@/features/master-data/MasterDataSetupPanel'
import { useCreateMasterData } from '@/features/master-data/useCreateMasterData'
import { useMasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import { StockActionsPanel } from '@/features/stock/StockActionsPanel'
import { useStockCommands } from '@/features/stock/useStockCommands'
import { useStockLots } from '@/features/stock/useStockLots'
import { CreateRfqPanel } from '@/features/sales/CreateRfqPanel'
import { useCreateRfq } from '@/features/sales/useCreateRfq'
import { useCustomers } from '@/features/sales/useCustomers'
import { CommercialWorkflowPanel } from '@/features/sales/CommercialWorkflowPanel'
import { useCommercialCommands, useCommercialRecords } from '@/features/sales/useCommercialWorkflow'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export function AppShell() {
  const { loading, session } = useAuthSession()
  const dashboardSummary = useDashboardSummary(Boolean(session))
  const companies = useAccessibleCompanies(Boolean(session))
  const bootstrapCompany = useInitialCompanyBootstrap()
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const accessibleCompanies = companies.data ?? []
  const activeCompanyId = accessibleCompanies.length === 1
    ? accessibleCompanies[0]!.id
    : accessibleCompanies.some((company) => company.id === selectedCompanyId) ? selectedCompanyId : null
  const customers = useCustomers(activeCompanyId)
  const createRfq = useCreateRfq()
  const commercialRecords = useCommercialRecords(activeCompanyId)
  const commercialCommands = useCommercialCommands()
  const masterDataOptions = useMasterDataOptions(activeCompanyId)
  const createMasterData = useCreateMasterData()
  const stockLots = useStockLots(activeCompanyId)
  const stockCommands = useStockCommands()

  async function requestSignInLink(email: string) {
    if (!supabase) return 'The backend connection is not configured.'
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false }
    })
    return error ? error.message : 'Check your email for the secure sign-in link.'
  }

  async function signOut() {
    await supabase?.auth.signOut()
  }

  if (loading) return <main className="min-h-dvh bg-canvas p-6 text-ink">Loading secure workspace…</main>

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-dvh bg-canvas px-4 py-6 text-ink sm:px-6 lg:px-10">
        <section className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-3xl content-center rounded-2xl border border-line bg-panel p-6 shadow-sm sm:p-10">
          <h1 className="text-sm font-semibold tracking-wide text-brand">FASTENERS FACTORY ERP</h1>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">Backend setup is required.</h2>
          <p className="mt-4 max-w-prose leading-7 text-muted">This installable app is ready, but it will not show or change factory records until its hosted Supabase connection is configured.</p>
        </section>
        <UpdatePrompt />
      </main>
    )
  }

  if (!session) return <SignInScreen onRequestLink={requestSignInLink} />

  return (
    <>
      <OperationsWorkspace
        email={session.user.email ?? 'Approved user'}
        onSignOut={signOut}
        summary={dashboardSummary.data}
        summaryError={dashboardSummary.isError}
        companies={accessibleCompanies}
        companyId={activeCompanyId}
        onCompanyChange={setSelectedCompanyId}
        canBootstrap={companies.isSuccess && accessibleCompanies.length === 0}
        salesPanel={<>
          <CreateRfqPanel
            companyId={activeCompanyId}
            customers={customers.data ?? []}
            creating={createRfq.isPending}
            error={createRfq.error instanceof Error ? createRfq.error.message : null}
            onCreate={(input) => createRfq.mutate(input)}
          />
          <CommercialWorkflowPanel
            companyId={activeCompanyId}
            items={(masterDataOptions.data ?? { plants: [], warehouses: [], items: [], locations: [] }).items}
            records={commercialRecords.data ?? { rfqs: [], quotations: [], salesOrders: [], salesOrderLines: [] }}
            busy={commercialCommands.feasibility.isPending || commercialCommands.quotation.isPending || commercialCommands.approve.isPending || commercialCommands.accept.isPending}
            onFeasibility={(input) => commercialCommands.feasibility.mutateAsync(input)}
            onQuotation={(input) => commercialCommands.quotation.mutateAsync(input)}
            onApprove={(input) => commercialCommands.approve.mutateAsync(input)}
            onAccept={(input) => commercialCommands.accept.mutateAsync(input)}
          />
        </>}
        setupPanel={
          <InitialCompanyBootstrapPanel
            bootstrapping={bootstrapCompany.isPending}
            error={bootstrapCompany.error instanceof Error ? bootstrapCompany.error.message : null}
            onBootstrap={(input) => bootstrapCompany.mutate(input)}
          />
        }
        masterDataPanel={
          <MasterDataSetupPanel
            companyId={activeCompanyId}
            options={masterDataOptions.data ?? { plants: [], warehouses: [], items: [], locations: [] }}
            creating={createMasterData.isPending}
            onCreate={async (command) => createMasterData.mutateAsync(command)}
          />
        }
        stockPanel={<StockActionsPanel companyId={activeCompanyId} options={masterDataOptions.data ?? { plants: [], warehouses: [], items: [], locations: [] }} lots={stockLots.data ?? []} records={commercialRecords.data ?? { rfqs: [], quotations: [], salesOrders: [], salesOrderLines: [] }} receiving={stockCommands.receipt.isPending} releasing={stockCommands.release.isPending} reserving={stockCommands.reserve.isPending} onReceive={async (input) => { await stockCommands.receipt.mutateAsync(input) }} onRelease={async (input) => { await stockCommands.release.mutateAsync(input) }} onReserve={async (input) => { await stockCommands.reserve.mutateAsync(input) }} />}
      />
      <UpdatePrompt />
    </>
  )
}
