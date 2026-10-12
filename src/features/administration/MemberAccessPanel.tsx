import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { CommandFeedback } from '@/components/CommandFeedback'
import { formatCommandError } from '@/lib/commandError'
import { roles, type CompanyMember, type MemberAccess } from './useAdministration'

export function MemberAccessPanel({ members, actorId, online, busy, loading, error, onSave }: {
  members: CompanyMember[]; actorId: string; online: boolean; busy: boolean; loading: boolean; error: boolean; onSave: (input: MemberAccess) => Promise<string>;
}) {
  const [targetId,setTargetId]=useState(''),[isNew,setIsNew]=useState(false),[message,setMessage]=useState<string|null>(null)
  const target=members.find((row) => row.user_id===targetId)
  async function save(form: HTMLFormElement) {
    const fields=new FormData(form)
    try {
      await onSave({ user_id: isNew ? String(fields.get('account')??'').trim() : targetId,roles: fields.getAll('roles') as MemberAccess['roles'],active: fields.get('active')==='on',expected_revision: isNew ? 0 : target?.revision ?? 0,reason: String(fields.get('reason')??'') })
      setMessage('Company access confirmed.')
    } catch (cause) { setMessage(formatCommandError(cause,'company access could not be confirmed. Keep the details and retry.')) }
  }
  return <section className="record-panel" aria-labelledby="member-access-title">
    <h3 id="member-access-title" className="font-bold">Staff access</h3>
    <p className="empty-state">Add an already approved account using its account ID, then assign only the roles needed. Account creation remains an administrator setup step. Deactivation removes company access immediately; history remains.</p>
    <p>Your account ID: <code className="break-all">{actorId}</code></p>
    <CommandFeedback message={message} />
    {loading && <p role="status">Loading staff access…</p>}
    {error && <p role="alert" className="feedback feedback-blocked">Blocked because staff access could not be loaded.</p>}
    <label className="checkbox-label"><input type="checkbox" checked={isNew} disabled={busy} onChange={(event) => { setIsNew(event.target.checked);setTargetId('');setMessage(null) }} /> Add approved account</label>
    {!isNew && <label className="form-label">Staff member<select aria-label="Staff member" className="form-input" value={targetId} disabled={busy} onChange={(event) => { setTargetId(event.target.value);setMessage(null) }}><option value="">Select member</option>
      {members.map((row) => <option key={row.user_id} value={row.user_id}>{row.display_name} · {row.active ? 'Active' : 'Inactive'} · {row.user_id}</option>)}</select></label>}
    {(isNew || target) && <ActionForm key={isNew ? 'new' : `${target?.user_id}-${target?.revision}`} title="Confirm staff access" lockInputs disabled={!online || busy || loading || error} onSubmit={(form) => { void save(form) }}>
      {isNew ? <label className="form-label">Approved account ID<input className="form-input" name="account" required /></label> : <p className="break-all">Account {targetId} · revision {target?.revision}</p>}
      <fieldset className="grid gap-2"><legend>Assigned roles</legend>{roles.map((role) => <label className="checkbox-label" key={role}><input type="checkbox" name="roles" value={role} defaultChecked={target?.roles.includes(role)} />{role.replaceAll('_',' ')}</label>)}</fieldset>
      <label className="checkbox-label"><input type="checkbox" name="active" defaultChecked={isNew || target?.active} /> Active company access</label>
      <label className="form-label">Access change reason<input className="form-input" name="reason" required maxLength={2000} /></label>
      <p className="empty-state">The server rejects stale changes and keeps at least one active administrator.</p>
    </ActionForm>}
  </section>
}
