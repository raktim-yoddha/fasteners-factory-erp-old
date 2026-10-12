import manifest from './schema-manifest.json'
import { decimal } from './exact'

export type Value = string | number | null | Uint8Array
export type Row = Record<string, unknown>
export interface Database {
  exec(sql: string, values?: Value[]): void
  all(sql: string, values?: Value[]): Row[]
  register(name: string, handler: (value: unknown) => number): void
}
export const tableNames = new Set(manifest.tables.map((table) => table.name))
export function identifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('INVALID_IDENTIFIER')
  return `"${name}"`
}
export function initializeDatabase(db: Database) {
  db.register('decimal_valid', (value) => { try { decimal(value); return 1 } catch { return 0 } })
  db.exec('PRAGMA foreign_keys=ON')
  db.exec('PRAGMA busy_timeout=5000')
  const version = db.all('PRAGMA user_version')[0]?.user_version
  if (version !== 0 && version !== 1) throw new Error('LOCAL_DATABASE_VERSION_UNSUPPORTED')
  if (version === 1) return
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec('CREATE TABLE local_identity (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, state TEXT NOT NULL CHECK(state IN (\'active\',\'archived\')), created_at TEXT NOT NULL) STRICT')
    db.exec('CREATE TABLE local_files (path TEXT PRIMARY KEY, bytes BLOB NOT NULL, sha256 TEXT NOT NULL) STRICT')
    db.exec('CREATE TABLE local_command_results (key TEXT PRIMARY KEY, command TEXT NOT NULL, request TEXT NOT NULL, result TEXT NOT NULL) STRICT')
    db.exec('CREATE TABLE local_cutover_intent (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, cloud_owner_id TEXT NOT NULL, reason TEXT NOT NULL, snapshot_sha256 TEXT, backup_id TEXT, receipt TEXT) STRICT')
    // Schema-only manifest: normalized factory tables, no copied factory records or cloud credentials.
    for (const table of manifest.tables) {
      const columns = table.columns.map((column) => {
        const type = ['int4', 'int8', 'bool'].includes(column.udt) ? 'INTEGER' : 'TEXT'
        const checks: string[] = []
        if (column.udt === 'bool') checks.push(`${identifier(column.name)} IN (0,1)`)
        if (column.udt === 'numeric') checks.push(`typeof(${identifier(column.name)})='text' AND decimal_valid(${identifier(column.name)})=1`)
        const enumeration = (manifest.enums as Record<string, string[]>)[column.udt]
        if (enumeration) checks.push(`${identifier(column.name)} IN (${enumeration.map((entry) => `'${entry.replaceAll("'", "''")}'`).join(',')})`)
        return `${identifier(column.name)} ${type}${column.nullable ? '' : ' NOT NULL'}${checks.length ? ` CHECK(${column.nullable ? `${identifier(column.name)} IS NULL OR ` : ''}(${checks.join(' AND ')}))` : ''}`
      })
      for (const constraint of table.constraints) {
        const keys = constraint.columns.map(identifier).join(',')
        if (constraint.kind === 'p') columns.push(`PRIMARY KEY (${keys})`)
        if (constraint.kind === 'u') columns.push(`UNIQUE (${keys})`)
        if (constraint.kind === 'f' && constraint.foreignTable && constraint.foreignColumns) {
          const target = constraint.foreignSchema === 'auth' ? 'local_identity' : constraint.foreignTable
          columns.push(`FOREIGN KEY (${keys}) REFERENCES ${identifier(target)} (${constraint.foreignColumns.map(identifier).join(',')}) DEFERRABLE INITIALLY DEFERRED`)
        }
      }
      db.exec(`CREATE TABLE ${identifier(table.name)} (${columns.join(',')}) STRICT`)
    }
    for (const table of ['audit_log', 'stock_ledger_entries', 'material_events', 'lot_genealogy', 'vendor_custody_events', 'inspections', 'equipment_events', 'capacity_releases', 'job_equipment_releases']) {
      for (const action of ['UPDATE', 'DELETE']) db.exec(`CREATE TRIGGER ${table}_${action.toLowerCase()}_immutable BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'APPEND_ONLY_RECORD'); END`)
    }
    for (const table of ['bom_revisions', 'routing_revisions', 'inspection_plans', 'drawing_revisions']) {
      for (const action of ['UPDATE', 'DELETE']) db.exec(`CREATE TRIGGER ${table}_${action.toLowerCase()}_approved BEFORE ${action} ON ${table} WHEN OLD.status='approved' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_APPROVED_VERSION'); END`)
    }
    for (const table of ['bom_lines', 'routing_operations']) {
      const parent = table === 'bom_lines' ? 'bom_revisions' : 'routing_revisions', key = table === 'bom_lines' ? 'bom_revision_id' : 'routing_revision_id'
      for (const action of ['INSERT', 'UPDATE', 'DELETE']) db.exec(`CREATE TRIGGER ${table}_${action.toLowerCase()}_approved BEFORE ${action} ON ${table} WHEN (SELECT status FROM ${parent} WHERE id=${action === 'INSERT' ? 'NEW' : 'OLD'}.${key})='approved' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_APPROVED_VERSION'); END`)
    }
    for (const table of ['item_specification_versions', 'item_unit_conversions']) {
      const definition = manifest.tables.find((entry) => entry.name === table)!
      const mutable = ['status', 'retired_by', 'retired_at', 'retirement_reason']
      const same = definition.columns.filter((column) => !mutable.includes(column.name)).map((column) => `NEW.${column.name} IS OLD.${column.name}`).join(' AND ')
      db.exec(`CREATE TRIGGER ${table}_immutable BEFORE UPDATE ON ${table} WHEN OLD.status<>'draft' AND NOT (OLD.status='approved' AND NEW.status='retired' AND ${same}) BEGIN SELECT RAISE(ABORT,'IMMUTABLE_APPROVED_VERSION'); END`)
      db.exec(`CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'APPEND_ONLY_RECORD'); END`)
    }
    db.exec('PRAGMA user_version=1')
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}
export function hydrate(table: string, row: Row): Row {
  const definition = manifest.tables.find((entry) => entry.name === table)
  const result = { ...row }
  for (const column of definition?.columns ?? []) {
    const value = result[column.name]
    if (value === null || value === undefined) continue
    if (column.udt === 'jsonb') result[column.name] = JSON.parse(String(value))
    if (column.udt === 'bool') result[column.name] = Boolean(value)
    if (column.udt === 'numeric') { decimal(value); result[column.name] = String(value) }
  }
  return result
}
export class Store {
  constructor(readonly db: Database, readonly actorId: string) {}
  rows(table: string, where: Row = {}): Row[] {
    if (!tableNames.has(table)) throw new Error('UNKNOWN_LOCAL_TABLE')
    const entries = Object.entries(where)
    return this.db.all(`SELECT * FROM ${identifier(table)}${entries.length ? ` WHERE ${entries.map(([key, value]) => `${identifier(key)} ${value === null ? 'IS NULL' : '= ?'}`).join(' AND ')}` : ''}`, entries.filter(([, value]) => value !== null).map(([, value]) => this.value(value))).map((row) => hydrate(table, row))
  }
  one(table: string, id: unknown, companyId?: unknown): Row {
    const row = this.rows(table, { id, ...(companyId ? { company_id: companyId } : {}) })[0]
    if (!row) throw new Error('RECORD_NOT_FOUND')
    return row
  }
  insert(table: string, input: Row): Row {
    const definition = manifest.tables.find((entry) => entry.name === table)
    if (!definition) throw new Error('UNKNOWN_LOCAL_TABLE')
    const row: Row = {}
    for (const column of definition.columns) {
      let value = input[column.name]
      if (value === undefined) {
        if (column.identity) value = Number(this.db.all(`SELECT COALESCE(MAX(${identifier(column.name)}),0)+1 AS value FROM ${identifier(table)}`)[0]?.value)
        else if (column.default?.includes('gen_random_uuid')) value = crypto.randomUUID()
        else if (column.default?.includes('now()')) value = new Date().toISOString()
        else if (column.default === 'true' || column.default === 'false') value = column.default === 'true'
        else if (column.default && /^-?\d/.test(column.default)) value = column.udt === 'numeric' ? column.default.split('::')[0] : Number(column.default)
        else if (column.default?.startsWith("'")) value = column.default.slice(1, column.default.lastIndexOf("'"))
        else if (column.name === 'created_by') value = this.actorId
        else if (column.nullable) value = null
      }
      if (column.udt === 'numeric' && value !== null && value !== undefined) { decimal(value); value = String(value) }
      row[column.name] = value
    }
    const columns = Object.keys(row)
    this.db.exec(`INSERT INTO ${identifier(table)} (${columns.map(identifier).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, columns.map((key) => this.value(row[key])))
    return hydrate(table, Object.fromEntries(columns.map((key) => [key, this.value(row[key])])))
  }
  update(table: string, id: unknown, values: Row) {
    const entries = Object.entries(values)
    this.db.exec(`UPDATE ${identifier(table)} SET ${entries.map(([key]) => `${identifier(key)}=?`).join(',')} WHERE id=?`, [...entries.map(([, value]) => this.value(value)), this.value(id)])
  }
  value(value: unknown): Value {
    if (value === undefined) throw new Error('MISSING_REQUIRED_FIELD')
    if (value === null || typeof value === 'string' || typeof value === 'number' || value instanceof Uint8Array) return value
    if (typeof value === 'boolean') return value ? 1 : 0
    return JSON.stringify(value)
  }
}
