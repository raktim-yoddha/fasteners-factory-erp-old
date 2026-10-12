import { useEffect, useState } from 'react'
import { SoloRecoveryPanel } from './SoloRecoveryPanel'
import { activateSoloFile, cancelSoloMove, deviceRequest, downloadCloudBackup, downloadSoloBackup, listCloudBackups, moveSoloToTeam, previewSchema, restoreSoloBackup, soloExport, uploadSoloBackup, retainedSoloFiles, openRetainedSoloFile, type SoloBackup, type SoloPreview } from './recovery-service'

export function SoloRecoveryWorkspace({ companyId }: { companyId: string | null }) {
  const [secret, setSecret] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null)
  const [restored, setRestored] = useState<string | null>(null), [backups, setBackups] = useState<SoloBackup[]>([]), [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [preview, setPreview] = useState<SoloPreview | null>(null), [target, setTarget] = useState(''), [reason, setReason] = useState(''), [pending, setPending] = useState(false)
  useEffect(() => {
    let active = true
    void deviceRequest({ operation: 'cutover_pending' }).then((value) => {
      if (!active || !value) return
      const intent = value as { company_id: string; reason: string }
      setPending(true); setTarget(intent.company_id); setReason(intent.reason); setMessage('Move awaits cloud confirmation. Solo records are preserved; writes remain paused until retry or confirmed cancellation.')
    }).catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'Recovery state could not be loaded.') })
    return () => { active = false }
  }, [])
  async function act(action: () => Promise<void>) {
    setBusy(true); setMessage(null)
    try { await action() } catch (error) { setMessage(`Blocked because ${error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? 'the operation failed')}`) }
    finally { setBusy(false); const value = await deviceRequest({ operation: 'cutover_pending' }).catch(() => null); setPending(Boolean(value)) }
  }
  return <SoloRecoveryPanel secret={secret} onSecret={setSecret} busy={busy} message={message} restored={restored} backups={backups} companies={companies} preview={preview} target={target} reason={reason} pending={pending} onTarget={setTarget} onReason={setReason}
    retainedFiles={retainedSoloFiles()} onRetainedFile={openRetainedSoloFile}
    onExport={() => void act(async () => { const sealed = await soloExport(secret); downloadSoloBackup(sealed.file); setMessage('Encrypted solo backup downloaded.') })}
    onRestore={(file) => void act(async () => { setRestored(null); const id = await restoreSoloBackup(file, secret); setRestored(id); setMessage('Backup verified in a separate SQLite file. Activate it when ready; the current workspace is retained.') })}
    onActivate={() => { if (restored) activateSoloFile(restored) }}
    onCloudList={() => void act(async () => { const result = await listCloudBackups(); setBackups(result.backups); setCompanies(result.companies); setMessage('Loaded this account’s backups and permitted team companies.') })}
    onCloudUpload={() => void act(async () => { const sealed = await soloExport(secret); downloadSoloBackup(sealed.file); const backup = await uploadSoloBackup(sealed); setBackups((rows) => [backup, ...rows.filter((row) => row.id !== backup.id)]); setMessage('Encrypted account backup confirmed. Team factory records are unchanged.') })}
    onCloudDownload={(backup) => void act(async () => { await downloadCloudBackup(backup); setMessage('Encrypted account backup downloaded.') })}
    onPreview={() => void act(async () => { if (!companyId) throw new Error('Set up a solo company first.'); setPreview(previewSchema.parse(await deviceRequest({ operation: 'cutover_preview', companyId }))); setMessage('Review blockers, masters and opening balances before moving.') })}
    onMove={() => void act(async () => { if (!companyId) throw new Error('Select a solo company.'); await moveSoloToTeam(companyId, target, secret, reason); window.location.reload() })}
    onCancel={() => void act(async () => { const status = await cancelSoloMove(); setMessage(status === 'committed' ? 'The cloud move already committed. Solo history is now read-only.' : 'Cloud cancellation confirmed. Solo remains authoritative.'); window.location.reload() })} />
}
