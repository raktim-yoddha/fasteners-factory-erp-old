import { useState } from 'react'
import { CommandFeedback } from '@/components/CommandFeedback'
import { formatCommandError } from '@/lib/commandError'
import { EquipmentPanel } from './EquipmentPanel'
import { CapacityPanel } from './CapacityPanel'
import { emptyEquipment, useEquipment, useEquipmentCommand, type EquipmentCommand } from './useEquipment'

export function EquipmentWorkspace({ companyId, actorId, permissions, online }: { companyId: string|null; actorId: string; permissions: string[]; online: boolean }) {
  const allowed=permissions.includes('equipment.read'), workspace=useEquipment(companyId,allowed), command=useEquipmentCommand(companyId,actorId)
  const [section,setSection]=useState<'readiness'|'capacity'>('readiness'), [message,setMessage]=useState<string|null>(null)
  async function execute(input: EquipmentCommand) {
    try { const receipt=await command.mutateAsync(input);setMessage('Equipment command confirmed.');return receipt }
    catch (error) { setMessage(formatCommandError(error,'the equipment command could not be confirmed. Keep the details and retry.'));throw error }
  }
  if (!allowed) return <p className="empty-state">Blocked because this account has no equipment read permission.</p>
  const props={ data: workspace.data??emptyEquipment, permissions, disabled: !online || !companyId || command.isPending || workspace.isLoading || workspace.isError, onCommand: execute }
  return <>
    <div className="filter-bar" aria-label="Equipment sections">{(['readiness','capacity'] as const).map((value) => <button key={value} className="secondary-button" type="button" aria-pressed={section===value} onClick={() => { setSection(value);setMessage(null) }}>{value==='readiness' ? 'Equipment readiness' : 'Shift capacity'}</button>)}</div>
    <CommandFeedback message={message} />
    {workspace.isLoading && <p role="status">Loading equipment…</p>}
    {workspace.isError && <p role="alert">Blocked because equipment records could not be loaded.</p>}
    {section==='readiness' ? <EquipmentPanel {...props} /> : <CapacityPanel {...props} />}
  </>
}
