import { useState } from 'react'
import type { RecordKind } from '@/features/records/recordTypes'
import { FactoryReportsPanel } from './FactoryReportsPanel'
import { reportDefinitions, useFactoryReport } from './useFactoryReports'
import type { ReportFilters } from './useFactoryReports'

/** Connect authorized reads to the presentational report panel; no business writes. */
export function FactoryReportsWorkspace({ companyId, permissions, online, onOpenRecord }: {
  companyId: string | null; permissions: string[]; online: boolean;
  onOpenRecord: (kind: RecordKind, id: string) => void;
}) {
  const availableKinds = reportDefinitions.filter((row) => permissions.includes(row.permission)).map((row) => row.kind)
  const [filters, setFilters] = useState<ReportFilters>({ kind: availableKinds[0] ?? 'backlog', from: '', to: '', search: '', page: 0 })
  const allowed = availableKinds.includes(filters.kind)
  const report = useFactoryReport(companyId, filters, allowed)
  return <FactoryReportsPanel data={allowed ? report.data : undefined} filters={filters} availableKinds={availableKinds}
    online={online} loading={report.isFetching} error={report.isError} onFilter={setFilters}
    onPage={(page) => setFilters({ ...filters, page })} onRefresh={() => { void report.refetch() }} onOpenRecord={onOpenRecord} />
}
