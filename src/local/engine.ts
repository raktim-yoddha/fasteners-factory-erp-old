import { z } from 'zod'
import { initializeDatabase, Store, type Database, type Row } from './database'
import { CommandContext, type CommandHandler } from './context'
import { commercialCommands } from './commercial'
import { stockCommands } from './stock'
import { productionCommand, productionWorkspace } from './production'
import { qualityCommand, qualityWorkspace } from './quality'
import { procurementCommands } from './procurement'
import { itemControlCommands, validateMaster } from './item-controls'
import { documentCommands } from './documents'
import { custodyCommands, vendorWorkspace, packingWorkspace, returnWorkspace } from './custody'
import { equipmentCommand, equipmentWorkspace } from './equipment'
import { transferCommands } from './transfer'
import { auditPage, factoryReport, recordLinks, searchRecords } from './read-models'
import { cutoverPreview, cutoverReceiptSchema } from './cutover'
import { queryRows } from './queries'
import { requestSchema, type LocalRequest } from './protocol'

const handlers: Record<string, CommandHandler> = { ...commercialCommands, ...stockCommands, ...procurementCommands, ...itemControlCommands, ...documentCommands, ...custodyCommands, ...transferCommands, production_command: productionCommand, quality_command: qualityCommand, equipment_command: equipmentCommand }
const editableMasters: Record<string, string[]> = {
  customers: ['company_id', 'code', 'name'], suppliers: ['company_id', 'code', 'name', 'qualification_note', 'certificate_requirements'],
  items: ['company_id', 'sku', 'description', 'base_uom', 'specification', 'grade', 'dimensions', 'storage_requirements', 'reorder_quantity', 'preferred_supplier_id'],
  drawings: ['company_id', 'item_id', 'drawing_number'], warehouses: ['company_id', 'plant_id', 'code', 'name'], stock_locations: ['company_id', 'warehouse_id', 'code', 'name'], work_centres: ['company_id', 'plant_id', 'code', 'name'],
}
const permissions = ["audit.read","customer_parts.manage","customer_parts.read","customer_returns.read","customer_returns.receive","dispatch.manage","dispatch.read","documents.manage","documents.read","drawings.manage","drawings.read","engineering.feasibility.manage","equipment.calibrate","equipment.maintain","equipment.manage","equipment.read","exports.approve","exports.manage","exports.read","imports.approve","imports.manage","imports.read","item_controls.approve","item_controls.manage","item_controls.read","jobwork.manage","jobwork.read","jobwork.review","master_data.manage","master_data.read","planning.manage","production.execute","production.read","purchase.approve","purchase.manage","purchase.read","quality.inspect","quality.manage","quality.read","quality.release","quality.review","quotation.approve","sales.manage","sales.read","stock.count","stock.issue","stock.read","stock.receive","stock.reserve","stock.return","stock.transform"]
export class LocalEngine {
  readonly store: Store
  readonly identity: { id: string; workspace_id: string; state: string }
  constructor(readonly db: Database) {
    initializeDatabase(db)
    let owner = db.all('SELECT * FROM local_identity')[0]
    if (!owner) {
      const id = crypto.randomUUID(), workspace = crypto.randomUUID()
      db.exec('INSERT INTO local_identity VALUES (?,?,?,?)', [id, workspace, 'active', new Date().toISOString()])
      owner = { id, workspace_id: workspace, state: 'active' }
    }
    this.identity = { id: String(owner.id), workspace_id: String(owner.workspace_id), state: String(owner.state) }
    this.store = new Store(db, this.identity.id)
    if (db.all('PRAGMA quick_check')[0]?.quick_check !== 'ok' || db.all('PRAGMA foreign_key_check').length) throw new Error('LOCAL_DATABASE_INTEGRITY_FAILURE')
  }
  transaction<T>(action: () => T): T {
    if (this.db.all('SELECT state FROM local_identity')[0]?.state !== 'active') throw new Error('SOLO_HISTORY_READ_ONLY')
    if (this.db.all('SELECT id FROM local_cutover_intent WHERE receipt IS NULL').length) throw new Error('SOLO_MOVE_PENDING')
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = action(); this.db.exec('COMMIT'); return result } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  execute(input: LocalRequest): unknown {
    const request = requestSchema.parse(input)
    if (request.operation === 'identity') return { ...this.identity, state: this.db.all('SELECT state FROM local_identity')[0]?.state, pending: Boolean(this.db.all('SELECT id FROM local_cutover_intent WHERE receipt IS NULL').length) }
    if (request.operation === 'cutover_pending') return this.db.all('SELECT * FROM local_cutover_intent WHERE receipt IS NULL')[0] ?? null
    if (request.operation === 'cutover_preview') return cutoverPreview(new CommandContext(this.store, request.companyId, ''))
    if (request.operation === 'cutover_prepare') {
      const existing = this.db.all('SELECT * FROM local_cutover_intent WHERE receipt IS NULL')[0]
      if (existing) {
        if (existing.company_id !== request.targetCompanyId || existing.cloud_owner_id !== request.cloudOwnerId) throw new Error('CUTOVER_TARGET_MISMATCH')
        return existing
      }
      return this.transaction(() => {
        const c = new CommandContext(this.store, request.companyId, '')
        if (cutoverPreview(c).blockers.length) throw new Error('CUTOVER_RECONCILIATION_REQUIRED')
        const id = crypto.randomUUID()
        this.db.exec('INSERT INTO local_cutover_intent VALUES (?,?,?,?,NULL,NULL,NULL)', [id, request.targetCompanyId, request.cloudOwnerId, request.reason])
        return this.db.all('SELECT * FROM local_cutover_intent WHERE id=?', [id])[0]
      })
    }
    if (request.operation === 'cutover_attach_backup') {
      const intent = this.db.all('SELECT * FROM local_cutover_intent WHERE receipt IS NULL')[0]
      if (!intent || (intent.snapshot_sha256 && intent.snapshot_sha256 !== request.sha256)) throw new Error('CUTOVER_SNAPSHOT_MISMATCH')
      this.db.exec('UPDATE local_cutover_intent SET snapshot_sha256=?,backup_id=? WHERE id=?', [request.sha256, request.backupId, String(intent.id)]); return intent.id
    }
    if (request.operation === 'cutover_finish') {
      const receipt = cutoverReceiptSchema.parse(request.receipt), intent = this.db.all('SELECT * FROM local_cutover_intent WHERE receipt IS NULL')[0]
      if (!intent || intent.id !== receipt.id || intent.company_id !== receipt.company_id || receipt.workspace_id !== this.identity.workspace_id || (intent.snapshot_sha256 && intent.snapshot_sha256 !== receipt.snapshot_sha256)) throw new Error('CUTOVER_RECEIPT_MISMATCH')
      this.db.exec('BEGIN IMMEDIATE')
      try {
        if (receipt.status === 'committed') this.db.exec("UPDATE local_identity SET state='archived'")
        this.db.exec('UPDATE local_cutover_intent SET receipt=? WHERE id=?', [JSON.stringify(receipt), receipt.id]); this.db.exec('COMMIT')
      } catch (error) { this.db.exec('ROLLBACK'); throw error }
      return receipt.status
    }
    if (request.operation === 'query') {
      const query = request.query
      if (!query.mutation) return queryRows(this.store, query)
      return this.transaction(() => {
        const allowed = editableMasters[query.table]
        if (!allowed || Object.keys(query.mutation!.values).some((key) => !allowed.includes(key))) throw new Error('FORBIDDEN_LOCAL_MUTATION')
        const data = query.mutation!.values
        validateMaster(query.table, data)
        const companyId = data.company_id ?? query.filters.find((entry) => entry.column === 'company_id' && entry.operator === 'eq')?.value
        z.uuid().parse(companyId); this.store.one('companies', companyId)
        const c = new CommandContext(this.store, String(companyId), crypto.randomUUID())
        let row: Row
        if (query.mutation!.kind === 'insert') row = c.insert(query.table, data)
        else {
          if (query.table !== 'items' && query.table !== 'suppliers') throw new Error('FORBIDDEN_LOCAL_MUTATION')
          const id = query.filters.find((entry) => entry.column === 'id' && entry.operator === 'eq')?.value
          row = c.one(query.table, id); c.update(query.table, row, data); row = { ...row, ...data }
        }
        c.audit(query.table, row.id, `master_${query.mutation!.kind}`)
        return { data: query.single ? row : [row], count: 1 }
      })
    }
    if (request.operation === 'file_read') {
      const file = this.db.all('SELECT bytes FROM local_files WHERE path=?', [request.path])[0]
      if (!file) throw new Error('DOCUMENT_FILE_MISSING')
      return file.bytes
    }
    if (request.operation === 'file_write') return this.transaction(() => {
      const document = [...this.store.rows('lot_documents'), ...this.store.rows('drawing_documents')].find((row) => row.object_path === request.path)
      if (!document || document.created_by !== this.identity.id || document.sha256 !== request.sha256 || document.byte_size !== request.bytes.length) throw new Error('DOCUMENT_FILE_MISMATCH')
      const existing = this.db.all('SELECT sha256 FROM local_files WHERE path=?', [request.path])[0]
      if (existing) { if (existing.sha256 !== request.sha256) throw new Error('DOCUMENT_FILE_MISMATCH'); return document.id }
      if (document.status !== 'pending') throw new Error('INVALID_TRANSITION')
      this.db.exec('INSERT INTO local_files VALUES (?,?,?)', [request.path, request.bytes, request.sha256]); return document.id
    })
    if (request.operation === 'snapshot' || request.operation === 'restore') throw new Error('SNAPSHOT_REQUIRES_WORKER')
    const a = request.args
    if (request.name === 'bootstrap_initial_company') return this.transaction(() => {
      if (this.store.rows('companies').length) throw new Error('COMPANY_ALREADY_EXISTS')
      const company = this.store.insert('companies', { name: z.string().trim().min(1).max(160).parse(a.p_company_name) })
      this.store.insert('plants', { company_id: company.id, name: z.string().trim().min(1).max(160).parse(a.p_plant_name) })
      const c = new CommandContext(this.store, String(company.id), crypto.randomUUID()); c.audit('companies', company.id, 'solo_workspace_created'); return company.id
    })
    const companyId = z.uuid().parse(a.p_company_id); this.store.one('companies', companyId)
    const c = new CommandContext(this.store, companyId, String(a.p_idempotency_key ?? ''))
    if (request.name === 'get_my_company_permissions') {
      const writable = this.db.all('SELECT state FROM local_identity')[0]?.state === 'active' && !this.db.all('SELECT id FROM local_cutover_intent WHERE receipt IS NULL').length
      return permissions.filter((code) => writable || code.endsWith('.read')).map((permission_code) => ({ permission_code }))
    }
    if (request.name === 'get_production_workspace') return productionWorkspace(c)
    if (request.name === 'get_quality_workspace') return qualityWorkspace(c)
    if (request.name === 'get_vendor_workspace') return vendorWorkspace(c)
    if (request.name === 'get_packing_workspace') return packingWorkspace(c)
    if (request.name === 'get_customer_return_workspace') return returnWorkspace(c)
    if (request.name === 'get_equipment_workspace') return equipmentWorkspace(c)
    if (request.name === 'get_data_imports') return c.rows('import_batches').map((row) => ({ ...row, records: c.rows('import_records', { batch_id: row.id }) }))
    if (request.name === 'get_accounting_exports') return c.rows('accounting_export_batches')
    if (request.name === 'get_company_audit_page') return auditPage(c, a)
    if (request.name === 'get_factory_report') return factoryReport(c, a)
    if (request.name === 'search_company_records' || request.name === 'lookup_scanned_record') return searchRecords(c, a.p_query, request.name === 'lookup_scanned_record')
    if (request.name === 'get_record_links_page') return recordLinks(c, a)
    if (request.name === 'get_company_members' || request.name === 'set_company_member_access') throw new Error('TEAM_ROLE_MANAGEMENT_REQUIRED')
    if (request.name === 'get_item_controls') return { specifications: c.rows('item_specification_versions'), conversions: c.rows('item_unit_conversions') }
    if (request.name === 'get_drawing_workspace') return { drawings: c.rows('drawings'), revisions: c.rows('drawing_revisions'), documents: c.rows('drawing_documents') }
    if (request.name === 'get_customer_part_workspace') return c.rows('customer_item_references').map((row) => {
      const customer = c.one('customers', row.customer_id), item = c.one('items', row.item_id)
      const revision = row.drawing_revision_id ? c.one('drawing_revisions', row.drawing_revision_id) : null
      return { ...row, customer_name: customer.name, customer_code: customer.code, sku: item.sku, drawing_label: revision ? `${c.one('drawings', revision.drawing_id).drawing_number} Rev ${revision.revision}` : null }
    })
    if (request.name === 'get_dispatch_order_options') return { salesOrders: c.rows('sales_orders'), salesOrderLines: c.rows('sales_order_lines') }
    if (request.name === 'get_order_command_center') return c.rows('sales_orders').map((order) => {
      const lines = new Set(c.rows('sales_order_lines', { sales_order_id: order.id }).map((row) => row.id))
      const reservations = c.rows('stock_reservations').filter((row) => row.status === 'active' && lines.has(row.sales_order_line_id))
      const packing = new Set(c.rows('packing_orders', { sales_order_id: order.id }).map((row) => row.id))
      const shipments = c.rows('shipments').filter((row) => packing.has(row.packing_order_id))
      return { sales_order_id: order.id, sales_order_number: order.sales_order_number, customer_po_number: order.customer_po_number, sales_order_status: order.status, promised_date: order.promised_date, active_reservation_count: reservations.length, prepared_shipment_count: shipments.filter((row) => row.status === 'draft').length, dispatched_shipment_count: shipments.filter((row) => row.status === 'dispatched').length, stock_status: reservations.length ? 'Reserved' : 'Stock required', packing_dispatch_status: shipments.some((row) => row.status === 'draft') ? 'Prepared' : 'Not prepared', next_action: order.status === 'fulfilled' ? 'Complete' : reservations.length ? 'Prepare packing' : 'Reserve released stock' }
    })
    const handler = handlers[request.name]
    if (!handler) throw new Error('LOCAL_COMMAND_NOT_IMPLEMENTED')
    const key = z.string().min(1).max(128).parse(a.p_idempotency_key)
    const canonical = JSON.stringify([request.name, a])
    return this.transaction(() => {
      const previous = this.db.all('SELECT * FROM local_command_results WHERE key=?', [key])[0]
      if (previous) {
        if (previous.command !== request.name || previous.request !== canonical) throw new Error('IDEMPOTENCY_CONFLICT')
        return JSON.parse(String(previous.result))
      }
      const result = handler(c, a)
      this.db.exec('INSERT INTO local_command_results VALUES (?,?,?,?)', [key, request.name, canonical, JSON.stringify(result)])
      return result
    })
  }
}
