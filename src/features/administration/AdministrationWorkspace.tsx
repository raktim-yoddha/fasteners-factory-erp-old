import { useState } from 'react'
import { useAuditPage, useCompanyMembers, useMemberAccess, type AuditFilter } from './useAdministration'
import { MemberAccessPanel } from './MemberAccessPanel'
import { AuditPanel } from './AuditPanel'

export function AdministrationWorkspace({ companyId, actorId, permissions, online }: { companyId: string|null;actorId: string;permissions: string[];online: boolean }) {
  const canManage=permissions.includes('members.manage'),canAudit=permissions.includes('audit.read')
  const members=useCompanyMembers(companyId,canManage), command=useMemberAccess(companyId,actorId)
  const [filter,setFilter]=useState<AuditFilter>({ search: '',beforeId: null,fromDate: '',toDate: '' }),[previous,setPrevious]=useState<(string|null)[]>([])
  const audit=useAuditPage(companyId,canAudit,filter)
  return <>
    {canManage && <MemberAccessPanel members={members.data??[]} actorId={actorId} online={online} busy={command.isPending} loading={members.isLoading} error={members.isError} onSave={(input) => command.mutateAsync(input)} />}
    {canAudit && <AuditPanel data={audit.data} filter={filter} loading={audit.isFetching} error={audit.error?.message??null} canPrevious={previous.length>0}
      onFilter={(next) => { setPrevious(next.beforeId===null ? [] : [...previous,filter.beforeId]);setFilter(next) }}
      onPrevious={() => { setFilter({ ...filter,beforeId: previous.at(-1)??null });setPrevious(previous.slice(0,-1)) }} />}
    {!canManage && !canAudit && <p className="empty-state">Blocked because this account has no staff administration or audit permission.</p>}
  </>
}
