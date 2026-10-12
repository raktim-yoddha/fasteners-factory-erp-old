-- ADR 0017: returned goods keep shipment provenance and require fresh QC.
alter table public.shipment_lines add constraint shipment_lines_id_company_key unique(id,company_id);
create table public.customer_return_receipts (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 shipment_line_id uuid not null,source_lot_id uuid not null,lot_id uuid not null,
 return_number text not null check(return_number ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'),
 quantity numeric(18,6) not null check(quantity>0 and quantity<>'NaN'::numeric),
 uom text not null check(uom in ('pcs','kg','m','set')),
 reference text not null check(char_length(trim(reference)) between 1 and 160),
 reason text not null check(char_length(trim(reason)) between 1 and 2000),
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 unique(id,company_id),unique(company_id,return_number),unique(lot_id),
 foreign key(shipment_line_id,company_id) references public.shipment_lines(id,company_id),
 foreign key(source_lot_id,company_id) references public.stock_lots(id,company_id),
 foreign key(lot_id,company_id) references public.stock_lots(id,company_id)
);
create index customer_returns_line_idx on public.customer_return_receipts(shipment_line_id);
create index customer_returns_company_idx on public.customer_return_receipts(company_id,created_at);
create trigger immutable_customer_returns before update or delete on public.customer_return_receipts
 for each row execute function private.reject_lot_history_change();
insert into public.permission_definitions(code,description) values
 ('customer_returns.read','Read actual shipment quantities and customer return custody.'),
 ('customer_returns.receive','Receive shipped customer goods into separate QC-held lots.') on conflict do nothing;
insert into public.role_permissions(role,permission_code)
 select r::public.app_role,'customer_returns.read' from unnest(array['admin','stores','quality','sales','management','packing_dispatch','auditor']) r on conflict do nothing;
insert into public.role_permissions(role,permission_code) values
 ('admin','customer_returns.receive'),('stores','customer_returns.receive'),
 ('stores','dispatch.read'),('quality','dispatch.read'),('auditor','dispatch.read') on conflict do nothing;
alter table public.customer_return_receipts enable row level security;
revoke all on public.customer_return_receipts from public,anon,authenticated;
grant select on public.customer_return_receipts to authenticated;
create policy permitted_customer_returns on public.customer_return_receipts for select to authenticated
 using((select private.has_company_permission(company_id,'customer_returns.read')));
-- Return reviewers need the source order lines, not RFQs, feasibility or prices in quotations.
create policy customer_return_source_orders on public.sales_orders for select to authenticated
 using((select private.has_company_permission(company_id,'customer_returns.read')));
create policy customer_return_source_lines on public.sales_order_lines for select to authenticated
 using((select private.has_company_permission(company_id,'customer_returns.read')));

create view public.shipment_return_positions with(security_invoker=true) as
 select l.id,l.company_id,l.shipment_id,s.shipment_number,s.revision shipment_revision,s.dispatched_at,
 l.lot_id source_lot_id,t.lot_code source_lot_code,t.item_id,i.sku,i.description,
 sl.sales_order_id,sl.id sales_order_line_id,o.sales_order_number,c.name customer_name,
 l.quantity shipped_quantity,e.uom,coalesce(r.quantity,0) returned_quantity,
 l.quantity-coalesce(r.quantity,0) returnable_quantity
 from public.shipment_lines l join public.shipments s on s.id=l.shipment_id and s.status='dispatched'
 join public.stock_lots t on t.id=l.lot_id join public.items i on i.id=t.item_id
 join public.stock_reservations a on a.id=l.reservation_id join public.sales_order_lines sl on sl.id=a.sales_order_line_id
 join public.sales_orders o on o.id=sl.sales_order_id join public.customers c on c.id=o.customer_id
 join public.stock_ledger_entries e on e.source_type='shipment_line' and e.source_id=l.id and e.movement_type='shipment'
 left join lateral(select sum(quantity) quantity from public.customer_return_receipts where shipment_line_id=l.id) r on true;
revoke all on public.shipment_return_positions from public,anon;
grant select on public.shipment_return_positions to authenticated;

alter table public.lot_genealogy add column customer_return_id uuid,
 add foreign key(customer_return_id,company_id) references public.customer_return_receipts(id,company_id);
alter table public.lot_genealogy drop constraint genealogy_origin;
alter table public.lot_genealogy add constraint genealogy_origin check(
 (customer_return_id is null and vendor_receipt_id is null and transformation_id is null and work_order_id is not null and source_issue_id is not null) or
 (work_order_id is null and source_issue_id is null and num_nonnulls(customer_return_id,vendor_receipt_id,transformation_id)=1
  and quantity is not null and quantity>0 and quantity<>'NaN'::numeric and uom is not null and uom in ('pcs','kg','m','set'))
);
create unique index customer_return_genealogy_idx on public.lot_genealogy(customer_return_id) where customer_return_id is not null;

create function public.receive_customer_return(p_company_id uuid,p_data jsonb,p_idempotency_key text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_line public.shipment_lines%rowtype;v_ship public.shipments%rowtype;
 v_lot public.stock_lots%rowtype;v_qty numeric;v_uom text;v_returned numeric;v_new uuid;
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 v_id:=private.begin_material_command(p_company_id,'customer_returns.receive','customer_return.receive',p_idempotency_key,p_data);
 if v_id is not null then return v_id;end if;
 select s.* into v_ship from public.shipments s join public.shipment_lines l on l.shipment_id=s.id
  where l.id=(p_data->>'shipment_line_id')::uuid and l.company_id=p_company_id for update of s;
 if not found then raise exception 'SHIPMENT_LINE_NOT_FOUND';end if;
 if v_ship.status<>'dispatched' then raise exception 'INVALID_TRANSITION';end if;
 if v_ship.revision is distinct from (p_data->>'shipment_revision')::integer then raise exception 'REVISION_CONFLICT';end if;
 select * into v_line from public.shipment_lines where id=(p_data->>'shipment_line_id')::uuid and company_id=p_company_id;
 select * into v_lot from public.stock_lots where id=v_line.lot_id and company_id=p_company_id;
 select uom into v_uom from public.stock_ledger_entries where source_type='shipment_line' and source_id=v_line.id and movement_type='shipment' and company_id=p_company_id;
 if v_uom is null then raise exception 'SHIPMENT_NOT_POSTED';end if;
 if v_uom is distinct from p_data->>'uom' then raise exception 'UOM_MISMATCH';end if;
 v_qty:=private.factory_quantity(p_data,'quantity');
 select coalesce(sum(quantity),0) into v_returned from public.customer_return_receipts where shipment_line_id=v_line.id;
 if v_qty>v_line.quantity-v_returned then raise exception 'CUSTOMER_RETURN_QUANTITY_EXCEEDED';end if;
 if char_length(trim(coalesce(p_data->>'reason',''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 if char_length(trim(coalesce(p_data->>'reference',''))) not between 1 and 160 then raise exception 'RETURN_REFERENCE_REQUIRED';end if;
 if not exists(select 1 from public.stock_locations where id=(p_data->>'location_id')::uuid and company_id=p_company_id and active) then raise exception 'LOCATION_NOT_FOUND';end if;
 insert into public.stock_lots(company_id,item_id,location_id,lot_code,qc_status)
  values(p_company_id,v_lot.item_id,(p_data->>'location_id')::uuid,upper(trim(p_data->>'lot_code')),'hold') returning id into v_new;
 insert into public.customer_return_receipts(company_id,shipment_line_id,source_lot_id,lot_id,return_number,quantity,uom,reference,reason,created_by)
  values(p_company_id,v_line.id,v_lot.id,v_new,upper(trim(p_data->>'return_number')),v_qty,v_uom,trim(p_data->>'reference'),trim(p_data->>'reason'),(select auth.uid())) returning id into v_id;
 insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by,reason)
  values(p_company_id,v_new,v_lot.item_id,(p_data->>'location_id')::uuid,'receipt',v_qty,v_uom,'customer_return',v_id,p_idempotency_key,(select auth.uid()),trim(p_data->>'reason'));
 insert into public.lot_genealogy(company_id,parent_lot_id,child_lot_id,customer_return_id,quantity,uom)
  values(p_company_id,v_lot.id,v_new,v_id,v_qty,v_uom);
 return private.finish_material_command(p_company_id,'customer_return.receive',p_idempotency_key,p_data,v_id,'customer_return',p_data->>'reason');
end $$;
revoke all on function public.receive_customer_return(uuid,jsonb,text) from public,anon;
grant execute on function public.receive_customer_return(uuid,jsonb,text) to authenticated;

create function public.get_customer_return_workspace(p_company_id uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'shipments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'shipment_number',shipment_number,'shipment_revision',shipment_revision,'sales_order_number',sales_order_number,'customer_name',customer_name,'item_id',item_id,'sku',sku,'source_lot_id',source_lot_id,'source_lot_code',source_lot_code,'shipped_quantity',shipped_quantity::text,'returned_quantity',returned_quantity::text,'returnable_quantity',returnable_quantity::text,'uom',uom) order by dispatched_at desc,id) from public.shipment_return_positions where company_id=p_company_id),'[]'::jsonb),
  'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'shipment_line_id',r.shipment_line_id,'lot_id',r.lot_id,'lot_code',l.lot_code,'return_number',r.return_number,'quantity',r.quantity::text,'uom',r.uom,'reference',r.reference,'reason',r.reason,'qc_status',l.qc_status,'created_at',r.created_at) order by r.created_at desc,r.id) from public.customer_return_receipts r join public.stock_lots l on l.id=r.lot_id where r.company_id=p_company_id),'[]'::jsonb)
 );$$;
revoke all on function public.get_customer_return_workspace(uuid) from public,anon;
grant execute on function public.get_customer_return_workspace(uuid) to authenticated;

-- Customer returns start a fresh quality context; old order demand and closed work stay historical.
create or replace view public.lot_trace_context with (security_invoker=true) as
 with recursive lineage as (
  select id lot_id,company_id,id ancestor_id,array[id] path from public.stock_lots
  union all
  select l.lot_id,l.company_id,g.parent_lot_id,l.path||g.parent_lot_id
  from lineage l join public.lot_genealogy g on g.child_lot_id=l.ancestor_id and g.company_id=l.company_id
  where (g.transformation_id is not null or g.vendor_receipt_id is not null) and not g.parent_lot_id=any(l.path)
 ), roots as (
  select distinct l.lot_id,l.company_id,l.ancestor_id
  from lineage l where not exists(select 1 from public.lot_genealogy g where g.child_lot_id=l.ancestor_id and (g.transformation_id is not null or g.vendor_receipt_id is not null))
 ), grouped as (
  select r.company_id,r.lot_id,
   bool_or(p.id is not null or cr.id is not null) requires_final,
   array_agg(distinct w.id) filter(where w.id is not null) work_order_ids,
   jsonb_agg(distinct jsonb_build_object('kind',case when p.id is not null or cr.id is not null then 'final' else 'incoming' end,
    'bom',w.bom_revision_id,'routing',w.routing_revision_id,'drawing',w.drawing_revision_id,'sales_line',w.sales_order_line_id)) signatures
  from roots r left join public.production_outputs p on p.lot_id=r.ancestor_id
  left join public.customer_return_receipts cr on cr.lot_id=r.ancestor_id
  left join public.work_orders w on w.id=p.work_order_id group by r.company_id,r.lot_id
 ) select company_id,lot_id,requires_final,coalesce(work_order_ids,array[]::uuid[]) work_order_ids,signatures,
  case when jsonb_array_length(signatures)=1 then (signatures->0->>'sales_line')::uuid end sales_order_line_id,
  case when jsonb_array_length(signatures)=1 then (signatures->0->>'drawing')::uuid end drawing_revision_id
 from grouped;
grant select on public.lot_trace_context to authenticated;


create or replace function private.guard_factory_receipt() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.source_type='finished_goods_receipt' then
  if exists(select 1 from public.customer_return_receipts where lot_id=new.lot_id) or exists(select 1 from public.goods_receipts where lot_id=new.lot_id) or exists(select 1 from public.production_outputs where lot_id=new.lot_id) or exists(select 1 from public.lot_transformations where output_lot_id=new.lot_id) or exists(select 1 from public.vendor_custody_events where output_lot_id=new.lot_id) then raise exception 'MANAGED_LOT_RECEIPT'; end if;
  if exists(select 1 from public.stock_ledger_entries where lot_id=new.lot_id) then
   update public.stock_lots set revision=revision+1 where id=new.lot_id;
  end if;
 end if; return new;
end $$;

create or replace function public.get_quality_workspace(p_company_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'contexts',coalesce((select jsonb_agg(jsonb_build_object('lot_id',lot_id,'requires_final',requires_final,'sales_order_line_id',sales_order_line_id)) from public.lot_trace_context where company_id=p_company_id),'[]'::jsonb),
 'plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'item_id',item_id,'label',label,'version',version,'sample_size',sample_size,'characteristics',characteristics,'status',status) order by label,version) from public.inspection_plans where company_id=p_company_id),'[]'::jsonb),
 'inspections',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'lot_id',lot_id,'job_card_id',job_card_id,'kind',kind,'result',result,'lot_revision',lot_revision,'reason',reason,'inspector_id',inspector_id,'created_at',created_at,'readings',readings,'supersedes_id',supersedes_id) order by recorded_sequence desc) from public.inspections where company_id=p_company_id),'[]'::jsonb),
 'ncrs',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'lot_id',n.lot_id,'inspection_id',n.inspection_id,'quantity',n.quantity::text,'uom',n.uom,'reason',n.reason,'status',n.status,'disposition',n.disposition,'revision',n.revision,'review_reason',n.review_reason,
  'rework_work_order_id',(select id from public.work_orders where source_ncr_id=n.id limit 1)) order by n.created_at desc) from public.ncrs n where n.company_id=p_company_id),'[]'::jsonb),
 'genealogy',coalesce((select jsonb_agg(jsonb_build_object('id',id,'parent_lot_id',parent_lot_id,'child_lot_id',child_lot_id,'work_order_id',work_order_id,'source_issue_id',source_issue_id,'vendor_receipt_id',vendor_receipt_id,'customer_return_id',customer_return_id,'transformation_id',transformation_id,'quantity',quantity::text,'uom',uom)) from public.lot_genealogy where company_id=p_company_id),'[]'::jsonb),
 'receipts',coalesce((select jsonb_agg(jsonb_build_object('lot_id',r.lot_id,'supplier_lot',r.supplier_lot,'certificate_reference',r.certificate_reference,'supplier_name',s.name)) from public.goods_receipts r join public.purchase_orders o on o.id=r.purchase_order_id join public.suppliers s on s.id=o.supplier_id where r.company_id=p_company_id),'[]'::jsonb),
 'processReceipts',coalesce((select jsonb_agg(jsonb_build_object('lot_id',e.output_lot_id,'vendor_order_number',o.number,'supplier_name',v.name,'process',o.process,'reference',e.reference,'certificate_reference',e.certificate_reference)) from public.vendor_custody_events e join public.vendor_orders o on o.id=e.vendor_order_id join public.suppliers v on v.id=o.supplier_id where e.company_id=p_company_id and e.kind='return'),'[]'::jsonb),
 'customerReceipts',coalesce((select jsonb_agg(jsonb_build_object('lot_id',r.lot_id,'return_number',r.return_number,'shipment_number',s.shipment_number,'reference',r.reference,'reason',r.reason,'quantity',r.quantity::text,'uom',r.uom)) from public.customer_return_receipts r join public.shipment_lines l on l.id=r.shipment_line_id join public.shipments s on s.id=l.shipment_id where r.company_id=p_company_id),'[]'::jsonb),
 'shipments',coalesce((select jsonb_agg(jsonb_build_object('lot_id',l.lot_id,'shipment_id',s.id,'shipment_number',s.shipment_number,'status',s.status,'quantity',l.quantity::text,'uom',i.base_uom)) from public.shipment_lines l join public.shipments s on s.id=l.shipment_id join public.stock_lots lot on lot.id=l.lot_id join public.items i on i.id=lot.item_id where l.company_id=p_company_id),'[]'::jsonb)
);
$$;
