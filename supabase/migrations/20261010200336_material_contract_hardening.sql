-- ADR 0016: protect material contracts at every database ingress.
alter table public.items add constraint material_specification_length check (specification is null or char_length(specification)<=2000),
  add constraint material_grade_length check (grade is null or char_length(grade)<=160),
  add constraint material_dimensions_length check (dimensions is null or char_length(dimensions)<=500),
  add constraint material_storage_length check (storage_requirements is null or char_length(storage_requirements)<=2000),
  add constraint material_reorder_finite check (reorder_quantity is null or reorder_quantity <> 'NaN'::numeric);
alter table public.suppliers add constraint qualification_note_length check (qualification_note is null or char_length(qualification_note)<=2000),
  add constraint certificate_requirements_length check (certificate_requirements is null or char_length(certificate_requirements)<=2000);
alter table public.goods_receipts add constraint certificate_reference_length check(certificate_reference is null or char_length(certificate_reference)<=1000);
alter table public.rfq_lines add constraint quantity_finite check (quantity <> 'NaN'::numeric);
alter table public.quotation_lines add constraint quantity_finite check (quantity <> 'NaN'::numeric);
alter table public.quotation_lines add constraint unit_price_finite check (unit_price <> 'NaN'::numeric);
alter table public.sales_order_lines add constraint ordered_quantity_finite check (ordered_quantity <> 'NaN'::numeric);
alter table public.sales_order_lines add constraint unit_price_finite check (unit_price <> 'NaN'::numeric);
alter table public.stock_reservations add constraint quantity_finite check (quantity <> 'NaN'::numeric);
alter table public.stock_ledger_entries add constraint quantity_delta_finite check (quantity_delta <> 'NaN'::numeric);
alter table public.purchase_requisitions add constraint quantity_finite check (quantity <> 'NaN'::numeric);
alter table public.purchase_orders add constraint quantity_finite check (quantity <> 'NaN'::numeric);
alter table public.purchase_orders add constraint unit_price_finite check (unit_price <> 'NaN'::numeric);
alter table public.goods_receipts add constraint quantity_finite check (quantity <> 'NaN'::numeric);
alter table public.goods_returns add constraint quantity_finite check (quantity <> 'NaN'::numeric);
alter table public.stock_count_proposals add constraint counted_quantity_finite check (counted_quantity <> 'NaN'::numeric);

create or replace function private.protect_master_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'items' then
    if new.base_uom <> old.base_uom and (exists (select 1 from public.stock_lots where item_id = old.id) or exists (select 1 from public.quotation_lines where item_id = old.id) or exists (select 1 from public.purchase_requisitions where item_id = old.id)) then raise exception 'UOM_IN_USE'; end if;
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

-- ADR 0014: search runs as the caller so every source table's RLS policy remains authoritative.
create or replace function public.search_company_records(
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
    union all
    select 'Purchase requisition', requisition.id, requisition.requisition_number from public.purchase_requisitions requisition where requisition.company_id=p_company_id
    union all
    select 'Purchase order', purchase_order.id, purchase_order.purchase_order_number from public.purchase_orders purchase_order where purchase_order.company_id=p_company_id
    union all
    select 'Goods receipt', receipt.id, receipt.receipt_number from public.goods_receipts receipt where receipt.company_id=p_company_id
  ) candidate
  where strpos(lower(candidate.label), v_query) > 0
  order by candidate.label
  limit 20;
end;
$$;

revoke all on function public.search_company_records(uuid, text) from public, anon;
grant execute on function public.search_company_records(uuid, text) to authenticated;
