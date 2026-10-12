import { useRef,useState } from 'react'
import { parseImportCsv,type ImportKind } from './importCsv'
import { useAccountingExports,useDataImports,useTransferCommand,type ExportBatch } from './useDataTransfer'
import { DataTransferPanel,type ImportSource } from './DataTransferPanel'
import { writeCsv } from '@/lib/csv'
import { downloadText } from '@/lib/downloadText'
import { workspaceMode } from '@/local/mode'

export function DataTransferWorkspace({ companyId,actorId,permissions,online }: { companyId: string|null;actorId: string;permissions: string[];online: boolean }) {
  const imports=useDataImports(companyId,permissions.includes('imports.read')),exports=useAccountingExports(companyId,permissions.includes('exports.read')),command=useTransferCommand(companyId,actorId)
  const [kind,setKind]=useState<ImportKind>('items'),[source,setSource]=useState<ImportSource|null>(null),[fileError,setFileError]=useState<string|null>(null),[reading,setReading]=useState(false),generation=useRef(0)
  async function read(file: File) {
    const attempt=++generation.current;setSource(null);setFileError(null);setReading(true)
    try {
      if (file.size>1048576) throw new Error('CSV exceeds the 1 MiB limit.')
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Select a CSV file.')
      const bytes=await file.arrayBuffer(),text=new TextDecoder('utf-8',{ fatal: true }).decode(bytes),rows=parseImportCsv(text,kind)
      const hash=await crypto.subtle.digest('SHA-256',bytes),sha256=Array.from(new Uint8Array(hash),(byte) => byte.toString(16).padStart(2,'0')).join('')
      if (generation.current===attempt) setSource({ name: file.name,sha256,rows })
    } catch (cause) { if (generation.current===attempt) setFileError(cause instanceof Error ? cause.message : 'CSV could not be read.') }
    finally { if (generation.current===attempt) setReading(false) }
  }
  function download(batch: ExportBatch) {
    if (batch.status!=='approved') return
    const headers=['format_version','export_batch_id','event_type','record_id','reference','occurred_at','party_code','sku','quantity','uom','currency','unit_price','amount']
    downloadText(`accounting-handoff-${batch.id}.csv`,writeCsv(headers,batch.rows.map((row) => ({ ...row,format_version: batch.format_version,export_batch_id: batch.id }))))
  }
  return <DataTransferPanel authority={workspaceMode() === 'solo' ? 'device' : 'server'} imports={imports.data??[]} exports={exports.data??[]} kind={kind} source={source} fileError={fileError} reading={reading}
    permissions={permissions} online={online} busy={command.isPending} loading={imports.isLoading || exports.isLoading} error={imports.isError || exports.isError}
    onKind={(next) => { generation.current++;setKind(next);setSource(null);setFileError(null);setReading(false) }} onFile={(file) => { void read(file) }} onCommand={(input) => command.mutateAsync(input)} onDownload={download} />
}
