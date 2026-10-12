import { lazy, useState } from 'react'
import { workspaceMode, selectWorkspaceMode } from '@/local/mode'
import { WorkspaceBoundary } from '@/components/WorkspaceBoundary'
import { DrawingFilesPanel } from '@/features/production/DrawingFilesPanel'
import { useDrawingCommands, useDrawingWorkspace } from '@/features/production/useDrawingWorkspace'
import { CustomerPartsPanel } from '@/features/master-data/CustomerPartsPanel'
import { ItemControlsPanel } from '@/features/master-data/ItemControlsPanel'
import { useItemControls, useItemControlCommand } from '@/features/master-data/useItemControls'
import { useCustomerPartCommand, useCustomerParts } from '@/features/master-data/useCustomerParts'
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
import { ScannerWorkspace } from '@/features/search/ScannerWorkspace'
import { recordKindFromSearchResult } from '@/features/records/recordTypes'
import { RecordWorkspacePanel } from '@/features/records/RecordWorkspacePanel'
import { useGlobalSearch } from '@/features/search/useGlobalSearch'
import { MasterDataSetupPanel } from '@/features/master-data/MasterDataSetupPanel'
import { useCreateMasterData } from '@/features/master-data/useCreateMasterData'
import { useMasterDataOptions } from '@/features/master-data/useMasterDataOptions'
import { StockActionsPanel } from '@/features/stock/StockActionsPanel'
import { useStockCommands, useStockReservations } from '@/features/stock/useStockCommands'
import { useStockLots } from '@/features/stock/useStockLots'
import { CreateRfqPanel } from '@/features/sales/CreateRfqPanel'
import { useCreateRfq } from '@/features/sales/useCreateRfq'
import { useCustomers } from '@/features/sales/useCustomers'
import {
  useCommercialCommands,
  useCommercialRecords,
} from '@/features/sales/useCommercialWorkflow'
import { useEngineeringRevisionOptions } from '@/features/sales/useEngineeringRevisionOptions'
import { DispatchPanel } from '@/features/dispatch/DispatchPanel'
import {
  useDispatchCommands,
  useDispatchRecords,
} from '@/features/dispatch/useDispatchWorkflow'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { formatCommandError } from '@/lib/commandError'
import { useNetworkStatus } from '@/pwa/useNetworkStatus'
import { CommercialInbox } from '@/features/sales/CommercialInbox'
import { useCommercialDetail } from '@/features/sales/useCommercialDetail'
import { useCompanyPermissions } from '@/features/company/useCompanyPermissions'
import {
  useProcurement,
  useMaterialCommand,
} from '@/features/procurement/useProcurement'
import { ProcurementPanel } from '@/features/procurement/ProcurementPanel'
import {
  useStockExplorer,
  useStockMovements,
} from '@/features/stock/useStockExplorer'
import { StockExplorerPanel } from '@/features/stock/StockExplorerPanel'
import { StockReviewPanel } from '@/features/stock/StockReviewPanel'
import { MaterialDetailsPanel } from '@/features/master-data/MaterialDetailsPanel'
import { useProductionWorkspace, useProductionCommand } from '@/features/production/useProductionWorkspace'
import { LotTransformPanel } from '@/features/stock/LotTransformPanel'
import { useLotTransformation } from '@/features/stock/useLotTransformations'
import { useLotDocuments, useLotDocumentCommands } from '@/features/quality/useLotDocuments'
import { useQualityWorkspace, useQualityCommand } from '@/features/quality/useQualityWorkspace'
import { CustomerReturnsPanel } from '@/features/dispatch/CustomerReturnsPanel'
import { ShipmentPackagesPanel } from '@/features/dispatch/ShipmentPackagesPanel'
import { useShipmentPackages, useAddShipmentPackage } from '@/features/dispatch/useShipmentPackages'
import { useCustomerReturns, useReceiveCustomerReturn } from '@/features/dispatch/useCustomerReturns'
import { VendorJobworkPanel } from '@/features/jobwork/VendorJobworkPanel'
import { useVendorJobwork, useVendorCommand } from '@/features/jobwork/useVendorJobwork'

const ProductionPanel = lazy(() => import('@/features/production/ProductionPanel').then((module) => ({ default: module.ProductionPanel })))
const CommercialWorkflowPanel = lazy(() => import('@/features/sales/CommercialWorkflowPanel').then((module) => ({ default: module.CommercialWorkflowPanel })))
const QualityPanel = lazy(() => import('@/features/quality/QualityPanel').then((module) => ({ default: module.QualityPanel })))
const FactoryReportsWorkspace = lazy(() => import('@/features/reports/FactoryReportsWorkspace').then((module) => ({ default: module.FactoryReportsWorkspace })))
const AdministrationWorkspace = lazy(() => import('@/features/administration/AdministrationWorkspace').then((module) => ({ default: module.AdministrationWorkspace })))
const DataTransferWorkspace = lazy(() => import('@/features/data-transfer/DataTransferWorkspace').then((module) => ({ default: module.DataTransferWorkspace })))
const EquipmentWorkspace = lazy(() => import('@/features/equipment/EquipmentWorkspace').then((module) => ({ default: module.EquipmentWorkspace })))
const SoloRecoveryWorkspace = lazy(() => import('@/local/SoloRecoveryWorkspace').then((module) => ({ default: module.SoloRecoveryWorkspace })))

export function AppShell() {
  const { loading, session, owner, error: localError } = useAuthSession()
  const actorId = owner?.id ?? session?.user.id ?? null
  const companies = useAccessibleCompanies(Boolean(actorId))
  const bootstrapCompany = useInitialCompanyBootstrap()
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null,
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRfqId, setSelectedRfqId] = useState<string | null>(null)
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null)
  const [stockBeforeId,setStockBeforeId]=useState<string|null>(null)
  const [stockPrevious,setStockPrevious]=useState<(string|null)[]>([])
  const [commercialDetailId, setCommercialDetailId] = useState<string | null>(
    null,
  )
  const online = useNetworkStatus()
  const [dispatchSection, setDispatchSection] = useState<'dispatch' | 'returns'>('dispatch')
  const [purchasingSection, setPurchasingSection] = useState<'purchase' | 'vendor'>('purchase')
  const [masterDataSection, setMasterDataSection] = useState<'factory' | 'customer-parts' | 'item-controls'>('factory')
  const [activeWorkspace, setActiveWorkspace] = useState(0)
  const navigate = useNavigate()
  const { recordId, recordType } = useParams()
  const accessibleCompanies = companies.data ?? []
  const activeCompanyId =
    accessibleCompanies.length === 1
      ? accessibleCompanies[0]!.id
      : accessibleCompanies.some((company) => company.id === selectedCompanyId)
        ? selectedCompanyId
        : null
  const companyPermissions = useCompanyPermissions(activeCompanyId)
  const permissions = companyPermissions.data ?? []
  const dashboardSummary = useDashboardSummary(activeCompanyId)
  const orderCommandCenter = useOrderCommandCenter(activeCompanyId)
  const globalSearch = useGlobalSearch(activeCompanyId, searchQuery)
  const customers = useCustomers(activeCompanyId)
  const createRfq = useCreateRfq()
  const commercialRecords = useCommercialRecords(activeCompanyId)
  const commercialDetail = useCommercialDetail(
    activeCompanyId,
    commercialDetailId ?? selectedRfqId,
  )
  const engineeringRevisions = useEngineeringRevisionOptions(activeCompanyId)
  const commercialCommands = useCommercialCommands(actorId)
  const customerParts = useCustomerParts(activeCompanyId, permissions.includes('customer_parts.read'))
  const customerPartCommand = useCustomerPartCommand(activeCompanyId, actorId)
  const itemControls = useItemControls(activeCompanyId, permissions.includes('item_controls.read'))
  const itemControlCommand = useItemControlCommand(activeCompanyId, actorId)
  const dispatchRecords = useDispatchRecords(activeCompanyId, permissions.includes('dispatch.read'))
  const dispatchCommands = useDispatchCommands(actorId)
  const masterDataOptions = useMasterDataOptions(activeCompanyId)
  const createMasterData = useCreateMasterData()
  const stockLots = useStockLots(activeCompanyId)
  const stockCommands = useStockCommands()
  const stockReservations = useStockReservations(activeCompanyId)
  const procurement = useProcurement(activeCompanyId)
  const materialCommand = useMaterialCommand()
  const stockExplorer = useStockExplorer(activeCompanyId)
  const stockMovements = useStockMovements(activeCompanyId, selectedLotId, stockBeforeId)
  const production = useProductionWorkspace(activeCompanyId, !recordType && (activeWorkspace === 6 || activeWorkspace === 7))
  const productionCommand = useProductionCommand(activeCompanyId)
  const quality = useQualityWorkspace(activeCompanyId, !recordType && activeWorkspace === 7)
  const qualityCommand = useQualityCommand(activeCompanyId)
  const lotTransformation = useLotTransformation(activeCompanyId)
  const lotDocuments = useLotDocuments(activeCompanyId, permissions.includes('documents.read'))
  const documentCommands = useLotDocumentCommands(activeCompanyId)
  const drawingWorkspace = useDrawingWorkspace(activeCompanyId, permissions.includes('drawings.read'))
  const drawingCommands = useDrawingCommands(activeCompanyId, actorId)
  const vendorJobwork = useVendorJobwork(activeCompanyId, permissions.includes('jobwork.read'))
  const vendorCommand = useVendorCommand(activeCompanyId)
  const customerReturns = useCustomerReturns(activeCompanyId, permissions.includes('customer_returns.read'))
  const receiveCustomerReturn = useReceiveCustomerReturn(activeCompanyId)
  const shipmentPackages = useShipmentPackages(activeCompanyId, permissions.includes('dispatch.read'))
  const addShipmentPackage = useAddShipmentPackage(activeCompanyId)
  const options = masterDataOptions.data ?? {
    plants: [],
    warehouses: [],
    items: [],
    locations: [],
  }
  const materialRecords = procurement.data ?? {
    requisitions: [],
    orders: [],
    receipts: [],
    suppliers: [],
    counts: [],
  }

  async function requestSignInLink(email: string) {
    if (!supabase) return 'The backend connection is not configured.'
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: false,
      },
    })
    return error
      ? error.message
      : 'Check your email for the secure sign-in link.'
  }

  async function signOut() {
    if (workspaceMode() === 'solo') selectWorkspaceMode('team')
    else await supabase?.auth.signOut()
  }

  if (loading || (actorId && companies.isLoading && online))
    return (
      <main className="min-h-dvh bg-canvas p-6 text-ink" role="status">
        Loading secure workspace…
      </main>
    )

  if (!isSupabaseConfigured && workspaceMode() !== 'solo') {
    return (
      <main className="min-h-dvh bg-canvas px-4 py-6 text-ink sm:px-6 lg:px-10">
        <section className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-3xl content-center rounded-2xl border border-line bg-panel p-6 shadow-sm sm:p-10">
          <h1 className="text-sm font-semibold tracking-wide text-brand">
            FASTENERS FACTORY ERP
          </h1>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">
            Choose your workspace.
          </h2>
          <p className="mt-4 max-w-prose leading-7 text-muted">
            Use solo on this device without an account. Team collaboration requires a Supabase connection.
          </p>
          <button className="primary-button mt-4" onClick={() => selectWorkspaceMode('solo')}>Use solo on this device</button>
        </section>
        <UpdatePrompt />
      </main>
    )
  }

  if (localError) return <main className="record-panel"><h1>Solo workspace unavailable</h1><p role="alert">{localError}</p><p>Existing records are preserved. Close other tabs, check browser storage and retry.</p><button className="secondary-button" onClick={() => window.location.reload()}>Retry</button><button className="secondary-button" onClick={() => selectWorkspaceMode('team')}>Open team mode</button></main>

  if (!actorId) return <SignInScreen onRequestLink={requestSignInLink} onSolo={() => selectWorkspaceMode('solo')} />

  return (
    <>
      <OperationsWorkspace
        mode={owner ? 'solo' : 'team'}
        onSwitchMode={() => selectWorkspaceMode(owner ? 'team' : 'solo')}
        onModuleChange={setActiveWorkspace}
        key={`${actorId!}-${activeCompanyId}`}
        email={owner ? 'Device owner · Solo workspace' : session?.user.email ?? 'Approved user'}
        onSignOut={signOut}
        summary={dashboardSummary.data}
        summaryError={dashboardSummary.isError}
        companies={accessibleCompanies}
        companyId={activeCompanyId}
        onCompanyChange={(id) => {
          setSelectedCompanyId(id)
          setSearchQuery('')
          setSelectedRfqId(null)
          setCommercialDetailId(null)
          setSelectedLotId(null)
          setStockBeforeId(null)
          setStockPrevious([])
          navigate('/')
        }}
        canBootstrap={companies.isSuccess && accessibleCompanies.length === 0}
        onOpenOperations={() => navigate('/')}
        accessPanel={
          owner?.state === 'archived' ? <p className="feedback" role="status">Solo history is read-only. The move to team mode is confirmed; open team mode for new operations.</p>
          : owner?.pending ? <p className="feedback feedback-blocked" role="status">Solo writes are paused for the pending move. Open Data transfer to retry or cancel safely.</p>
          : activeCompanyId && companyPermissions.isError ? (
            <p className="feedback feedback-blocked" role="alert">
              Blocked because action permissions could not be loaded. Refresh to
              retry; commands remain disabled.
            </p>
          ) : activeCompanyId && companyPermissions.isLoading ? (
            <p className="empty-state" role="status">
              Checking permitted actions…
            </p>
          ) : null
        }
        online={online}
        recoveryPanel={owner ? <WorkspaceBoundary label="Solo recovery" onReload={() => window.location.reload()}><SoloRecoveryWorkspace companyId={activeCompanyId} /></WorkspaceBoundary> : null}
        searchPanel={
          <>
          <GlobalSearchPanel
            companyId={activeCompanyId}
            error={globalSearch.isError}
            loading={globalSearch.isFetching}
            onQueryChange={setSearchQuery}
            onOpenRecord={(result) => {
              const kind = recordKindFromSearchResult(result)
              if (kind) navigate(`/records/${kind}/${result.record_id}`)
            }}
            query={searchQuery}
            results={globalSearch.data ?? []}
          />
          <ScannerWorkspace key={activeCompanyId} companyId={activeCompanyId} online={online} onOpen={(result) => { const kind=recordKindFromSearchResult(result);if (kind) navigate(`/records/${kind}/${result.record_id}`) }} />
          </>
        }
        recordPanel={
          recordType || recordId ? (
            <RecordWorkspacePanel
              key={`${activeCompanyId}-${recordType}-${recordId}`}
              companyId={activeCompanyId}
              recordId={recordId}
              recordType={recordType}
              onBack={() => navigate('/')}
              onOpenRecord={(kind, id) => navigate(`/records/${kind}/${id}`)}
            />
          ) : null
        }
        onClearSearch={() => setSearchQuery('')}
        salesPanel={
          <>
            <CommercialInbox
              records={
                commercialRecords.data ?? {
                  rfqs: [],
                  quotations: [],
                  salesOrders: [],
                  salesOrderLines: [],
                }
              }
              customers={customers.data ?? []}
              selectedId={selectedRfqId}
              currentUserId={actorId!}
              loading={commercialRecords.isLoading}
              error={commercialRecords.isError}
              detail={commercialDetail.data}
              detailLoading={commercialDetail.isLoading}
              detailError={commercialDetail.isError}
              onSelect={(id) => {
                setSelectedRfqId(id)
                setCommercialDetailId(id)
              }}
            />
            {permissions.includes('master_data.manage') ? (
              <details className="record-panel">
                <summary className="nav-item">
                  Create customer or item here
                </summary>
                <MasterDataSetupPanel
                  companyId={activeCompanyId}
                  only="commercial"
                  options={options}
                  creating={createMasterData.isPending}
                  onCreate={async (command) => {
                    await createMasterData.mutateAsync(command)
                  }}
                />
              </details>
            ) : (
              <p className="empty-state">
                Missing a customer or item? Ask an authorized master-data owner
                to create it.
              </p>
            )}
            <fieldset
              className="min-w-0 border-0 p-0"
              disabled={!permissions.includes('sales.manage')}
            >
              <CreateRfqPanel
                companyId={activeCompanyId}
                customers={customers.data ?? []}
                creating={createRfq.isPending}
                error={
                  createRfq.error
                    ? formatCommandError(
                        createRfq.error,
                        'the RFQ could not be created. Check the required details and try again.',
                      )
                    : null
                }
                onCreate={(input) => createRfq.mutate(input)}
              />
            </fieldset>
            <WorkspaceBoundary label="Sales" onReload={() => window.location.reload()}><CommercialWorkflowPanel
              key={`${activeCompanyId}-${selectedRfqId}`}
              focusedRfqId={selectedRfqId}
              onLoadRfq={setCommercialDetailId}
              permissions={permissions}
              detail={commercialDetail.data}
              onPrint={() => window.print()}
              companyId={activeCompanyId}
              items={
                (
                  masterDataOptions.data ?? {
                    plants: [],
                    warehouses: [],
                    items: [],
                    locations: [],
                  }
                ).items
              }
              engineering={
                engineeringRevisions.data ?? {
                  drawings: [],
                  boms: [],
                  routings: [],
                }
              }
              records={
                commercialRecords.data ?? {
                  rfqs: [],
                  quotations: [],
                  salesOrders: [],
                  salesOrderLines: [],
                }
              }
              busy={
                commercialCommands.feasibility.isPending ||
                commercialCommands.quotation.isPending ||
                commercialCommands.approve.isPending ||
                commercialCommands.accept.isPending
              }
              onFeasibility={(input) =>
                commercialCommands.feasibility.mutateAsync(input)
              }
              onQuotation={(input) =>
                commercialCommands.quotation.mutateAsync(input)
              }
              customerParts={customerParts.data}
              specifications={itemControls.data?.specifications}
              onApprove={(input) =>
                commercialCommands.approve.mutateAsync(input)
              }
              onAccept={(input) => commercialCommands.accept.mutateAsync(input)}
            /></WorkspaceBoundary>
          </>
        }
        setupPanel={
          <InitialCompanyBootstrapPanel
            bootstrapping={bootstrapCompany.isPending}
            error={
              bootstrapCompany.error
                ? formatCommandError(
                    bootstrapCompany.error,
                    'the initial company setup could not be completed.',
                  )
                : null
            }
            onBootstrap={(input) => bootstrapCompany.mutate(input)}
          />
        }
        masterDataPanel={
          <>
          <nav className="filter-bar" aria-label="Master data workspaces">
            <button className="secondary-button" type="button" aria-pressed={masterDataSection === 'factory'} onClick={() => setMasterDataSection('factory')}>Factory masters</button>
            {permissions.includes('customer_parts.read') && <button className="secondary-button" type="button" aria-pressed={masterDataSection === 'customer-parts'} onClick={() => setMasterDataSection('customer-parts')}>Customer part references</button>}
            {permissions.includes('item_controls.read') && <button className="secondary-button" type="button" aria-pressed={masterDataSection === 'item-controls'} onClick={() => setMasterDataSection('item-controls')}>Specifications and units</button>}
          </nav>
          {masterDataSection === 'factory' && <fieldset
            className="min-w-0 border-0 p-0"
            disabled={!permissions.includes('master_data.manage')}
          >
            <MasterDataSetupPanel
              companyId={activeCompanyId}
              options={
                masterDataOptions.data ?? {
                  plants: [],
                  warehouses: [],
                  items: [],
                  locations: [],
                }
              }
              creating={createMasterData.isPending}
              onCreate={async (command) =>
                createMasterData.mutateAsync(command)
              }
            />
          </fieldset>}
          {masterDataSection === 'customer-parts' && permissions.includes('customer_parts.read') && <CustomerPartsPanel key={activeCompanyId} parts={customerParts.data ?? []}
            customers={customers.data ?? []} items={options.items} engineering={engineeringRevisions.data ?? { drawings: [], boms: [], routings: [] }}
            permissions={permissions} online={online} busy={customerPartCommand.isPending}
            loading={customerParts.isLoading || customers.isLoading || masterDataOptions.isLoading || engineeringRevisions.isLoading}
            error={customerParts.isError || customers.isError || masterDataOptions.isError || engineeringRevisions.isError}
            onCommand={(command) => customerPartCommand.mutateAsync(command)} />}
          {masterDataSection === 'item-controls' && permissions.includes('item_controls.read') && <ItemControlsPanel key={activeCompanyId} items={options.items}
            specifications={itemControls.data?.specifications ?? []} conversions={itemControls.data?.conversions ?? []} permissions={permissions} online={online}
            busy={itemControlCommand.isPending} loading={itemControls.isLoading || masterDataOptions.isLoading} error={itemControls.isError || masterDataOptions.isError}
            onCommand={(command) => itemControlCommand.mutateAsync(command)} />}
          </>
        }
        administrationPanel={<WorkspaceBoundary label="Administration" onReload={() => window.location.reload()}><AdministrationWorkspace key={activeCompanyId} companyId={activeCompanyId} actorId={actorId!} permissions={permissions} online={online} /></WorkspaceBoundary>}
        dataTransferPanel={<WorkspaceBoundary label="Data transfer" onReload={() => window.location.reload()}><DataTransferWorkspace key={activeCompanyId} companyId={activeCompanyId} actorId={actorId!} permissions={permissions} online={online} /></WorkspaceBoundary>}
        equipmentPanel={<WorkspaceBoundary label="Equipment" onReload={() => window.location.reload()}><EquipmentWorkspace key={activeCompanyId} companyId={activeCompanyId} actorId={actorId!} permissions={permissions} online={online} /></WorkspaceBoundary>}
        stockPanel={
          <>
            <StockExplorerPanel
              positions={stockExplorer.data ?? []}
              lots={stockLots.data ?? []}
              options={options}
              selectedLotId={selectedLotId}
              movements={stockMovements.data?.rows ?? []}
              loading={stockExplorer.isLoading}
              error={stockExplorer.isError}
              movementLoading={stockMovements.isFetching}
              movementError={stockMovements.isError}
              onSelect={(id) => { setSelectedLotId(id);setStockBeforeId(null);setStockPrevious([]) }}
              canOlder={stockMovements.data?.hasMore ?? false}
              canNewer={stockPrevious.length>0}
              onOlder={() => { const last=stockMovements.data?.rows.at(-1)?.id;if (last) { setStockPrevious([...stockPrevious,stockBeforeId]);setStockBeforeId(last) } }}
              onNewer={() => { setStockBeforeId(stockPrevious.at(-1)??null);setStockPrevious(stockPrevious.slice(0,-1)) }}
              onPrintLot={() => window.print()}
            />
            <StockActionsPanel
              permissions={permissions}
              positions={stockExplorer.data ?? []}
              companyId={activeCompanyId}
              online={online}
              options={options}
              lots={stockLots.data ?? []}
              records={
                commercialRecords.data ?? {
                  rfqs: [],
                  quotations: [],
                  salesOrders: [],
                  salesOrderLines: [],
                }
              }
              reservations={stockReservations.data ?? []}
              unreserving={stockCommands.unreserve.isPending}
              onUnreserve={(input) => stockCommands.unreserve.mutateAsync(input)}
              receiving={stockCommands.receipt.isPending}
              releasing={stockCommands.release.isPending}
              reserving={stockCommands.reserve.isPending}
              onReceive={async (input) => {
                await stockCommands.receipt.mutateAsync(input)
              }}
              onRelease={async (input) => {
                await stockCommands.release.mutateAsync(input)
              }}
              onReserve={async (input) => {
                await stockCommands.reserve.mutateAsync(input)
              }}
            />
            <StockReviewPanel
              companyId={activeCompanyId}
              lots={stockLots.data ?? []}
              positions={stockExplorer.data ?? []}
              items={options.items}
              counts={materialRecords.counts}
              permissions={permissions}
              userId={actorId!}
              busy={materialCommand.isPending}
              onCommand={(command) => materialCommand.mutateAsync(command)}
            />
            <LotTransformPanel key={activeCompanyId} companyId={activeCompanyId} lots={stockLots.data ?? []} positions={stockExplorer.data ?? []}
              options={options} permissions={permissions} online={online} busy={lotTransformation.isPending}
              loading={stockLots.isLoading || stockExplorer.isLoading || masterDataOptions.isLoading}
              error={stockLots.isError || stockExplorer.isError || masterDataOptions.isError}
              onTransform={(input) => lotTransformation.mutateAsync(input)} />
          </>
        }
        procurementPanel={
          <>
            <nav className="filter-bar" aria-label="Purchasing workspaces">
              <button className="secondary-button" type="button" aria-pressed={purchasingSection === 'purchase'} onClick={() => setPurchasingSection('purchase')}>Material purchasing</button>
              {permissions.includes('jobwork.read') && <button className="secondary-button" type="button" aria-pressed={purchasingSection === 'vendor'} onClick={() => setPurchasingSection('vendor')}>Vendor job-work</button>}
            </nav>
            {purchasingSection === 'vendor' ? <VendorJobworkPanel key={activeCompanyId}
              companyId={activeCompanyId} data={vendorJobwork.data} options={options} suppliers={materialRecords.suppliers}
              lots={stockLots.data ?? []} positions={stockExplorer.data ?? []} permissions={permissions} online={online}
              busy={vendorCommand.isPending}
              loading={vendorJobwork.isLoading || procurement.isLoading || stockLots.isLoading || stockExplorer.isLoading || masterDataOptions.isLoading}
              error={vendorJobwork.isError || procurement.isError || stockLots.isError || stockExplorer.isError || masterDataOptions.isError}
              onCommand={(command) => vendorCommand.mutateAsync(command)} /> : <>
            <ProcurementPanel
              conversions={itemControls.data?.conversions}
              companyId={activeCompanyId}
              options={options}
              records={materialRecords}
              commercial={
                commercialRecords.data ?? {
                  rfqs: [],
                  quotations: [],
                  salesOrders: [],
                  salesOrderLines: [],
                }
              }
              lots={stockLots.data ?? []}
              positions={stockExplorer.data ?? []}
              permissions={permissions}
              busy={materialCommand.isPending}
              loading={procurement.isLoading}
              refreshing={procurement.isFetching && !procurement.isLoading}
              error={procurement.isError}
              onCommand={(command) => materialCommand.mutateAsync(command)}
            />
            <MaterialDetailsPanel
              companyId={activeCompanyId}
              options={options}
              suppliers={materialRecords.suppliers}
              canManage={permissions.includes('master_data.manage')}
              busy={createMasterData.isPending}
              onCreate={async (command) => {
                await createMasterData.mutateAsync(command)
              }}
            />
            </>}
          </>
        }
        productionPanel={
          <WorkspaceBoundary label="Production" onReload={() => window.location.reload()}>
          <ProductionPanel key={activeCompanyId} companyId={activeCompanyId}
            specifications={itemControls.data?.specifications}
            data={production.data} options={options} lots={stockLots.data ?? []}
            positions={stockExplorer.data ?? []} permissions={permissions} online={online}
            busy={productionCommand.isPending} loading={production.isLoading || masterDataOptions.isLoading || stockLots.isLoading || stockExplorer.isLoading}
            error={production.isError || masterDataOptions.isError || stockLots.isError || stockExplorer.isError}
            drawingData={drawingWorkspace.data}
            onDownloadDrawing={permissions.includes('drawings.read') ? (id) => drawingCommands.download.mutateAsync(id) : undefined}
            drawingPanel={permissions.includes('drawings.read') && <DrawingFilesPanel key={activeCompanyId}
              data={drawingWorkspace.data} options={options} userId={actorId!} permissions={permissions} online={online}
              busy={drawingCommands.command.isPending || drawingCommands.upload.isPending || drawingCommands.download.isPending || createMasterData.isPending}
              loading={drawingWorkspace.isLoading} error={drawingWorkspace.isError}
              onCreateDrawing={(input) => createMasterData.mutateAsync({ kind: 'drawing', companyId: activeCompanyId!, ...input })}
              onCommand={(input) => drawingCommands.command.mutateAsync(input)} onUpload={(input) => drawingCommands.upload.mutateAsync(input)}
              onDownload={(id) => drawingCommands.download.mutateAsync(id)} />}
            onCommand={(command) => productionCommand.mutateAsync(command)} />
          </WorkspaceBoundary>
        }
        qualityPanel={
          <WorkspaceBoundary label="Quality" onReload={() => window.location.reload()}>
          <QualityPanel key={activeCompanyId} companyId={activeCompanyId}
            data={quality.data} production={production.data} options={options}
            documents={lotDocuments.data ?? []} userId={actorId!} documentLoading={lotDocuments.isLoading && permissions.includes('documents.read')}
            documentError={lotDocuments.isError} documentBusy={documentCommands.upload.isPending || documentCommands.download.isPending}
            onUpload={(input) => documentCommands.upload.mutateAsync(input)} onDownload={(id) => documentCommands.download.mutateAsync(id)}
            lots={stockLots.data ?? []} positions={stockExplorer.data ?? []}
            permissions={permissions} online={online} busy={qualityCommand.isPending}
            loading={quality.isLoading || production.isLoading || masterDataOptions.isLoading || stockLots.isLoading || stockExplorer.isLoading}
            error={quality.isError || production.isError || masterDataOptions.isError || stockLots.isError || stockExplorer.isError}
            onCommand={(command) => qualityCommand.mutateAsync(command)} />
          </WorkspaceBoundary>
        }
        dispatchPanel={
          <>
          <nav className="filter-bar" aria-label="Dispatch workspaces">
            <button className="secondary-button" type="button" aria-pressed={dispatchSection === 'dispatch'} onClick={() => setDispatchSection('dispatch')}>Packing and gate-out</button>
            {permissions.includes('customer_returns.read') && <button className="secondary-button" type="button" aria-pressed={dispatchSection === 'returns'} onClick={() => setDispatchSection('returns')}>Customer returns</button>}
          </nav>
          {dispatchSection === 'returns' && permissions.includes('customer_returns.read') ? <CustomerReturnsPanel key={activeCompanyId}
            companyId={activeCompanyId} data={customerReturns.data} options={options} permissions={permissions} online={online}
            busy={receiveCustomerReturn.isPending} loading={customerReturns.isLoading || masterDataOptions.isLoading}
            error={customerReturns.isError || masterDataOptions.isError} onReceive={(input) => receiveCustomerReturn.mutateAsync(input)} /> : <DispatchPanel
            permissions={permissions}
            companyId={activeCompanyId}
            lots={stockLots.data ?? []}
            items={options.items}
            commercial={
              dispatchRecords.data?.orderOptions ? { rfqs: [], quotations: [], ...dispatchRecords.data.orderOptions } : {
                rfqs: [],
                quotations: [],
                salesOrders: [],
                salesOrderLines: [],
              }
            }
            dispatchRecords={
              dispatchRecords.data ?? { reservations: [], shipments: [] }
            }
            busy={addShipmentPackage.isPending ||
              dispatchCommands.cancel.isPending ||
              dispatchCommands.prepare.isPending ||
              dispatchCommands.dispatch.isPending
            }
            online={online}
            onPrepare={(input) => dispatchCommands.prepare.mutateAsync(input)}
            onCancel={(input) => dispatchCommands.cancel.mutateAsync(input)}
            onDispatch={(input) => dispatchCommands.dispatch.mutateAsync(input)}
          />}
          {dispatchSection === 'dispatch' && permissions.includes('dispatch.read') && <ShipmentPackagesPanel key={activeCompanyId}
            specifications={itemControls.data?.specifications} conversions={itemControls.data?.conversions}
            companyId={activeCompanyId} data={shipmentPackages.data} permissions={permissions} online={online}
            busy={addShipmentPackage.isPending || dispatchCommands.dispatch.isPending || dispatchCommands.cancel.isPending || dispatchCommands.prepare.isPending}
            loading={shipmentPackages.isLoading} error={shipmentPackages.isError}
            onAdd={(input) => addShipmentPackage.mutateAsync(input)} onPrint={() => window.print()} />}
          </>
        }
        reportsPanel={<WorkspaceBoundary label="Reports" onReload={() => window.location.reload()}>
          <FactoryReportsWorkspace key={`${activeCompanyId}:${permissions.join(',')}`} companyId={activeCompanyId}
            permissions={permissions} online={online} onOpenRecord={(kind, id) => navigate(`/records/${kind}/${id}`)} />
        </WorkspaceBoundary>}
        commandCenterPanel={
          <OrderCommandCenterPanel
            rows={orderCommandCenter.data ?? []}
            loading={orderCommandCenter.isLoading}
            error={orderCommandCenter.isError}
          />
        }
      />
      <UpdatePrompt />
    </>
  )
}
