-- TASK-0008: the command centre reads per-order states without granting table writes.
create function public.get_order_command_center(p_company_id uuid)
returns table (
  sales_order_id uuid,
  sales_order_number text,
  customer_po_number text,
  sales_order_status text,
  promised_date date,
  active_reservation_count integer,
  prepared_shipment_count integer,
  dispatched_shipment_count integer,
  stock_status text,
  packing_dispatch_status text,
  next_action text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_company_id is null or not (select private.has_company_permission(p_company_id, 'sales.read')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  return query
  with reservation_counts as (
    select line.sales_order_id, count(reservation.id) filter (where reservation.status = 'active')::integer as active_reservation_count
    from public.sales_order_lines line
    left join public.stock_reservations reservation
      on reservation.company_id = p_company_id and reservation.sales_order_line_id = line.id
    where line.company_id = p_company_id
    group by line.sales_order_id
  ), shipment_counts as (
    select packing.sales_order_id,
      count(shipment.id) filter (where shipment.status = 'draft')::integer as prepared_shipment_count,
      count(shipment.id) filter (where shipment.status = 'dispatched')::integer as dispatched_shipment_count
    from public.packing_orders packing
    left join public.shipments shipment on shipment.company_id = p_company_id and shipment.packing_order_id = packing.id
    where packing.company_id = p_company_id
    group by packing.sales_order_id
  )
  select
    sales_order.id,
    sales_order.sales_order_number,
    sales_order.customer_po_number,
    sales_order.status,
    sales_order.promised_date,
    coalesce(reservation.active_reservation_count, 0),
    coalesce(shipment.prepared_shipment_count, 0),
    coalesce(shipment.dispatched_shipment_count, 0),
    case
      when sales_order.status in ('fulfilled', 'cancelled') then sales_order.status
      when coalesce(reservation.active_reservation_count, 0) > 0 then 'reserved'
      when coalesce(shipment.dispatched_shipment_count, 0) > 0 then 'consumed by dispatch'
      else 'awaiting reservation'
    end,
    case
      when sales_order.status = 'fulfilled' then 'fulfilled'
      when sales_order.status = 'cancelled' then 'cancelled'
      when coalesce(shipment.prepared_shipment_count, 0) > 0 then 'prepared for gate-out'
      when coalesce(shipment.dispatched_shipment_count, 0) > 0 then 'partially dispatched'
      else 'not prepared'
    end,
    case
      when sales_order.status = 'fulfilled' then 'No action — fulfilled'
      when sales_order.status = 'cancelled' then 'No action — cancelled'
      when coalesce(shipment.prepared_shipment_count, 0) > 0 then 'Gate out prepared shipment'
      when coalesce(reservation.active_reservation_count, 0) > 0 then 'Prepare packing shipment'
      else 'Reserve released finished goods'
    end
  from public.sales_orders sales_order
  left join reservation_counts reservation on reservation.sales_order_id = sales_order.id
  left join shipment_counts shipment on shipment.sales_order_id = sales_order.id
  where sales_order.company_id = p_company_id
  order by sales_order.created_at desc;
end;
$$;

revoke all on function public.get_order_command_center(uuid) from public, anon;
grant execute on function public.get_order_command_center(uuid) to authenticated;
