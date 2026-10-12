import { useState } from 'react'
import { ActionForm } from '@/components/ActionForm'
import { CommandFeedback } from '@/components/CommandFeedback'
import { formatCommandError } from '@/lib/commandError'
import { plantDate } from '@/lib/decimal'
import { importHeaders,importKinds,type ImportKind } from './importCsv'
import type { ExportBatch,ImportBatch,TransferCommand } from './useDataTransfer'

export type ImportSource={ name: string;sha256: string;rows: Record<string,string>[] }
export function DataTransferPanel({ imports,exports,kind,source,fileError,reading,permissions,online,busy,loading,error,onKind,onFile,onCommand,onDownload,authority='server' }: {
  imports: ImportBatch[];exports: ExportBatch[];kind: ImportKind;source: ImportSource|null;fileError: string|null;reading: boolean;
  permissions: string[];online: boolean;busy: boolean;loading: boolean;error: boolean;
  onKind: (kind: ImportKind) => void;onFile: (file: File) => void;onCommand: (input: TransferCommand) => Promise<string>;onDownload: (batch: ExportBatch) => void;
  authority?: 'device' | 'server';
}) {
  const [section,setSection]=useState(permissions.includes('imports.read') ? 'imports' : 'exports'),[batchId,setBatchId]=useState(''),[exportId,setExportId]=useState(''),[message,setMessage]=useState<string|null>(null)
  const batch=imports.find((row) => row.id===batchId), snapshot=exports.find((row) => row.id===exportId)
  const disabled=!online || busy || loading || error || reading
  async function submit(input: TransferCommand) {
    try { const id=await onCommand(input);if (input.action==='preview') setBatchId(id);if (input.action==='prepare_export') setExportId(id);setMessage('Data transfer confirmed.') }
    catch (cause) { setMessage(formatCommandError(cause,'the data transfer could not be confirmed. Keep the preview and retry.')) }
  }
  return <section className="record-panel" aria-labelledby="data-transfer-title"><h3 className="font-bold" id="data-transfer-title">Data transfer</h3>
    <nav className="filter-bar" aria-label="Data transfer steps">{permissions.includes('imports.read') && <button type="button" className="secondary-button" aria-pressed={section==='imports'} onClick={() => setSection('imports')}>Controlled imports</button>}
      {permissions.includes('exports.read') && <button type="button" className="secondary-button" aria-pressed={section==='exports'} onClick={() => setSection('exports')}>Accounting handoff</button>}</nav>
    <CommandFeedback message={message} />{loading && <p role="status">Loading transfer history…</p>}{error && <p role="alert" className="feedback feedback-blocked">Blocked because transfer history could not be loaded.</p>}
    {section==='imports' && permissions.includes('imports.read') && <>
      <p className="empty-state">Import up to 500 data rows from a UTF-8 CSV (1 MiB maximum). Preview and review first. Existing records are never overwritten. Opening stock creates new held lots and needs QC release before use.</p>
      {permissions.includes('imports.manage') && <ActionForm title={`Preview import on ${authority}`} disabled={disabled || !source} onSubmit={() => { if (source) void submit({ action: 'preview',data: { kind,source_name: source.name,source_sha256: source.sha256,rows: source.rows } }) }}>
        <label className="form-label">Import record type<select aria-label="Import record type" className="form-input" value={kind} disabled={busy || reading} onChange={(event) => onKind(event.target.value as ImportKind)}>{importKinds.map((value) => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>
        <p className="break-all">Required headers: <code>{importHeaders[kind].join(',')}</code></p>
        <label className="form-label">Import CSV file<input key={kind} className="form-input" type="file" accept=".csv,text/csv" disabled={busy || reading} onChange={(event) => { const file=event.target.files?.[0];if (file) onFile(file) }} /></label>
        {fileError && <p role="alert" className="feedback feedback-blocked">Blocked because {fileError}</p>}
        {source && <><p>{source.name} · {source.rows.length} validated data rows. The {authority} also checks existing codes and company references.</p><pre className="whitespace-pre-wrap break-all">{source.rows.slice(0,3).map((row) => JSON.stringify(row)).join('\n')}</pre></>}
      </ActionForm>}
      <label className="form-label">Import batch<select aria-label="Import batch" className="form-input" value={batchId} disabled={busy} onChange={(event) => setBatchId(event.target.value)}><option value="">Select preview or posted batch</option>{imports.map((row) => <option key={row.id} value={row.id}>{row.source_name} · {row.kind} · {row.status} · {row.created_at}</option>)}</select></label>
      {batch && <article className="record-card" aria-label="Import reconciliation"><strong>{batch.source_name} · {batch.status}</strong><p>{batch.rows.length} input rows · {batch.errors.length} validation errors · {batch.records.length} confirmed records</p>
        {batch.errors.length>0 && <ul>{batch.errors.map((error) => <li key={error.row}>Data row {error.row}: {error.message}</li>)}</ul>}
        {batch.status==='applied' && <><p>Approval: {batch.approval_reason}</p><details><summary>Confirmed record references</summary><ul>{batch.records.map((row) => <li className="break-all" key={row.row_number}>Data row {row.row_number} · {row.entity_type} · {row.entity_id}</li>)}</ul></details></>}
        {batch.status==='preview' && permissions.includes('imports.approve') && <ActionForm title="Apply reviewed import" disabled={disabled || batch.errors.length>0} lockInputs onSubmit={(form) => { void submit({ action: 'apply',id: batch.id,reason: String(new FormData(form).get('reason')??'') }) }}>
          <label className="checkbox-label"><input type="checkbox" required /> I reconciled these rows against the source and opening counts</label>
          <label className="form-label">Import approval reason<input className="form-input" name="reason" required maxLength={2000} /></label>
        </ActionForm>}
      </article>}
    </>}
    {section==='exports' && permissions.includes('exports.read') && <>
      <p className="empty-state">Reviewable operational handoff for accounting: confirmed receipts, dispatch and their returns. Amounts use the recorded order prices, without inferred tax, freight or accounting mappings. This CSV is not an invoice or tax filing. Repeated exports retain stable event IDs for reconciliation.</p>
      {permissions.includes('exports.manage') && <ActionForm title="Prepare accounting handoff" disabled={disabled} lockInputs onSubmit={(form) => { const data=new FormData(form);void submit({ action: 'prepare_export',from: String(data.get('from')),to: String(data.get('to')) }) }}>
        <label className="form-label">Handoff from date<input className="form-input" type="date" name="from" required defaultValue={plantDate()} /></label>
        <label className="form-label">Handoff to date<input className="form-input" type="date" name="to" required defaultValue={plantDate()} /></label>
      </ActionForm>}
      <label className="form-label">Accounting handoff snapshot<select aria-label="Accounting handoff snapshot" className="form-input" value={exportId} disabled={busy} onChange={(event) => setExportId(event.target.value)}><option value="">Select snapshot</option>{exports.map((row) => <option key={row.id} value={row.id}>{row.from_date} to {row.to_date} · {row.status} · {row.created_at}</option>)}</select></label>
      {snapshot && <article className="record-card" aria-label="Accounting reconciliation"><strong>{snapshot.status} · Format v{snapshot.format_version}</strong><p>{snapshot.rows.length} source events · {snapshot.from_date} to {snapshot.to_date} (plant dates)</p>
        <ul>{snapshot.totals.map((total) => <li key={`${total.event_type}-${total.currency}`}>{total.event_type.replaceAll('_',' ')} · {total.record_count} records · {total.amount} {total.currency}</li>)}</ul>
        <details><summary>Review source events</summary><ul>{snapshot.rows.map((row) => <li className="break-all" key={`${row.event_type}-${row.record_id}`}>{row.reference} · {row.party_code} · {row.sku} · {row.quantity} {row.uom} · {row.amount} {row.currency}</li>)}</ul></details>
        {snapshot.status==='draft' && permissions.includes('exports.approve') && <ActionForm title="Approve accounting handoff" disabled={disabled} lockInputs onSubmit={(form) => { void submit({ action: 'approve_export',id: snapshot.id,reason: String(new FormData(form).get('reason')??'') }) }}>
          <label className="checkbox-label"><input type="checkbox" required /> I checked source events, signed returns and currency totals</label><label className="form-label">Handoff approval reason<input className="form-input" name="reason" required maxLength={2000} /></label>
        </ActionForm>}
        <button className="secondary-button" type="button" disabled={snapshot.status!=='approved' || loading || error || busy} onClick={() => onDownload(snapshot)}>Download approved handoff CSV</button>
      </article>}
    </>}
  </section>
}
