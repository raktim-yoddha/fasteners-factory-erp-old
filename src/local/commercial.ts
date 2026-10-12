import { type CommandHandler, type CommandContext } from './context'
import type { Row } from './database'
import { decimal, quantity } from './exact'
import { plantDate } from '@/lib/decimal'

function approved(c: CommandContext, table: string, id: unknown, itemId: unknown, parent: string, key: string) {
  if (!id) return null
  const revision = c.one(table, id)
  c.state(revision, 'approved')
  const master = c.one(parent, revision[key])
  if ((master.item_id ?? master.output_item_id) !== itemId) throw new Error('ENGINEERING_ITEM_MISMATCH')
  return revision.id
}
function pins(c: CommandContext, line: Row): Row {
  return {
    bom_revision_id: approved(c, 'bom_revisions', line.bom_revision_id, line.item_id, 'boms', 'bom_id'),
    routing_revision_id: approved(c, 'routing_revisions', line.routing_revision_id, line.item_id, 'routings', 'routing_id'),
    drawing_revision_id: approved(c, 'drawing_revisions', line.drawing_revision_id, line.item_id, 'drawings', 'drawing_id'),
  }
}
export const commercialCommands: Record<string, CommandHandler> = {
  create_rfq(c, a) {
    c.one('customers', a.p_customer_id)
    if (!Array.isArray(a.p_lines) || a.p_lines.length < 1 || a.p_lines.length > 100) throw new Error('INVALID_LINES')
    const rfq = c.insert('rfqs', { rfq_number: a.p_rfq_number, customer_id: a.p_customer_id, requirement_summary: c.reason(a.p_requirement_summary) })
    for (const value of a.p_lines) {
      const line = value as Row
      if (line.item_id) c.unit(line.item_id, line.quantity, line.uom)
      c.insert('rfq_lines', { ...line, quantity: quantity(line.quantity, line.uom), rfq_id: rfq.id })
    }
    c.audit('rfqs', rfq.id, 'rfq_created'); return rfq.id
  },
  record_feasibility(c, a) {
    const rfq = c.one('rfqs', a.p_rfq_id)
    c.revision(rfq, a.p_expected_rfq_revision); c.state(rfq, 'new', 'awaiting_info', 'review_required', 'qualified')
    if (!['feasible', 'conditional', 'not_feasible', 'info_required'].includes(String(a.p_status))) throw new Error('INVALID_FEASIBILITY')
    for (const [table, key] of [['drawing_revisions', 'p_drawing_revision_id'], ['bom_revisions', 'p_bom_revision_id'], ['routing_revisions', 'p_routing_revision_id']]) if (a[key!]) c.state(c.one(table!, a[key!]), 'approved')
    const values = { rfq_id: rfq.id, status: a.p_status, drawing_revision_id: a.p_drawing_revision_id ?? null, bom_revision_id: a.p_bom_revision_id ?? null, routing_revision_id: a.p_routing_revision_id ?? null, conditions: a.p_conditions, reviewed_by: c.actor, reviewed_at: new Date().toISOString() }
    let review = c.rows('feasibility_reviews', { rfq_id: rfq.id })[0]
    if (review) c.bump('feasibility_reviews', review, values)
    else review = c.insert('feasibility_reviews', values)
    c.bump('rfqs', rfq, { status: ['feasible', 'conditional'].includes(String(a.p_status ?? (a.p_data as Row)?.status)) ? 'qualified' : (a.p_status ?? (a.p_data as Row)?.status) === 'info_required' ? 'awaiting_info' : 'lost' }); c.audit('rfqs', rfq.id, 'feasibility_recorded', a.p_conditions); return review.id
  },
  record_rfq_line_feasibility(c, a) {
    const d = a.p_data as Row; const line = c.one('rfq_lines', d.line_id); const rfq = c.one('rfqs', line.rfq_id)
    c.revision(rfq, d.expected_revision); c.state(rfq, 'new', 'awaiting_info', 'review_required', 'qualified')
    if (!['feasible', 'conditional', 'not_feasible', 'info_required'].includes(String(d.status))) throw new Error('INVALID_FEASIBILITY')
    if (d.item_id) { c.one('items', d.item_id); pins(c, d) }
    const prior = c.rows('rfq_line_feasibility_reviews', { rfq_line_id: line.id })
    const review = c.insert('rfq_line_feasibility_reviews', { ...d, rfq_line_id: line.id, item_id: d.item_id ?? null, version: prior.length + 1, conditions: d.conditions ?? '', reviewed_by: c.actor, reviewed_at: new Date().toISOString() })
    c.bump('rfqs', rfq, { status: ['feasible', 'conditional'].includes(String(a.p_status ?? (a.p_data as Row)?.status)) ? 'qualified' : (a.p_status ?? (a.p_data as Row)?.status) === 'info_required' ? 'awaiting_info' : 'lost' }); c.audit('rfqs', rfq.id, 'line_feasibility_recorded', d.conditions); return review.id
  },
  create_quotation(c, a) {
    const rfq = c.one('rfqs', a.p_rfq_id); c.state(rfq, 'qualified')
    if (!Array.isArray(a.p_lines) || !a.p_lines.length || a.p_lines.length > 100) throw new Error('INVALID_LINES')
    const quote = c.insert('quotations', { quotation_number: a.p_quotation_number, rfq_id: rfq.id, customer_id: rfq.customer_id, currency_code: a.p_currency_code, valid_until: a.p_valid_until })
    for (const input of a.p_lines) {
      const line = input as Row; c.unit(line.item_id, line.quantity, line.uom)
      if (decimal(line.unit_price) < 0n || !line.pricing_source) throw new Error('INVALID_PRICE')
      let feasibility: Row | undefined
      if (line.rfq_line_id) {
        const rfqLine = c.one('rfq_lines', line.rfq_line_id)
        if (rfqLine.rfq_id !== rfq.id) throw new Error('RFQ_LINE_MISMATCH')
        feasibility = c.rows('rfq_line_feasibility_reviews', { rfq_line_id: rfqLine.id }).at(-1)
        if (feasibility?.item_id !== line.item_id) throw new Error('FEASIBILITY_REQUIRED')
      } else {
        if (c.rows('rfq_lines', { rfq_id: rfq.id }).some((row) => c.rows('rfq_line_feasibility_reviews', { rfq_line_id: row.id }).length)) throw new Error('RFQ_LINE_REQUIRED')
        feasibility = c.rows('feasibility_reviews', { rfq_id: rfq.id }).at(-1)
      }
      if (!feasibility || !['feasible', 'conditional'].includes(String(feasibility.status))) throw new Error('FEASIBILITY_REQUIRED')
      if ((line.bom_revision_id && feasibility.bom_revision_id && line.bom_revision_id !== feasibility.bom_revision_id) || (line.routing_revision_id && feasibility.routing_revision_id && line.routing_revision_id !== feasibility.routing_revision_id)) throw new Error('ENGINEERING_PIN_MISMATCH')
      line.bom_revision_id ??= feasibility.bom_revision_id
      line.routing_revision_id ??= feasibility.routing_revision_id
      let drawing = feasibility.drawing_revision_id
      if (line.customer_part_reference_id) {
        const ref = c.one('customer_item_references', line.customer_part_reference_id)
        if (ref.retired_at || ref.customer_id !== rfq.customer_id || ref.item_id !== line.item_id) throw new Error('CUSTOMER_PART_MISMATCH')
        drawing = ref.drawing_revision_id ?? drawing
      }
      const specification = c.rows('item_specification_versions', { item_id: line.item_id, status: 'approved' }).at(-1)
      c.insert('quotation_lines', { ...line, ...pins(c, { ...line, drawing_revision_id: drawing }), quotation_id: quote.id, item_specification_id: specification?.id ?? null, rfq_line_id: line.rfq_line_id ?? null, feasibility_review_id: line.rfq_line_id ? feasibility.id : null })
    }
    c.bump('rfqs', rfq, {}); c.audit('quotations', quote.id, 'quotation_created'); return quote.id
  },
  approve_quotation(c, a) {
    const row = c.one('quotations', a.p_quotation_id); c.revision(row, a.p_expected_revision); c.state(row, 'draft')
    if (row.valid_until && String(row.valid_until) < plantDate()) throw new Error('QUOTATION_EXPIRED')
    c.bump('quotations', row, { status: 'approved', approved_by: c.actor, approved_at: new Date().toISOString() }); c.audit('quotations', row.id, 'quotation_owner_approved'); return row.id
  },
  accept_quotation_create_sales_order(c, a) {
    const quote = c.one('quotations', a.p_quotation_id); c.revision(quote, a.p_expected_quotation_revision); c.state(quote, 'approved')
    if (!a.p_customer_po_number || (quote.valid_until && String(quote.valid_until) < plantDate())) throw new Error('QUOTATION_EXPIRED_OR_PO_MISSING')
    const order = c.insert('sales_orders', { sales_order_number: a.p_sales_order_number, quotation_id: quote.id, customer_id: quote.customer_id, customer_po_number: a.p_customer_po_number, promised_date: a.p_promised_date, status: 'open' })
    for (const line of c.rows('quotation_lines', { quotation_id: quote.id })) c.insert('sales_order_lines', { ...line, id: crypto.randomUUID(), sales_order_id: order.id, quotation_line_id: line.id, ordered_quantity: line.quantity })
    c.bump('quotations', quote, { status: 'accepted' }); c.audit('sales_orders', order.id, 'sales_order_created'); return order.id
  },
}
