-- TASK-0005: commercial transitions are validated commands, never browser table writes.
create function public.record_feasibility(
  p_company_id uuid,
  p_rfq_id uuid,
  p_status text,
  p_drawing_revision_id uuid,
  p_bom_revision_id uuid,
  p_routing_revision_id uuid,
  p_conditions text,
  p_expected_rfq_revision integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feasibility_id uuid;
  v_rfq_status text;
  v_rfq_revision integer;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0001'; end if;
  if not (select private.has_company_permission(p_company_id, 'engineering.feasibility.manage')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_expected_rfq_revision is null or p_status not in ('feasible', 'conditional', 'not_feasible', 'info_required')
    or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_FEASIBILITY_REQUEST' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_feasibility_id from public.command_idempotency
  where company_id = p_company_id and command_name = 'record_feasibility' and idempotency_key = p_idempotency_key;
  if found then return v_feasibility_id; end if;

  select status, revision into v_rfq_status, v_rfq_revision from public.rfqs
  where id = p_rfq_id and company_id = p_company_id for update;
  if not found then raise exception 'RFQ_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_rfq_status not in ('new', 'awaiting_info', 'review_required') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if v_rfq_revision <> p_expected_rfq_revision then raise exception 'REVISION_CONFLICT' using errcode = 'P0001'; end if;
  if p_drawing_revision_id is not null and not exists (
    select 1 from public.drawing_revisions where id = p_drawing_revision_id and company_id = p_company_id and status = 'approved'
  ) then raise exception 'ENGINEERING_REVISION_NOT_APPROVED' using errcode = 'P0001'; end if;
  if p_bom_revision_id is not null and not exists (
    select 1 from public.bom_revisions where id = p_bom_revision_id and company_id = p_company_id and status = 'approved'
  ) then raise exception 'ENGINEERING_REVISION_NOT_APPROVED' using errcode = 'P0001'; end if;
  if p_routing_revision_id is not null and not exists (
    select 1 from public.routing_revisions where id = p_routing_revision_id and company_id = p_company_id and status = 'approved'
  ) then raise exception 'ENGINEERING_REVISION_NOT_APPROVED' using errcode = 'P0001'; end if;

  insert into public.feasibility_reviews (
    company_id, rfq_id, status, drawing_revision_id, bom_revision_id, routing_revision_id, conditions, reviewed_by, reviewed_at
  ) values (
    p_company_id, p_rfq_id, p_status, p_drawing_revision_id, p_bom_revision_id, p_routing_revision_id,
    nullif(trim(p_conditions), ''), (select auth.uid()), now()
  ) on conflict (rfq_id) do update set
    status = excluded.status,
    drawing_revision_id = excluded.drawing_revision_id,
    bom_revision_id = excluded.bom_revision_id,
    routing_revision_id = excluded.routing_revision_id,
    conditions = excluded.conditions,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    revision = public.feasibility_reviews.revision + 1
  returning id into v_feasibility_id;
  update public.rfqs set
    status = case p_status when 'feasible' then 'qualified' when 'conditional' then 'qualified'
      when 'info_required' then 'awaiting_info' else 'lost' end,
    revision = revision + 1,
    updated_at = now()
  where id = p_rfq_id and company_id = p_company_id;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'record_feasibility', p_idempotency_key, v_feasibility_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key)
  values (p_company_id, (select auth.uid()), 'feasibility_review', v_feasibility_id, 'feasibility.recorded', p_idempotency_key);
  return v_feasibility_id;
end;
$$;

create function public.create_quotation(
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

  insert into public.quotations (company_id, quotation_number, rfq_id, customer_id, currency_code, valid_until)
  values (p_company_id, upper(trim(p_quotation_number)), p_rfq_id, v_customer_id, p_currency_code, p_valid_until)
  returning id into v_quotation_id;
  insert into public.quotation_lines (company_id, quotation_id, item_id, quantity, uom, unit_price, bom_revision_id, routing_revision_id)
  select p_company_id, v_quotation_id, line.item_id, line.quantity, line.uom, line.unit_price, line.bom_revision_id, line.routing_revision_id
  from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid);
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'create_quotation', p_idempotency_key, v_quotation_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key)
  values (p_company_id, (select auth.uid()), 'quotation', v_quotation_id, 'quotation.created', p_idempotency_key);
  return v_quotation_id;
end;
$$;

create function public.approve_quotation(
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
  update public.quotations set status = 'approved', approved_by = (select auth.uid()), approved_at = now(), revision = revision + 1
  where id = p_quotation_id and company_id = p_company_id;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'approve_quotation', p_idempotency_key, p_quotation_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key)
  values (p_company_id, (select auth.uid()), 'quotation', p_quotation_id, 'quotation.approved', p_idempotency_key);
  return p_quotation_id;
end;
$$;

create function public.accept_quotation_create_sales_order(
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
  insert into public.sales_orders (company_id, sales_order_number, quotation_id, customer_id, customer_po_number, promised_date)
  values (p_company_id, upper(trim(p_sales_order_number)), p_quotation_id, v_customer_id, trim(p_customer_po_number), p_promised_date)
  returning id into v_sales_order_id;
  insert into public.sales_order_lines (company_id, sales_order_id, quotation_line_id, item_id, ordered_quantity, uom, unit_price, bom_revision_id, routing_revision_id)
  select company_id, v_sales_order_id, id, item_id, quantity, uom, unit_price, bom_revision_id, routing_revision_id
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

revoke all on function public.record_feasibility(uuid, uuid, text, uuid, uuid, uuid, text, integer, text) from public;
revoke all on function public.create_quotation(uuid, uuid, text, text, date, jsonb, text) from public;
revoke all on function public.approve_quotation(uuid, uuid, integer, text) from public;
revoke all on function public.accept_quotation_create_sales_order(uuid, uuid, text, text, date, integer, text) from public;
grant execute on function public.record_feasibility(uuid, uuid, text, uuid, uuid, uuid, text, integer, text) to authenticated;
grant execute on function public.create_quotation(uuid, uuid, text, text, date, jsonb, text) to authenticated;
grant execute on function public.approve_quotation(uuid, uuid, integer, text) to authenticated;
grant execute on function public.accept_quotation_create_sales_order(uuid, uuid, text, text, date, integer, text) to authenticated;
