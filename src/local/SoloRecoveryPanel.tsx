import type { SoloBackup, SoloPreview } from './recovery-service'

type Props = {
  secret: string; onSecret: (value: string) => void; busy: boolean; message: string | null;
  restored: string | null; backups: SoloBackup[]; companies: { id: string; name: string }[];
  preview: SoloPreview | null; target: string; reason: string; pending: boolean;
  onTarget: (value: string) => void; onReason: (value: string) => void;
  onExport: () => void; onRestore: (file: File) => void; onActivate: () => void;
  onCloudList: () => void; onCloudUpload: () => void; onCloudDownload: (backup: SoloBackup) => void;
  onPreview: () => void; onMove: () => void; onCancel: () => void;
  retainedFiles: string[]; onRetainedFile: (id: string) => void;
}
export function SoloRecoveryPanel(p: Props) {
  return <section className="record-panel" aria-label="Solo backup and move">
    <h3 className="font-bold">Solo backup and move</h3>
    <p className="empty-state">Records and files are saved on this device. Download encrypted backups and keep the passphrase separately. Cloud backup is optional.</p>
    <label className="form-label">Backup passphrase<input className="form-input" aria-label="Backup passphrase" type="password" autoComplete="new-password" minLength={12} value={p.secret} onChange={(event) => p.onSecret(event.target.value)} disabled={p.busy} /></label>
    <div className="mt-4 flex flex-wrap gap-3">
      <button className="primary-button" type="button" disabled={p.busy || p.secret.length < 12} onClick={p.onExport}>Download encrypted solo backup</button>
      <label className="form-label">Verify a backup<input type="file" aria-label="Verify a solo backup" accept=".fferp" disabled={p.busy || p.secret.length < 12} onChange={(event) => { const file = event.target.files?.[0]; if (file) p.onRestore(file); event.target.value = '' }} /></label>
    </div>
    {p.restored && <button className="secondary-button mt-3" type="button" disabled={p.busy} onClick={p.onActivate}>Activate verified restored workspace</button>}
    {p.retainedFiles.length > 0 && <label className="form-label mt-3">Open retained workspace<select className="form-input" aria-label="Open retained workspace" defaultValue="" disabled={p.busy || p.pending} onChange={(event) => { if (event.target.value) p.onRetainedFile(event.target.value) }}><option value="">Current workspace remains open</option>{p.retainedFiles.map((file) => <option key={file} value={file}>{file === 'original' ? 'Original device workspace' : `Restored workspace ${file.slice(0, 8)}`}</option>)}</select></label>}
    <details className="mt-4"><summary className="nav-item">Optional account cloud backup</summary>
      <p className="empty-state">Use your existing team sign-in. This stores only encrypted backup files under your account.</p>
      <div className="flex flex-wrap gap-3"><button className="secondary-button" type="button" disabled={p.busy} onClick={p.onCloudList}>Load account backups and team companies</button><button className="secondary-button" type="button" disabled={p.busy || p.secret.length < 12} onClick={p.onCloudUpload}>Upload encrypted backup to my account</button></div>
      <ul className="mt-3 grid gap-2">{p.backups.map((backup) => <li key={backup.id}><button className="secondary-button" type="button" disabled={p.busy} onClick={() => p.onCloudDownload(backup)}>Download backup {backup.created_at.slice(0, 10)} · {backup.workspace_id.slice(0, 8)}</button></li>)}</ul>
    </details>
    <details className="mt-4"><summary className="nav-item">Move masters and opening balances to team</summary>
      <p className="empty-state">Choose an empty team company. Finish open operations first. Engineering definitions need team review; opening stock starts on QC hold. Solo history and drawing files remain readable in the archive.</p>
      <button className="secondary-button" type="button" disabled={p.busy} onClick={p.onPreview}>Review move readiness</button>
      {p.preview && <><ul className="mt-3">{p.preview.blockers.map((reason) => <li key={reason}>Blocked because {reason}</li>)}</ul><p className="mt-3">{Object.values(p.preview.masters).reduce((count, rows) => count + rows.length, 0)} master records; {p.preview.openings.length} opening lots.</p></>}
      <label className="form-label mt-3">Target team company<select className="form-input" aria-label="Target team company" value={p.target} onChange={(event) => p.onTarget(event.target.value)} disabled={p.busy || p.pending}><option value="">Load and select an empty company</option>{p.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <label className="form-label">Move reason<input className="form-input" aria-label="Move reason" value={p.reason} onChange={(event) => p.onReason(event.target.value)} disabled={p.busy || p.pending} /></label>
      <button className="primary-button mt-3" type="button" disabled={p.busy || !p.target || !p.reason.trim() || p.secret.length < 12 || !p.preview || p.preview.blockers.length > 0} onClick={p.onMove}>{p.pending ? 'Retry pending move' : 'Back up and move to team'}</button>
      {p.pending && <button className="secondary-button mt-3" type="button" disabled={p.busy} onClick={p.onCancel}>Cancel pending move safely</button>}
    </details>
    {p.message && <p className="feedback mt-4" role="status">{p.message}</p>}
  </section>
}
