-- ADR 0016 / TASK-0011: repair authorization, stock truth and commercial revision pins.
create or replace function private.has_company_permission(target_company_id uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_company_roles user_role
    join public.company_memberships membership on membership.company_id = user_role.company_id and membership.user_id = user_role.user_id and membership.active
    join public.role_permissions role_permission on role_permission.role = user_role.role
    where user_role.company_id = target_company_id and user_role.user_id = (select auth.uid()) and role_permission.permission_code = required_permission
  );
$$;

alter table public.quotation_lines add column drawing_revision_id uuid,
  add column pricing_source text not null default 'Manual entry' check (char_length(trim(pricing_source)) between 1 and 500),
  add foreign key (drawing_revision_id, company_id) references public.drawing_revisions(id, company_id);
alter table public.sales_order_lines add column drawing_revision_id uuid,
  add column pricing_source text not null default 'Manual entry',
  add foreign key (drawing_revision_id, company_id) references public.drawing_revisions(id, company_id);

create or replace view public.stock_positions with (security_invoker = true) as
select lot.company_id, lot.id as lot_id, lot.item_id, lot.location_id, lot.qc_status,
  coalesce(ledger.on_hand, 0::numeric) as on_hand,
  coalesce(reservation.reserved, 0::numeric) as reserved,
  case when lot.qc_status = 'released' then coalesce(ledger.on_hand, 0::numeric) - coalesce(reservation.reserved, 0::numeric) else 0::numeric end as available_to_promise
from public.stock_lots lot
left join lateral (select sum(entry.quantity_delta) as on_hand from public.stock_ledger_entries entry where entry.company_id = lot.company_id and entry.lot_id = lot.id) ledger on true
left join lateral (select sum(res.quantity - res.consumed_quantity) as reserved from public.stock_reservations res where res.company_id = lot.company_id and res.lot_id = lot.id and res.status = 'active') reservation on true;

create or replace function public.reserve_finished_goods(
  p_company_id uuid,
  p_sales_order_line_id uuid,
  p_lot_id uuid,
  p_quantity numeric,
  p_expected_sales_order_revision integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation_id uuid;
  v_line_item_id uuid;
  v_order_id uuid;
  v_order_status text;
  v_order_revision integer;
  v_lot_item_id uuid;
  v_lot_qc_status text;
  v_line_uom text;
  v_ordered_quantity numeric;
  v_committed_quantity numeric;
  v_base_uom text;
  v_on_hand numeric(18, 6);
  v_reserved numeric(18, 6);
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;
  if not (select private.has_company_permission(p_company_id, 'stock.reserve')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_expected_sales_order_revision is null
    or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_RESERVATION_REQUEST' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_reservation_id
  from public.command_idempotency
  where company_id = p_company_id and command_name = 'reserve_finished_goods' and idempotency_key = p_idempotency_key;
  if found then
    return v_reservation_id;
  end if;

  select line.item_id, header.id, header.status, header.revision, line.uom, line.ordered_quantity
  into v_line_item_id, v_order_id, v_order_status, v_order_revision, v_line_uom, v_ordered_quantity
  from public.sales_order_lines line
  join public.sales_orders header on header.id = line.sales_order_id and header.company_id = line.company_id
  where line.id = p_sales_order_line_id and line.company_id = p_company_id
  for update of header;
  if not found then
    raise exception 'SALES_ORDER_LINE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_order_status not in ('open', 'partially_shipped') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if v_order_revision <> p_expected_sales_order_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  select item_id, qc_status into v_lot_item_id, v_lot_qc_status
  from public.stock_lots
  where id = p_lot_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'LOT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_lot_item_id <> v_line_item_id then
    raise exception 'LOT_ITEM_MISMATCH' using errcode = 'P0001';
  end if;
  if v_lot_qc_status <> 'released' then
    raise exception 'LOT_QC_HOLD' using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity_delta), 0::numeric) into v_on_hand
  from public.stock_ledger_entries
  where company_id = p_company_id and lot_id = p_lot_id;
  select base_uom into v_base_uom from public.items where id = v_lot_item_id and company_id = p_company_id;
  if v_line_uom <> v_base_uom then raise exception 'UOM_MISMATCH' using errcode = 'P0001'; end if;
  select coalesce(sum(case when status = 'active' then quantity else consumed_quantity end), 0) into v_committed_quantity
  from public.stock_reservations where company_id = p_company_id and sales_order_line_id = p_sales_order_line_id;
  if v_committed_quantity + p_quantity > v_ordered_quantity then raise exception 'ORDER_QUANTITY_EXCEEDED' using errcode = 'P0001'; end if;
  select coalesce(sum(quantity - consumed_quantity), 0::numeric) into v_reserved
  from public.stock_reservations
  where company_id = p_company_id and lot_id = p_lot_id and status = 'active';
  if v_on_hand - v_reserved < p_quantity then
    raise exception 'INSUFFICIENT_AVAILABLE_STOCK' using errcode = 'P0001';
  end if;

  insert into public.stock_reservations (company_id, sales_order_line_id, lot_id, quantity, idempotency_key, created_by)
  values (p_company_id, p_sales_order_line_id, p_lot_id, p_quantity, p_idempotency_key, (select auth.uid()))
  returning id into v_reservation_id;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'reserve_finished_goods', p_idempotency_key, v_reservation_id);
  update public.sales_orders
  set revision = revision + 1, updated_at = now()
  where id = v_order_id and company_id = p_company_id;
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key, metadata)
  values (
    p_company_id, (select auth.uid()), 'stock_reservation', v_reservation_id, 'stock.reserved', p_idempotency_key,
    jsonb_build_object('sales_order_line_id', p_sales_order_line_id, 'lot_id', p_lot_id, 'quantity', p_quantity)
  );
  return v_reservation_id;
end;
$$;


create or replace function public.receive_finished_goods(
  p_company_id uuid,
  p_item_id uuid,
  p_location_id uuid,
  p_lot_code text,
  p_quantity numeric,
  p_uom text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_id uuid;
  v_lot_item_id uuid;
  v_lot_location_id uuid;
  v_lot_qc_status text;
  v_base_uom text;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0001'; end if;
  if not (select private.has_company_permission(p_company_id, 'stock.receive')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_quantity is null or p_quantity <= 0 or p_lot_code is null or char_length(trim(p_lot_code)) = 0
    or p_uom not in ('pcs', 'kg', 'm', 'set') or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_RECEIPT_REQUEST' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_lot_id from public.command_idempotency
  where company_id = p_company_id and command_name = 'receive_finished_goods' and idempotency_key = p_idempotency_key;
  if found then return v_lot_id; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':lot:' || upper(trim(p_lot_code)), 0));

  select base_uom into v_base_uom from public.items
  where id = p_item_id and company_id = p_company_id and active;
  if not found then raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_base_uom <> p_uom then raise exception 'UOM_MISMATCH' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.stock_locations where id = p_location_id and company_id = p_company_id and active) then
    raise exception 'STOCK_LOCATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  select id, item_id, location_id, qc_status into v_lot_id, v_lot_item_id, v_lot_location_id, v_lot_qc_status
  from public.stock_lots where company_id = p_company_id and lot_code = upper(trim(p_lot_code)) for update;
  if not found then
    insert into public.stock_lots (company_id, item_id, location_id, lot_code, qc_status)
    values (p_company_id, p_item_id, p_location_id, upper(trim(p_lot_code)), 'hold') returning id into v_lot_id;
  elsif v_lot_item_id <> p_item_id or v_lot_location_id <> p_location_id then
    raise exception 'LOT_SCOPE_MISMATCH' using errcode = 'P0001';
  elsif v_lot_qc_status <> 'hold' then
    raise exception 'LOT_QC_HOLD' using errcode = 'P0001';
  end if;
  insert into public.stock_ledger_entries (
    company_id, lot_id, item_id, location_id, movement_type, quantity_delta, uom, source_type, source_id, idempotency_key, created_by
  ) values (
    p_company_id, v_lot_id, p_item_id, p_location_id, 'production_receipt', p_quantity, p_uom,
    'finished_goods_receipt', v_lot_id, p_idempotency_key, (select auth.uid())
  );
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'receive_finished_goods', p_idempotency_key, v_lot_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key, metadata)
  values (p_company_id, (select auth.uid()), 'stock_lot', v_lot_id, 'stock.received', p_idempotency_key,
    jsonb_build_object('quantity', p_quantity, 'uom', p_uom, 'qc_status', 'hold'));
  return v_lot_id;
end;
$$;


create or replace function public.create_rfq(
  p_company_id uuid,
  p_rfq_number text,
  p_customer_id uuid,
  p_requirement_summary text,
  p_lines jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rfq_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;
  if not (select private.has_company_permission(p_company_id, 'sales.manage')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_rfq_number is null or char_length(trim(p_rfq_number)) = 0
    or p_requirement_summary is null or char_length(trim(p_requirement_summary)) = 0
    or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0
    or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'INVALID_RFQ_REQUEST' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_rfq_id
  from public.command_idempotency
  where company_id = p_company_id and command_name = 'create_rfq' and idempotency_key = p_idempotency_key;
  if found then
    return v_rfq_id;
  end if;

  if not exists (
    select 1 from public.customers
    where id = p_customer_id and company_id = p_company_id and active
  ) then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as line(item_id uuid, requested_description text, quantity numeric, uom text, required_by date)
    where line.requested_description is null or char_length(trim(line.requested_description)) = 0
      or line.quantity is null or line.quantity <= 0
      or line.uom not in ('pcs', 'kg', 'm', 'set')
  ) then
    raise exception 'INVALID_RFQ_LINE' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as line(item_id uuid, requested_description text, quantity numeric, uom text, required_by date)
    left join public.items item on item.id = line.item_id and item.company_id = p_company_id and item.active
    where line.item_id is not null and item.id is null
  ) then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.rfqs (company_id, rfq_number, customer_id, requirement_summary, created_by)
  values (p_company_id, upper(trim(p_rfq_number)), p_customer_id, trim(p_requirement_summary), (select auth.uid()))
  returning id into v_rfq_id;
  insert into public.rfq_lines (company_id, rfq_id, item_id, requested_description, quantity, uom, required_by)
  select
    p_company_id, v_rfq_id, line.item_id, trim(line.requested_description), line.quantity, line.uom, line.required_by
  from jsonb_to_recordset(p_lines) as line(item_id uuid, requested_description text, quantity numeric, uom text, required_by date);
  update public.rfqs set due_date = (select min(required_by) from public.rfq_lines where rfq_id = v_rfq_id) where id = v_rfq_id;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'create_rfq', p_idempotency_key, v_rfq_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key, metadata)
  values (
    p_company_id, (select auth.uid()), 'rfq', v_rfq_id, 'rfq.created', p_idempotency_key,
    jsonb_build_object('line_count', jsonb_array_length(p_lines))
  );
  return v_rfq_id;
end;
$$;


create or replace function public.create_quotation(
  p_company_id uuid,
  p_rfq_id uuid,
  p_quotation_number text,
  p_currency_code text,
  p_valid_until date,
  p_lines jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quotation_id uuid;
  v_customer_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0001'; end if;
  if not (select private.has_company_permission(p_company_id, 'sales.manage')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_quotation_number is null or char_length(trim(p_quotation_number)) = 0 or p_currency_code !~ '^[A-Z]{3}$'
    or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
    or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_QUOTATION_REQUEST' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_quotation_id from public.command_idempotency
  where company_id = p_company_id and command_name = 'create_quotation' and idempotency_key = p_idempotency_key;
  if found then return v_quotation_id; end if;

  select customer_id into v_customer_id from public.rfqs
  where id = p_rfq_id and company_id = p_company_id and status = 'qualified' for update;
  if not found then raise exception 'RFQ_NOT_QUALIFIED' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid)
    left join public.items item on item.id = line.item_id and item.company_id = p_company_id and item.active
    where line.item_id is null or item.id is null or line.quantity is null or line.quantity <= 0
      or line.uom not in ('pcs', 'kg', 'm', 'set') or line.unit_price is null or line.unit_price < 0
  ) then raise exception 'INVALID_QUOTATION_LINE' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid)
    where (line.bom_revision_id is not null and not exists (
      select 1 from public.bom_revisions where id = line.bom_revision_id and company_id = p_company_id and status = 'approved'
    )) or (line.routing_revision_id is not null and not exists (
      select 1 from public.routing_revisions where id = line.routing_revision_id and company_id = p_company_id and status = 'approved'
    ))
  ) then raise exception 'ENGINEERING_REVISION_NOT_APPROVED' using errcode = 'P0001'; end if;

  if p_valid_until is null or p_valid_until < (now() at time zone 'Asia/Kolkata')::date then raise exception 'QUOTATION_EXPIRED' using errcode = 'P0001'; end if;
  insert into public.quotations (company_id, quotation_number, rfq_id, customer_id, currency_code, valid_until)
  values (p_company_id, upper(trim(p_quotation_number)), p_rfq_id, v_customer_id, p_currency_code, p_valid_until)
  returning id into v_quotation_id;
  insert into public.quotation_lines (company_id, quotation_id, item_id, quantity, uom, unit_price, bom_revision_id, routing_revision_id)
  select p_company_id, v_quotation_id, line.item_id, line.quantity, line.uom, line.unit_price, line.bom_revision_id, line.routing_revision_id
  from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid);
  update public.quotation_lines q set pricing_source = coalesce(nullif(trim(line.pricing_source), ''), 'Manual entry')
  from jsonb_to_recordset(p_lines) as line(item_id uuid, pricing_source text) where q.quotation_id = v_quotation_id and q.item_id = line.item_id;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'create_quotation', p_idempotency_key, v_quotation_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key)
  values (p_company_id, (select auth.uid()), 'quotation', v_quotation_id, 'quotation.created', p_idempotency_key);
  return v_quotation_id;
end;
$$;

create or replace function public.approve_quotation(
  p_company_id uuid,
  p_quotation_id uuid,
  p_expected_revision integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result_id uuid;
  v_status text;
  v_revision integer;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0001'; end if;
  if not (select private.has_company_permission(p_company_id, 'quotation.approve')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_expected_revision is null or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_APPROVAL_REQUEST' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_result_id from public.command_idempotency
  where company_id = p_company_id and command_name = 'approve_quotation' and idempotency_key = p_idempotency_key;
  if found then return v_result_id; end if;
  select status, revision into v_status, v_revision from public.quotations
  where id = p_quotation_id and company_id = p_company_id for update;
  if not found then raise exception 'QUOTATION_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_status <> 'draft' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  if v_revision <> p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode = 'P0001'; end if;
  if exists (select 1 from public.quotations where id = p_quotation_id and valid_until < (now() at time zone 'Asia/Kolkata')::date) then raise exception 'QUOTATION_EXPIRED' using errcode = 'P0001'; end if;
  update public.quotations set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), revision = revision + 1
  where id = p_quotation_id and company_id = p_company_id;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'approve_quotation', p_idempotency_key, p_quotation_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key)
  values (p_company_id, (select auth.uid()), 'quotation', p_quotation_id, 'quotation.approved', p_idempotency_key);
  return p_quotation_id;
end;
$$;

create or replace function public.accept_quotation_create_sales_order(
  p_company_id uuid,
  p_quotation_id uuid,
  p_sales_order_number text,
  p_customer_po_number text,
  p_promised_date date,
  p_expected_quotation_revision integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sales_order_id uuid;
  v_customer_id uuid;
  v_quote_status text;
  v_quote_revision integer;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0001'; end if;
  if not (select private.has_company_permission(p_company_id, 'sales.manage')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_sales_order_number is null or char_length(trim(p_sales_order_number)) = 0
    or p_customer_po_number is null or char_length(trim(p_customer_po_number)) = 0
    or p_expected_quotation_revision is null or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_SALES_ORDER_REQUEST' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_sales_order_id from public.command_idempotency
  where company_id = p_company_id and command_name = 'accept_quotation_create_sales_order' and idempotency_key = p_idempotency_key;
  if found then return v_sales_order_id; end if;
  select status, revision, customer_id into v_quote_status, v_quote_revision, v_customer_id from public.quotations
  where id = p_quotation_id and company_id = p_company_id for update;
  if not found then raise exception 'QUOTATION_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_quote_status <> 'approved' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  if v_quote_revision <> p_expected_quotation_revision then raise exception 'REVISION_CONFLICT' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.quotation_lines where quotation_id = p_quotation_id and company_id = p_company_id) then
    raise exception 'EMPTY_QUOTATION' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.quotations where id = p_quotation_id and valid_until < (now() at time zone 'Asia/Kolkata')::date) then raise exception 'QUOTATION_EXPIRED' using errcode = 'P0001'; end if;
  insert into public.sales_orders (company_id, sales_order_number, quotation_id, customer_id, customer_po_number, promised_date)
  values (p_company_id, upper(trim(p_sales_order_number)), p_quotation_id, v_customer_id, trim(p_customer_po_number), p_promised_date)
  returning id into v_sales_order_id;
  insert into public.sales_order_lines (company_id, sales_order_id, quotation_line_id, item_id, ordered_quantity, uom, unit_price, bom_revision_id, routing_revision_id, drawing_revision_id, pricing_source)
  select company_id, v_sales_order_id, id, item_id, quantity, uom, unit_price, bom_revision_id, routing_revision_id, drawing_revision_id, pricing_source
  from public.quotation_lines where quotation_id = p_quotation_id and company_id = p_company_id;
  update public.quotations set status = 'accepted', revision = revision + 1
  where id = p_quotation_id and company_id = p_company_id;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'accept_quotation_create_sales_order', p_idempotency_key, v_sales_order_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key, metadata)
  values (p_company_id, (select auth.uid()), 'sales_order', v_sales_order_id, 'sales_order.created', p_idempotency_key,
    jsonb_build_object('quotation_id', p_quotation_id));
  return v_sales_order_id;
end;
$$;


create function private.pin_quotation_engineering()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_review public.feasibility_reviews%rowtype; v_rfq_id uuid; v_uom text;
begin
  select rfq_id into v_rfq_id from public.quotations where id = new.quotation_id and company_id = new.company_id;
  select * into v_review from public.feasibility_reviews where rfq_id = v_rfq_id and company_id = new.company_id;
  new.drawing_revision_id := v_review.drawing_revision_id;
  new.bom_revision_id := coalesce(new.bom_revision_id, v_review.bom_revision_id);
  new.routing_revision_id := coalesce(new.routing_revision_id, v_review.routing_revision_id);
  if (v_review.bom_revision_id is not null and new.bom_revision_id <> v_review.bom_revision_id)
    or (v_review.routing_revision_id is not null and new.routing_revision_id <> v_review.routing_revision_id) then
    raise exception 'ENGINEERING_PIN_MISMATCH';
  end if;
  if new.drawing_revision_id is not null and not exists (
    select 1 from public.drawing_revisions revision join public.drawings drawing on drawing.id = revision.drawing_id
    where revision.id = new.drawing_revision_id and revision.company_id = new.company_id and drawing.item_id = new.item_id and revision.status = 'approved'
  ) then raise exception 'ENGINEERING_REVISION_ITEM_MISMATCH'; end if;
  select base_uom into v_uom from public.items where id = new.item_id and company_id = new.company_id;
  if new.uom <> v_uom then raise exception 'UOM_MISMATCH'; end if;
  return new;
end;
$$;
revoke all on function private.pin_quotation_engineering() from public, anon, authenticated;
create trigger a_pin_quotation_engineering before insert on public.quotation_lines for each row execute function private.pin_quotation_engineering();

create function private.protect_master_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'items' then
    if new.base_uom <> old.base_uom and (exists (select 1 from public.stock_lots where item_id = old.id) or exists (select 1 from public.quotation_lines where item_id = old.id)) then raise exception 'UOM_IN_USE'; end if;
  elsif tg_table_name = 'drawings' then
    if new.item_id <> old.item_id and exists (select 1 from public.drawing_revisions where drawing_id = old.id and status = 'approved') then raise exception 'APPROVED_REVISION_IMMUTABLE'; end if;
  elsif tg_table_name = 'boms' then
    if new.output_item_id <> old.output_item_id and exists (select 1 from public.bom_revisions where bom_id = old.id and status = 'approved') then raise exception 'APPROVED_REVISION_IMMUTABLE'; end if;
  elsif tg_table_name = 'routings' then
    if new.output_item_id <> old.output_item_id and exists (select 1 from public.routing_revisions where routing_id = old.id and status = 'approved') then raise exception 'APPROVED_REVISION_IMMUTABLE'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_master_identity() from public, anon, authenticated;
create trigger protect_item_uom before update on public.items for each row execute function private.protect_master_identity();
create trigger protect_drawing_item before update on public.drawings for each row execute function private.protect_master_identity();
create trigger protect_bom_item before update on public.boms for each row execute function private.protect_master_identity();
create trigger protect_routing_item before update on public.routings for each row execute function private.protect_master_identity();
