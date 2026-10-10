-- ADR 0014: search runs as the caller so every source table's RLS policy remains authoritative.
create function public.search_company_records(
  p_company_id uuid,
  p_query text
)
returns table (
  record_type text,
  record_id uuid,
  label text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_query text := lower(trim(p_query));
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_company_id is null or char_length(v_query) < 2 or char_length(v_query) > 100 then
    raise exception 'INVALID_SEARCH_QUERY' using errcode = 'P0001';
  end if;

  return query
  select candidate.record_type, candidate.record_id, candidate.label
  from (
    select 'Customer'::text as record_type, customer.id as record_id, customer.code || ' — ' || customer.name as label
    from public.customers customer where customer.company_id = p_company_id
    union all
    select 'Supplier', supplier.id, supplier.code || ' — ' || supplier.name
    from public.suppliers supplier where supplier.company_id = p_company_id
    union all
    select 'Item', item.id, item.sku || ' — ' || item.description
    from public.items item where item.company_id = p_company_id
    union all
    select 'Drawing', drawing.id, drawing.drawing_number
    from public.drawings drawing where drawing.company_id = p_company_id
    union all
    select 'RFQ', rfq.id, rfq.rfq_number
    from public.rfqs rfq where rfq.company_id = p_company_id
    union all
    select 'Quotation', quotation.id, quotation.quotation_number
    from public.quotations quotation where quotation.company_id = p_company_id
    union all
    select 'Sales order', sales_order.id, sales_order.sales_order_number
    from public.sales_orders sales_order where sales_order.company_id = p_company_id
    union all
    select 'Lot', lot.id, lot.lot_code
    from public.stock_lots lot where lot.company_id = p_company_id
    union all
    select 'Shipment', shipment.id, shipment.shipment_number
    from public.shipments shipment where shipment.company_id = p_company_id
  ) candidate
  where strpos(lower(candidate.label), v_query) > 0
  order by candidate.label
  limit 20;
end;
$$;

revoke all on function public.search_company_records(uuid, text) from public, anon;
grant execute on function public.search_company_records(uuid, text) to authenticated;
