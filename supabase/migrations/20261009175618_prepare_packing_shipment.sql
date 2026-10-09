-- TASK-0007: a packed shipment is prepared from reserved quantity, never assembled through browser inserts.
create function public.prepare_packing_shipment(
  p_company_id uuid,
  p_sales_order_id uuid,
  p_packing_number text,
  p_shipment_number text,
  p_lines jsonb,
  p_expected_sales_order_revision integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment_id uuid;
  v_packing_order_id uuid;
  v_order_status text;
  v_order_revision integer;
  v_line record;
  v_prepared_quantity numeric(18, 6);
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0001'; end if;
  if not (select private.has_company_permission(p_company_id, 'dispatch.manage')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_packing_number is null or char_length(trim(p_packing_number)) = 0
    or p_shipment_number is null or char_length(trim(p_shipment_number)) = 0
    or p_expected_sales_order_revision is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
    or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_PACKING_REQUEST' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_shipment_id from public.command_idempotency
  where company_id = p_company_id and command_name = 'prepare_packing_shipment' and idempotency_key = p_idempotency_key;
  if found then return v_shipment_id; end if;

  select status, revision into v_order_status, v_order_revision from public.sales_orders
  where id = p_sales_order_id and company_id = p_company_id for update;
  if not found then raise exception 'SALES_ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_order_status not in ('open', 'partially_shipped') then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  if v_order_revision <> p_expected_sales_order_revision then raise exception 'REVISION_CONFLICT' using errcode = 'P0001'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as line(reservation_id uuid, quantity numeric)
    left join public.stock_reservations reservation on reservation.id = line.reservation_id and reservation.company_id = p_company_id
    left join public.sales_order_lines sales_line on sales_line.id = reservation.sales_order_line_id and sales_line.company_id = reservation.company_id
    where line.reservation_id is null or line.quantity is null or line.quantity <= 0
      or reservation.id is null or reservation.status <> 'active' or sales_line.sales_order_id <> p_sales_order_id
  ) then raise exception 'INVALID_RESERVATION' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as line(reservation_id uuid, quantity numeric)
    group by line.reservation_id having count(*) > 1
  ) then raise exception 'DUPLICATE_RESERVATION_LINE' using errcode = 'P0001'; end if;

  insert into public.packing_orders (company_id, sales_order_id, packing_number, status)
  values (p_company_id, p_sales_order_id, upper(trim(p_packing_number)), 'packed')
  returning id into v_packing_order_id;
  insert into public.shipments (company_id, packing_order_id, shipment_number)
  values (p_company_id, v_packing_order_id, upper(trim(p_shipment_number))) returning id into v_shipment_id;

  for v_line in
    select line.reservation_id, line.quantity, reservation.lot_id, reservation.quantity as reservation_quantity, reservation.consumed_quantity
    from jsonb_to_recordset(p_lines) as line(reservation_id uuid, quantity numeric)
    join public.stock_reservations reservation on reservation.id = line.reservation_id and reservation.company_id = p_company_id
    where reservation.status = 'active'
    for update of reservation
  loop
    select coalesce(sum(packing_line.quantity), 0::numeric) into v_prepared_quantity
    from public.packing_order_lines packing_line
    join public.packing_orders packing_order on packing_order.id = packing_line.packing_order_id
    where packing_line.company_id = p_company_id and packing_line.reservation_id = v_line.reservation_id
      and packing_order.status in ('draft', 'packed');
    if v_prepared_quantity + v_line.quantity > v_line.reservation_quantity - v_line.consumed_quantity then
      raise exception 'INSUFFICIENT_RESERVED_STOCK' using errcode = 'P0001';
    end if;
    insert into public.packing_order_lines (company_id, packing_order_id, reservation_id, quantity)
    values (p_company_id, v_packing_order_id, v_line.reservation_id, v_line.quantity);
    insert into public.shipment_lines (company_id, shipment_id, reservation_id, lot_id, quantity)
    values (p_company_id, v_shipment_id, v_line.reservation_id, v_line.lot_id, v_line.quantity);
  end loop;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'prepare_packing_shipment', p_idempotency_key, v_shipment_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key, metadata)
  values (p_company_id, (select auth.uid()), 'shipment', v_shipment_id, 'shipment.prepared', p_idempotency_key,
    jsonb_build_object('packing_order_id', v_packing_order_id));
  return v_shipment_id;
end;
$$;

revoke all on function public.prepare_packing_shipment(uuid, uuid, text, text, jsonb, integer, text) from public;
grant execute on function public.prepare_packing_shipment(uuid, uuid, text, text, jsonb, integer, text) to authenticated;
