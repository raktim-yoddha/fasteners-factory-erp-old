-- ADR 0016: exact decimal read positions and per-line pricing sources.
create view public.purchase_order_positions with (security_invoker=true) as
select o.company_id,o.id as purchase_order_id,o.quantity as ordered_quantity,
 coalesce((select sum(r.quantity) from public.goods_receipts r where r.purchase_order_id=o.id),0)-coalesce((select sum(t.quantity) from public.goods_returns t join public.goods_receipts r on r.id=t.receipt_id where r.purchase_order_id=o.id),0) as received_quantity,
 o.quantity-coalesce((select sum(r.quantity) from public.goods_receipts r where r.purchase_order_id=o.id),0)+coalesce((select sum(t.quantity) from public.goods_returns t join public.goods_receipts r on r.id=t.receipt_id where r.purchase_order_id=o.id),0) as outstanding_quantity
from public.purchase_orders o;
revoke all on public.purchase_order_positions from public,anon,authenticated;
grant select on public.purchase_order_positions to authenticated;
create view public.reservation_positions with (security_invoker=true) as
select company_id,id,sales_order_line_id,lot_id,quantity,consumed_quantity,quantity-consumed_quantity as remaining_quantity,status from public.stock_reservations;
revoke all on public.reservation_positions from public,anon,authenticated;
grant select on public.reservation_positions to authenticated;

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
    or p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100
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
    select 1 from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid, pricing_source text)
    left join public.items item on item.id = line.item_id and item.company_id = p_company_id and item.active
    where line.item_id is null or item.id is null or line.quantity is null or line.quantity <= 0
      or line.uom not in ('pcs', 'kg', 'm', 'set') or line.unit_price is null or line.unit_price < 0
  ) then raise exception 'INVALID_QUOTATION_LINE' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid, pricing_source text)
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
  insert into public.quotation_lines (company_id, quotation_id, item_id, quantity, uom, unit_price, bom_revision_id, routing_revision_id, pricing_source)
  select p_company_id, v_quotation_id, line.item_id, line.quantity, line.uom, line.unit_price, line.bom_revision_id, line.routing_revision_id, coalesce(nullif(trim(line.pricing_source), ''), 'Manual entry')
  from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid, pricing_source text);
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'create_quotation', p_idempotency_key, v_quotation_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key)
  values (p_company_id, (select auth.uid()), 'quotation', v_quotation_id, 'quotation.created', p_idempotency_key);
  return v_quotation_id;
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
    or p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
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
