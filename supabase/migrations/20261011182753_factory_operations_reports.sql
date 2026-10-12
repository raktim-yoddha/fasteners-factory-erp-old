-- ADR 0017: deterministic operational reports over authorized source records.
create view public.factory_report_rows with(security_invoker=true) as
 select 'backlog'::text report_kind,l.id::text row_key,l.company_id,o.id record_id,'sales-order'::text record_kind,
 o.sales_order_number label,i.sku,c.name party,o.status,o.created_at occurred_at,o.promised_date due_date,
 l.ordered_quantity-coalesce((select sum(consumed_quantity) from public.stock_reservations where sales_order_line_id=l.id),0) quantity,
 'Unshipped'::text quantity_label,l.uom,
 'Ordered '||l.ordered_quantity::text||' '||l.uom||'; outstanding includes allocated stock and planned work.' details
 from public.sales_order_lines l join public.sales_orders o on o.id=l.sales_order_id
 join public.items i on i.id=l.item_id join public.customers c on c.id=o.customer_id
 where o.status in ('open','partially_shipped') and l.ordered_quantity>coalesce((select sum(consumed_quantity) from public.stock_reservations where sales_order_line_id=l.id),0)
 union all
 select 'shortages',r.work_order_id::text||':'||r.item_id::text,r.company_id,w.id,'work-order',w.number,i.sku,null,w.status,w.created_at,w.due_date,
 greatest(r.required_quantity-r.consumed_quantity-r.wip_quantity-r.available_quantity,0),'Material shortage',r.uom,
 'Required '||r.required_quantity::text||' '||r.uom||'; consumed '||r.consumed_quantity::text||'; WIP '||r.wip_quantity::text||'; released available '||r.available_quantity::text||'; expected receipts '||r.expected_receipts::text||' (not usable stock). Availability is shared across work orders, not allocated supply.'
 from public.production_material_positions r join public.work_orders w on w.id=r.work_order_id join public.items i on i.id=r.item_id
 where w.status<>'closed' and r.required_quantity>r.consumed_quantity+r.wip_quantity+r.available_quantity
 union all
 select 'wip',m.id::text,m.company_id,w.id,'work-order',w.number,i.sku,null,w.status,m.created_at,w.due_date,
 m.remaining_quantity,'Unaccounted WIP',m.uom,'Source lot '||l.lot_code||'; job '||j.sequence::text||' · '||j.name||'. Record actual consumption or unused return.'
 from public.material_issue_positions m join public.work_orders w on w.id=m.work_order_id
 join public.job_cards j on j.id=m.job_card_id join public.stock_lots l on l.id=m.lot_id join public.items i on i.id=m.item_id
 where m.remaining_quantity>0
 union all
 select 'receipts',o.id::text,o.company_id,o.id,'purchase-order',o.purchase_order_number,i.sku,s.name,o.status,o.created_at,o.promised_date,
 p.outstanding_quantity,'Outstanding receipt',o.uom,'Net received '||p.received_quantity::text||' '||o.uom||'. Returned goods reduce net receipts; expected deliveries never count as usable stock.'
 from public.purchase_orders o join public.purchase_order_positions p on p.purchase_order_id=o.id
 join public.items i on i.id=o.item_id join public.suppliers s on s.id=o.supplier_id
 where o.status<>'draft' and p.outstanding_quantity>0
 union all
 select 'ncr',n.id::text,n.company_id,n.id,'ncr','NCR · '||l.lot_code,i.sku,null,n.status,n.created_at,null,
 n.quantity,'Affected quantity',n.uom,n.reason||'; disposition: '||coalesce(n.disposition,'awaiting review')||'. Entire lot remains contained until the quality decision.'
 from public.ncrs n join public.stock_lots l on l.id=n.lot_id join public.items i on i.id=l.item_id where n.status<>'resolved'
 union all
 select 'yield',w.id::text,w.company_id,w.id,'work-order',w.number,i.sku,null,w.status,w.created_at,w.due_date,
 coalesce((select sum(scrap_quantity) from public.job_cards where work_order_id=w.id),0),'Recorded operation scrap',w.uom,
 'Planned '||w.quantity::text||' '||w.uom||'; final operation good '||coalesce(j.good_quantity,0)::text||'; recorded output '||coalesce(p.quantity,0)::text||'; operation scrap is explicit. Incomplete work is pending, not loss.'
 from public.work_orders w join public.items i on i.id=w.item_id
 left join lateral(select good_quantity from public.job_cards where work_order_id=w.id order by sequence desc limit 1) j on true
 left join lateral(select sum(quantity) quantity from public.production_outputs where work_order_id=w.id) p on true
 union all
 select 'vendor',o.id::text,o.company_id,l.id,'lot',o.number,i.sku,s.name,o.status,o.created_at,o.due_date,
 o.at_vendor_quantity,'At vendor',o.uom,'Source lot '||l.lot_code||'; '||o.process||'; returned '||o.returned_quantity::text||' '||o.uom||'; reviewed loss '||o.loss_quantity::text||' '||o.uom
 from public.vendor_order_positions o join public.stock_lots l on l.id=o.source_lot_id join public.items i on i.id=l.item_id join public.suppliers s on s.id=o.supplier_id
 where o.at_vendor_quantity>0
 union all
 select 'movements',e.id::text,e.company_id,l.id,'lot',l.lot_code,i.sku,null,e.movement_type,e.occurred_at,null,
 e.quantity_delta,'Signed movement',e.uom,e.source_type||coalesce(' · '||e.source_id::text,'')||coalesce('; '||e.reason,'')
 from public.stock_ledger_entries e join public.stock_lots l on l.id=e.lot_id join public.items i on i.id=e.item_id;
revoke all on public.factory_report_rows from public,anon;
grant select on public.factory_report_rows to authenticated;

create function public.get_factory_report(p_company_id uuid,p_kind text,p_from date default null,p_to date default null,p_search text default '',p_page integer default 0)
 returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare permission text;result jsonb;
begin
 permission:=case p_kind when 'backlog' then 'sales.read' when 'shortages' then 'production.read' when 'wip' then 'production.read'
  when 'receipts' then 'purchase.read' when 'ncr' then 'quality.read' when 'yield' then 'production.read' when 'vendor' then 'jobwork.read' when 'movements' then 'stock.read' end;
 if permission is null or p_page is null or p_page<0 or p_page>10000 or char_length(coalesce(p_search,''))>100 or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'INVALID_REPORT_FILTER';end if;
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,permission) then raise exception 'FORBIDDEN';end if;
 with filtered as materialized (
  select * from public.factory_report_rows r where r.company_id=p_company_id and r.report_kind=p_kind
   and (p_from is null or r.occurred_at>=p_from::timestamp at time zone 'Asia/Kolkata')
   and (p_to is null or r.occurred_at<(p_to+1)::timestamp at time zone 'Asia/Kolkata')
   and strpos(lower(r.label||' '||r.sku||' '||coalesce(r.party,'')||' '||r.details),lower(trim(coalesce(p_search,''))))>0
 ), page_rows as (
  select * from filtered order by occurred_at desc,row_key limit 50 offset p_page*50
 ) select jsonb_build_object('total',(select count(*) from filtered),'page',p_page,'page_size',50,'as_of',now(),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('key',row_key,'record_id',record_id,'record_kind',record_kind,'label',label,'sku',sku,'party',party,'status',status,'occurred_at',occurred_at,'due_date',due_date,
   'age_days',greatest((now() at time zone 'Asia/Kolkata')::date-(occurred_at at time zone 'Asia/Kolkata')::date,0),
   'overdue',coalesce(due_date<(now() at time zone 'Asia/Kolkata')::date and status<>'closed',false),
   'quantity',quantity::text,'quantity_label',quantity_label,'uom',uom,'details',details) order by occurred_at desc,row_key) from page_rows),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.get_factory_report(uuid,text,date,date,text,integer) from public,anon;
grant execute on function public.get_factory_report(uuid,text,date,date,text,integer) to authenticated;
