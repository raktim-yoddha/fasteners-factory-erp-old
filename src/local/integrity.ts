import manifest from './schema-manifest.json'
import type { LocalEngine } from './engine'
import { CommandContext } from './context'
import { decimal } from './exact'

/** Restore validation is read-only. Never initialize or repair an imported database in place. */
export async function validateSnapshot(engine: LocalEngine, expectedWorkspace: string) {
  const db = engine.db
  if (db.all('PRAGMA user_version')[0]?.user_version !== 1 || db.all('PRAGMA integrity_check')[0]?.integrity_check !== 'ok' || db.all('PRAGMA foreign_key_check').length) throw new Error('SOLO_BACKUP_INTEGRITY_FAILURE')
  if (engine.identity.workspace_id !== expectedWorkspace || db.all('SELECT id FROM local_identity').length !== 1 || engine.store.rows('companies').length > 1) throw new Error('SOLO_BACKUP_IDENTITY_MISMATCH')
  for (const table of manifest.tables) {
    const columns = db.all(`PRAGMA table_info("${table.name}")`).map((row) => row.name)
    if (columns.length !== table.columns.length || table.columns.some((column) => !columns.includes(column.name))) throw new Error('SOLO_BACKUP_SCHEMA_MISMATCH')
  }
  for (const company of engine.store.rows('companies')) {
    const c = new CommandContext(engine.store, String(company.id), '')
    for (const lot of c.rows('stock_lots')) {
      const position = c.position(lot.id)
      if (decimal(position.on_hand) < 0n || decimal(position.reserved) < 0n || decimal(position.reserved) > decimal(position.on_hand)) throw new Error('SOLO_BACKUP_STOCK_INVALID')
    }
  }
  for (const document of [...engine.store.rows('lot_documents'), ...engine.store.rows('drawing_documents')]) {
    const file = db.all('SELECT * FROM local_files WHERE path=?', [String(document.object_path)])[0]
    if (!file && document.status === 'pending') continue
    if (!file || !(file.bytes instanceof Uint8Array) || file.bytes.length !== document.byte_size || file.sha256 !== document.sha256) throw new Error('SOLO_BACKUP_DOCUMENT_INVALID')
    const hash = await crypto.subtle.digest('SHA-256', file.bytes as Uint8Array<ArrayBuffer>)
    if ([...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('') !== document.sha256) throw new Error('SOLO_BACKUP_DOCUMENT_INVALID')
  }
}
