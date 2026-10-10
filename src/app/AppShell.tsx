import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { UpdatePrompt } from '@/pwa/UpdatePrompt'
import { OperationsWorkspace } from '@/app/OperationsWorkspace'
import { SignInScreen } from '@/auth/SignInScreen'
import { useAuthSession } from '@/auth/useAuthSession'
import { useAccessibleCompanies } from '@/features/company/useAccessibleCompanies'
import { InitialCompanyBootstrapPanel } from '@/features/company/InitialCompanyBootstrapPanel'
import { useInitialCompanyBootstrap } from '@/features/company/useInitialCompanyBootstrap'
import { useDashboardSummary } from '@/features/dashboard/useDashboardSummary'
import { OrderCommandCenterPanel } from '@/features/dashboard/OrderCommandCenterPanel'
import { useOrderCommandCenter } from '@/features/dashboard/useOrderCommandCenter'
import { GlobalSearchPanel } from '@/features/search/GlobalSearchPanel'
import { recordKindFromSearchResult } from '@/features/records/recordTypes'
import { RecordWorkspacePanel } from '@/features/records/RecordWorkspacePanel'
import { useGlobalSearch } from '@/features/search/useGlobalSearch'
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
import { useEngineeringRevisionOptions } from '@/features/sales/useEngineeringRevisionOptions'
import { DispatchPanel } from '@/features/dispatch/DispatchPanel'
import { useDispatchCommands, useDispatchRecords } from '@/features/dispatch/useDispatchWorkflow'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { formatCommandError } from '@/lib/commandError'
import { useNetworkStatus } from '@/pwa/useNetworkStatus'

export function AppShell() {
  const { loading, session } = useAuthSession()
  const companies = useAccessibleCompanies(Boolean(session))
  const bootstrapCompany = useInitialCompanyBootstrap()
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const online = useNetworkStatus()
  const navigate = useNavigate()
  const { recordId, recordType } = useParams()
  const accessibleCompanies = companies.data ?? []
  const activeCompanyId = accessibleCompanies.length === 1
    ? accessibleCompanies[0]!.id
    : accessibleCompanies.some((company) => company.id === selectedCompanyId) ? selectedCompanyId : null
  const dashboardSummary = useDashboardSummary(activeCompanyId)
  const orderCommandCenter = useOrderCommandCenter(activeCompanyId)
  const globalSearch = useGlobalSearch(activeCompanyId, searchQuery)
  const customers = useCustomers(activeCompanyId)
  const createRfq = useCreateRfq()
  const commercialRecords = useCommercialRecords(activeCompanyId)
  const engineeringRevisions = useEngineeringRevisionOptions(activeCompanyId)
  const commercialCommands = useCommercialCommands()
  const dispatchRecords = useDispatchRecords(activeCompanyId)
  const dispatchCommands = useDispatchCommands()
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
        online={online}
        searchPanel={<GlobalSearchPanel companyId={activeCompanyId} error={globalSearch.isError} loading={globalSearch.isFetching} onQueryChange={setSearchQuery} onOpenRecord={(result) => { const kind = recordKindFromSearchResult(result); if (kind) navigate(`/records/${kind}/${result.record_id}`) }} query={searchQuery} results={globalSearch.data ?? []} />}
        recordPanel={recordType || recordId ? <RecordWorkspacePanel companyId={activeCompanyId} recordId={recordId} recordType={recordType} onBack={() => navigate('/')} onOpenRecord={(kind, id) => navigate(`/records/${kind}/${id}`)} /> : null}
        onClearSearch={() => setSearchQuery('')}
        salesPanel={<>
          <CreateRfqPanel
            companyId={activeCompanyId}
            customers={customers.data ?? []}
            creating={createRfq.isPending}
            error={createRfq.error ? formatCommandError(createRfq.error, 'the RFQ could not be created. Check the required details and try again.') : null}
            onCreate={(input) => createRfq.mutate(input)}
          />
          <CommercialWorkflowPanel
            companyId={activeCompanyId}
            items={(masterDataOptions.data ?? { plants: [], warehouses: [], items: [], locations: [] }).items}
            engineering={engineeringRevisions.data ?? { drawings: [], boms: [], routings: [] }}
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
            error={bootstrapCompany.error ? formatCommandError(bootstrapCompany.error, 'the initial company setup could not be completed.') : null}
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
        stockPanel={<StockActionsPanel companyId={activeCompanyId} online={online} options={masterDataOptions.data ?? { plants: [], warehouses: [], items: [], locations: [] }} lots={stockLots.data ?? []} records={commercialRecords.data ?? { rfqs: [], quotations: [], salesOrders: [], salesOrderLines: [] }} receiving={stockCommands.receipt.isPending} releasing={stockCommands.release.isPending} reserving={stockCommands.reserve.isPending} onReceive={async (input) => { await stockCommands.receipt.mutateAsync(input) }} onRelease={async (input) => { await stockCommands.release.mutateAsync(input) }} onReserve={async (input) => { await stockCommands.reserve.mutateAsync(input) }} />}
        dispatchPanel={<DispatchPanel companyId={activeCompanyId} commercial={commercialRecords.data ?? { rfqs: [], quotations: [], salesOrders: [], salesOrderLines: [] }} dispatchRecords={dispatchRecords.data ?? { reservations: [], shipments: [] }} busy={dispatchCommands.prepare.isPending || dispatchCommands.dispatch.isPending} online={online} onPrepare={(input) => dispatchCommands.prepare.mutateAsync(input)} onDispatch={(input) => dispatchCommands.dispatch.mutateAsync(input)} />}
        commandCenterPanel={<OrderCommandCenterPanel rows={orderCommandCenter.data ?? []} loading={orderCommandCenter.isLoading} error={orderCommandCenter.isError} />}
      />
      <UpdatePrompt />
    </>
  )
}
