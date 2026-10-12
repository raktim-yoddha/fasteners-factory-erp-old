-- Preserve existing record relationships while paging the final deduplicated set.
-- SECURITY INVOKER keeps permissions on every parent, intermediate and related table.
create function public.get_record_links_page(p_company_id uuid,p_kind text,p_record_id uuid,p_after_kind text default null,p_after_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_table text;v_query text;v_exists boolean;v_page jsonb;
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if (p_after_kind is null)<>(p_after_id is null) then raise exception 'INVALID_CURSOR';end if;
 v_table:=case p_kind when 'customer' then 'customers' when 'supplier' then 'suppliers' when 'item' then 'items' when 'drawing' then 'drawings' when 'rfq' then 'rfqs' when 'quotation' then 'quotations' when 'sales-order' then 'sales_orders' when 'lot' then 'stock_lots' when 'shipment' then 'shipments' when 'purchase-requisition' then 'purchase_requisitions' when 'purchase-order' then 'purchase_orders' when 'goods-receipt' then 'goods_receipts' when 'work-order' then 'work_orders' when 'job-card' then 'job_cards' when 'inspection' then 'inspections' when 'ncr' then 'ncrs' end;
 if v_table is null then raise exception 'INVALID_RECORD_KIND';end if;
 execute format('select exists(select 1 from public.%I where company_id=$1 and id=$2)',v_table) into v_exists using p_company_id,p_record_id;
 if not v_exists then return jsonb_build_object('rows','[]'::jsonb,'has_more',false);end if;
 v_query:=case p_kind
 when 'customer' then $q$select 'sales-order'::text kind,s.id,s.sales_order_number||' · '||s.status||' · Promise '||coalesce(s.promised_date::text,'not set') label from public.sales_orders s where s.company_id=$1 and s.customer_id=$2$q$
 when 'supplier' then $q$select 'purchase-order'::text kind,p.id,p.purchase_order_number||' · '||p.status||' · Promise '||p.promised_date::text label from public.purchase_orders p where p.company_id=$1 and p.supplier_id=$2$q$
 when 'item' then $q$
  select 'work-order'::text kind,w.id,w.number||' · '||w.status label from public.work_orders w where w.company_id=$1 and w.item_id=$2
  union all select 'lot',l.id,l.lot_code from public.stock_lots l where l.company_id=$1 and l.item_id=$2$q$
 when 'drawing' then $q$select 'item'::text kind,i.id,i.sku||' — '||i.description label from public.drawings d join public.items i on i.id=d.item_id and i.company_id=d.company_id where d.company_id=$1 and d.id=$2$q$
 when 'rfq' then $q$select 'quotation'::text kind,q.id,q.quotation_number label from public.quotations q where q.company_id=$1 and q.rfq_id=$2$q$
 when 'quotation' then $q$
  select 'rfq'::text kind,r.id,r.rfq_number label from public.quotations q join public.rfqs r on r.id=q.rfq_id and r.company_id=q.company_id where q.company_id=$1 and q.id=$2
  union all select 'sales-order',s.id,s.sales_order_number from public.sales_orders s where s.company_id=$1 and s.quotation_id=$2$q$
 when 'sales-order' then $q$
  select 'quotation'::text kind,q.id,q.quotation_number label from public.sales_orders s join public.quotations q on q.id=s.quotation_id and q.company_id=s.company_id where s.company_id=$1 and s.id=$2
  union all select 'packing-order',p.id,p.packing_number from public.packing_orders p where p.company_id=$1 and p.sales_order_id=$2
  union all select 'work-order',w.id,w.number||' · '||w.status from public.work_orders w join public.sales_order_lines l on l.id=w.sales_order_line_id and l.company_id=w.company_id where w.company_id=$1 and l.sales_order_id=$2$q$
 when 'shipment' then $q$
  select 'packing-order'::text kind,p.id,p.packing_number label from public.shipments s join public.packing_orders p on p.id=s.packing_order_id and p.company_id=s.company_id where s.company_id=$1 and s.id=$2
  union all select 'sales-order',o.id,o.sales_order_number from public.shipments s join public.packing_orders p on p.id=s.packing_order_id and p.company_id=s.company_id join public.sales_orders o on o.id=p.sales_order_id and o.company_id=p.company_id where s.company_id=$1 and s.id=$2$q$
 when 'purchase-requisition' then $q$select 'purchase-order'::text kind,p.id,p.purchase_order_number label from public.purchase_orders p where p.company_id=$1 and p.requisition_id=$2$q$
 when 'purchase-order' then $q$
  select 'supplier'::text kind,s.id,s.code||' — '||s.name label from public.purchase_orders p join public.suppliers s on s.id=p.supplier_id and s.company_id=p.company_id where p.company_id=$1 and p.id=$2
  union all select 'goods-receipt',g.id,g.receipt_number from public.goods_receipts g where g.company_id=$1 and g.purchase_order_id=$2$q$
 when 'goods-receipt' then $q$
  select 'purchase-order'::text kind,p.id,p.purchase_order_number label from public.goods_receipts g join public.purchase_orders p on p.id=g.purchase_order_id and p.company_id=g.company_id where g.company_id=$1 and g.id=$2
  union all select 'lot',l.id,l.lot_code from public.goods_receipts g join public.stock_lots l on l.id=g.lot_id and l.company_id=g.company_id where g.company_id=$1 and g.id=$2$q$
 when 'work-order' then $q$
  select 'item'::text kind,i.id,i.sku||' — '||i.description label from public.work_orders w join public.items i on i.id=w.item_id and i.company_id=w.company_id where w.company_id=$1 and w.id=$2
  union all select 'sales-order',s.id,s.sales_order_number from public.work_orders w join public.sales_order_lines l on l.id=w.sales_order_line_id and l.company_id=w.company_id join public.sales_orders s on s.id=l.sales_order_id and s.company_id=l.company_id where w.company_id=$1 and w.id=$2
  union all select 'job-card',j.id,j.sequence::text||'. '||j.name||' · '||j.status from public.job_cards j where j.company_id=$1 and j.work_order_id=$2
  union all select 'work-order',p.id,p.number||' · '||p.status from public.work_orders w join public.work_orders p on (p.id=w.parent_work_order_id or p.parent_work_order_id=w.id) and p.company_id=w.company_id where w.company_id=$1 and w.id=$2
  union all select 'ncr',n.id,'NCR '||n.id::text||' · '||n.status from public.work_orders w join public.ncrs n on n.id=w.source_ncr_id and n.company_id=w.company_id where w.company_id=$1 and w.id=$2
  union all select 'lot',l.id,l.lot_code from public.production_outputs o join public.stock_lots l on l.id=o.lot_id and l.company_id=o.company_id where o.company_id=$1 and o.work_order_id=$2
  union all select 'lot',l.id,l.lot_code from public.material_issues m join public.stock_lots l on l.id=m.lot_id and l.company_id=m.company_id where m.company_id=$1 and m.work_order_id=$2$q$
 when 'job-card' then $q$
  select 'work-order'::text kind,w.id,w.number||' · '||w.status label from public.job_cards j join public.work_orders w on w.id=j.work_order_id and w.company_id=j.company_id where j.company_id=$1 and j.id=$2
  union all select 'inspection',i.id,i.kind||' inspection · '||i.result||' · '||i.created_at::text from public.inspections i where i.company_id=$1 and i.job_card_id=$2
  union all select 'lot',l.id,l.lot_code from public.material_issues m join public.stock_lots l on l.id=m.lot_id and l.company_id=m.company_id where m.company_id=$1 and m.job_card_id=$2$q$
 when 'inspection' then $q$
  select 'lot'::text kind,l.id,l.lot_code label from public.inspections i join public.stock_lots l on l.id=i.lot_id and l.company_id=i.company_id where i.company_id=$1 and i.id=$2
  union all select 'job-card',j.id,j.sequence::text||'. '||j.name||' · '||j.status from public.inspections i join public.job_cards j on j.id=i.job_card_id and j.company_id=i.company_id where i.company_id=$1 and i.id=$2
  union all select 'inspection',p.id,p.kind||' inspection · '||p.result||' · '||p.created_at::text from public.inspections i join public.inspections p on p.id=i.supersedes_id and p.company_id=i.company_id where i.company_id=$1 and i.id=$2
  union all select 'ncr',n.id,'NCR '||n.id::text||' · '||n.status from public.ncrs n where n.company_id=$1 and n.inspection_id=$2$q$
 when 'ncr' then $q$
  select 'lot'::text kind,l.id,l.lot_code label from public.ncrs n join public.stock_lots l on l.id=n.lot_id and l.company_id=n.company_id where n.company_id=$1 and n.id=$2
  union all select 'inspection',i.id,i.kind||' inspection · '||i.result||' · '||i.created_at::text from public.ncrs n join public.inspections i on i.id=n.inspection_id and i.company_id=n.company_id where n.company_id=$1 and n.id=$2
  union all select 'work-order',w.id,w.number||' · '||w.status from public.work_orders w where w.company_id=$1 and w.source_ncr_id=$2$q$
 when 'lot' then $q$
  select 'item'::text kind,i.id,i.sku||' — '||i.description label from public.stock_lots l join public.items i on i.id=l.item_id and i.company_id=l.company_id where l.company_id=$1 and l.id=$2
  union all select 'goods-receipt',g.id,g.receipt_number from public.goods_receipts g where g.company_id=$1 and g.lot_id=$2
  union all select 'inspection',i.id,i.kind||' inspection · '||i.result||' · '||i.created_at::text from public.inspections i where i.company_id=$1 and i.lot_id=$2
  union all select 'ncr',n.id,'NCR '||n.id::text||' · '||n.status from public.ncrs n where n.company_id=$1 and n.lot_id=$2
  union all select 'work-order',w.id,w.number||' · '||w.status from public.production_outputs o join public.work_orders w on w.id=o.work_order_id and w.company_id=o.company_id where o.company_id=$1 and o.lot_id=$2
  union all select 'work-order',w.id,w.number||' · '||w.status from public.material_issues m join public.work_orders w on w.id=m.work_order_id and w.company_id=m.company_id where m.company_id=$1 and m.lot_id=$2
  union all select 'job-card',j.id,j.sequence::text||'. '||j.name||' · '||j.status from public.material_issues m join public.job_cards j on j.id=m.job_card_id and j.company_id=m.company_id where m.company_id=$1 and m.lot_id=$2
  union all select 'lot',l.id,l.lot_code from public.lot_genealogy g join public.stock_lots l on (l.id=g.parent_lot_id and g.child_lot_id=$2 or l.id=g.child_lot_id and g.parent_lot_id=$2) and l.company_id=g.company_id where g.company_id=$1
  union all select 'shipment',s.id,s.shipment_number from public.shipment_lines l join public.shipments s on s.id=l.shipment_id and s.company_id=l.company_id where l.company_id=$1 and l.lot_id=$2$q$
 end;
 execute 'with candidates as ('||v_query||'), deduplicated as (select distinct kind,id,label from candidates), page as (select * from deduplicated where $3::text is null or (kind,id)>($3,$4) order by kind,id limit 21) select jsonb_build_object(''rows'',coalesce((select jsonb_agg(to_jsonb(r) order by kind,id) from (select * from page order by kind,id limit 20) r),''[]''::jsonb),''has_more'',(select count(*)>20 from page))'
 into v_page using p_company_id,p_record_id,p_after_kind,p_after_id;
 return v_page;
end $$;
revoke all on function public.get_record_links_page(uuid,text,uuid,text,uuid) from public,anon;
grant execute on function public.get_record_links_page(uuid,text,uuid,text,uuid) to authenticated;
