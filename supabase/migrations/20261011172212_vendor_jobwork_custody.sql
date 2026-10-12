-- Same-item vendor processing custody; no conversion, tax document or implicit job completion.
create table public.vendor_orders (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 number text not null check(number~'^[A-Z0-9][A-Z0-9/-]{2,63}$'), supplier_id uuid not null,
 source_lot_id uuid not null, quantity numeric(18,6) not null check(quantity>0 and quantity<>'NaN'::numeric),
 uom text not null check(uom in ('pcs','kg','m','set')), process text not null check(char_length(trim(process)) between 1 and 160),
 due_date date not null, status text not null default 'draft' check(status in ('draft','open','closed','cancelled')),
 revision integer not null default 1 check(revision>0), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), closed_at timestamptz, close_reason text,
 unique(id,company_id),unique(company_id,number),
 foreign key(supplier_id,company_id) references public.suppliers(id,company_id),
 foreign key(source_lot_id,company_id) references public.stock_lots(id,company_id),
 check((status in ('closed','cancelled'))=(closed_at is not null)),
 check(close_reason is null or char_length(trim(close_reason)) between 1 and 2000)
);
create table public.vendor_custody_events (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,vendor_order_id uuid not null,
 kind text not null check(kind in ('send','return','loss')),
 quantity_delta numeric(18,6) not null check(quantity_delta<>0 and quantity_delta<>'NaN'::numeric),
 uom text not null check(uom in ('pcs','kg','m','set')),output_lot_id uuid,
 reference text not null check(char_length(trim(reference)) between 1 and 160),
 certificate_reference text check(certificate_reference is null or char_length(certificate_reference)<=1000),
 reason text not null check(char_length(trim(reason)) between 1 and 2000),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(id,company_id),unique(output_lot_id),
 foreign key(vendor_order_id,company_id) references public.vendor_orders(id,company_id),
 foreign key(output_lot_id,company_id) references public.stock_lots(id,company_id),
 check((kind='send')=(quantity_delta>0)),check((kind='return')=(output_lot_id is not null))
);
create index vendor_orders_company_source_idx on public.vendor_orders(company_id,source_lot_id);
create index vendor_orders_supplier_idx on public.vendor_orders(supplier_id);
create index vendor_custody_order_idx on public.vendor_custody_events(vendor_order_id);
create index vendor_custody_company_idx on public.vendor_custody_events(company_id);
create trigger immutable_vendor_custody before update or delete on public.vendor_custody_events
 for each row execute function private.reject_lot_history_change();
insert into public.permission_definitions(code,description) values
 ('jobwork.read','Read vendor orders and derived custody.'),('jobwork.manage','Create, send, receive and reconcile vendor processing orders.'),
 ('jobwork.review','Record explicitly reviewed vendor loss.') on conflict do nothing;
insert into public.role_permissions(role,permission_code)
 select r::public.app_role,'jobwork.read' from unnest(array['admin','stores','planning','quality','management','auditor','packing_dispatch']) r on conflict do nothing;
insert into public.role_permissions(role,permission_code) values
 ('admin','jobwork.manage'),('stores','jobwork.manage'),('planning','jobwork.manage'),('admin','jobwork.review'),('quality','jobwork.review') on conflict do nothing;
do $$ declare t text;begin
 foreach t in array array['vendor_orders','vendor_custody_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy permitted_vendor_records on public.%I for select to authenticated using ((select private.has_company_permission(company_id,''jobwork.read'')))',t);
 end loop;
end $$;
create view public.vendor_order_positions with(security_invoker=true) as
 select o.*,coalesce(e.sent,0) sent_quantity,coalesce(e.returned,0) returned_quantity,coalesce(e.loss,0) loss_quantity,
 coalesce(e.balance,0) at_vendor_quantity,
 case when o.status in ('closed','cancelled') then 0 else o.quantity-coalesce(e.sent,0) end remaining_to_send,
 case when o.status in ('closed','cancelled') then o.quantity-coalesce(e.sent,0) else 0 end cancelled_unsent_quantity
 from public.vendor_orders o left join lateral (
  select sum(quantity_delta) balance,sum(quantity_delta) filter(where kind='send') sent,
  -sum(quantity_delta) filter(where kind='return') returned,-sum(quantity_delta) filter(where kind='loss') loss
  from public.vendor_custody_events where vendor_order_id=o.id
 ) e on true;
revoke all on public.vendor_order_positions from public,anon;grant select on public.vendor_order_positions to authenticated;
alter table public.lot_genealogy add column vendor_receipt_id uuid,
 add foreign key(vendor_receipt_id,company_id) references public.vendor_custody_events(id,company_id);
alter table public.lot_genealogy drop constraint genealogy_origin;
alter table public.lot_genealogy add constraint genealogy_origin check(
 (vendor_receipt_id is null and transformation_id is null and work_order_id is not null and source_issue_id is not null) or
 (work_order_id is null and source_issue_id is null and ((transformation_id is not null and vendor_receipt_id is null) or (vendor_receipt_id is not null and transformation_id is null))
  and quantity is not null and quantity>0 and quantity<>'NaN'::numeric and uom is not null and uom in ('pcs','kg','m','set'))
);
create unique index vendor_receipt_genealogy_idx on public.lot_genealogy(vendor_receipt_id) where vendor_receipt_id is not null;

create function public.vendor_jobwork_command(p_company_id uuid,p_action text,p_data jsonb,p_idempotency_key text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_permission text;v_request jsonb:=jsonb_build_array(p_action,p_data);
 v_order public.vendor_orders%rowtype;v_lot public.stock_lots%rowtype;v_new uuid;v_qty numeric;v_available numeric;
 v_position public.vendor_order_positions%rowtype;v_item public.items%rowtype;v_ref text;v_reason text;
begin
 v_permission:=case when p_action='send' then 'stock.issue' when p_action='receive' then 'stock.receive' when p_action='loss' then 'jobwork.review' when p_action in ('create','send','receive','close','cancel') then 'jobwork.manage' end;
 if v_permission is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 if p_action in ('send','receive') and not private.has_company_permission(p_company_id,'jobwork.manage') then raise exception 'FORBIDDEN';end if;
 v_id:=private.begin_material_command(p_company_id,v_permission,'jobwork.'||p_action,p_idempotency_key,v_request);
 if v_id is not null then return v_id;end if;
 if p_action='create' then
  select * into v_lot from public.stock_lots where id=(p_data->>'lot_id')::uuid and company_id=p_company_id;
  if not found then raise exception 'LOT_NOT_FOUND';end if;
  select * into v_item from public.items where id=v_lot.item_id and company_id=p_company_id and active;
  if not found or v_item.base_uom is distinct from p_data->>'uom' then raise exception 'UOM_MISMATCH';end if;
  if not exists(select 1 from public.suppliers where id=(p_data->>'supplier_id')::uuid and company_id=p_company_id and active) then raise exception 'SUPPLIER_NOT_FOUND';end if;
  v_qty:=private.factory_quantity(p_data,'quantity');
  insert into public.vendor_orders(company_id,number,supplier_id,source_lot_id,quantity,uom,process,due_date,created_by)
   values(p_company_id,upper(trim(p_data->>'number')),(p_data->>'supplier_id')::uuid,v_lot.id,v_qty,v_item.base_uom,trim(p_data->>'process'),(p_data->>'due_date')::date,(select auth.uid())) returning id into v_id;
 else
  -- Lock owning production work before custody and lots, matching production/QC lock ordering.
  select * into v_order from public.vendor_orders where id=(p_data->>'order_id')::uuid and company_id=p_company_id;
  if not found then raise exception 'VENDOR_ORDER_NOT_FOUND';end if;
  perform 1 from public.work_orders w where w.id in(select unnest(work_order_ids) from public.lot_trace_context where lot_id=v_order.source_lot_id) order by w.id for no key update;
  select * into v_order from public.vendor_orders where id=v_order.id and company_id=p_company_id for update;
  if v_order.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT';end if;
  if v_order.status in ('closed','cancelled') then raise exception 'INVALID_TRANSITION';end if;
  select * into v_position from public.vendor_order_positions where id=v_order.id;
  v_reason:=trim(coalesce(p_data->>'reason',''));
  if char_length(v_reason) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
  if p_action in ('send','receive','loss') then
   v_qty:=private.factory_quantity(p_data,'quantity');
   if v_order.uom is distinct from p_data->>'uom' then raise exception 'UOM_MISMATCH';end if;
   v_ref:=trim(coalesce(p_data->>'reference',''));
   if char_length(v_ref) not between 1 and 160 then raise exception 'VENDOR_REFERENCE_REQUIRED';end if;
  end if;
  if p_action='send' then
   if not exists(select 1 from public.suppliers where id=v_order.supplier_id and company_id=p_company_id and active) then raise exception 'SUPPLIER_NOT_FOUND';end if;
   if not exists(select 1 from public.items where id=(select item_id from public.stock_lots where id=v_order.source_lot_id) and active) then raise exception 'ITEM_NOT_FOUND';end if;
   if v_qty>v_position.remaining_to_send then raise exception 'VENDOR_ORDER_QUANTITY_EXCEEDED';end if;
   select * into v_lot from public.stock_lots where id=v_order.source_lot_id and company_id=p_company_id for update;
   if v_lot.revision is distinct from (p_data->>'lot_revision')::integer then raise exception 'REVISION_CONFLICT';end if;
   if v_lot.qc_status<>'released' then raise exception 'LOT_QC_HOLD';end if;
   if exists(select 1 from public.ncrs where lot_id=v_lot.id and status<>'resolved') then raise exception 'NCR_OPEN';end if;
   select on_hand-reserved into v_available from public.stock_positions where lot_id=v_lot.id;
   if v_qty>v_available then raise exception 'INSUFFICIENT_AVAILABLE_STOCK';end if;
   insert into public.vendor_custody_events(company_id,vendor_order_id,kind,quantity_delta,uom,reference,reason,created_by)
    values(p_company_id,v_order.id,'send',v_qty,v_order.uom,v_ref,v_reason,(select auth.uid())) returning id into v_id;
   insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by,reason)
    values(p_company_id,v_lot.id,v_lot.item_id,v_lot.location_id,'issue',-v_qty,v_order.uom,'vendor_send',v_id,v_id::text,(select auth.uid()),v_reason);
   update public.stock_lots set revision=revision+1,updated_at=now() where id=v_lot.id;
  elsif p_action='receive' then
   if v_qty>v_position.at_vendor_quantity then raise exception 'INSUFFICIENT_VENDOR_CUSTODY';end if;
   if not exists(select 1 from public.stock_locations where id=(p_data->>'location_id')::uuid and company_id=p_company_id) then raise exception 'LOCATION_NOT_FOUND';end if;
   select * into v_lot from public.stock_lots where id=v_order.source_lot_id;
   insert into public.stock_lots(company_id,item_id,location_id,lot_code,qc_status)
    values(p_company_id,v_lot.item_id,(p_data->>'location_id')::uuid,upper(trim(p_data->>'lot_code')),'hold') returning id into v_new;
   insert into public.vendor_custody_events(company_id,vendor_order_id,kind,quantity_delta,uom,output_lot_id,reference,certificate_reference,reason,created_by)
    values(p_company_id,v_order.id,'return',-v_qty,v_order.uom,v_new,v_ref,nullif(trim(p_data->>'certificate_reference'),''),v_reason,(select auth.uid())) returning id into v_id;
   insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by,reason)
    values(p_company_id,v_new,v_lot.item_id,(p_data->>'location_id')::uuid,'receipt',v_qty,v_order.uom,'vendor_return',v_id,v_id::text,(select auth.uid()),v_reason);
   insert into public.lot_genealogy(company_id,parent_lot_id,child_lot_id,vendor_receipt_id,quantity,uom)
    values(p_company_id,v_lot.id,v_new,v_id,v_qty,v_order.uom);
  elsif p_action='loss' then
   if v_qty>v_position.at_vendor_quantity then raise exception 'INSUFFICIENT_VENDOR_CUSTODY';end if;
   insert into public.vendor_custody_events(company_id,vendor_order_id,kind,quantity_delta,uom,reference,reason,created_by)
    values(p_company_id,v_order.id,'loss',-v_qty,v_order.uom,v_ref,v_reason,(select auth.uid())) returning id into v_id;
  elsif p_action='close' then
   if v_position.at_vendor_quantity<>0 then raise exception 'VENDOR_CUSTODY_PENDING';end if;
   if v_position.sent_quantity=0 then raise exception 'INVALID_TRANSITION';end if;
   if v_position.remaining_to_send>0 and (p_data->>'cancel_unsent') is distinct from 'true' then raise exception 'VENDOR_UNSENT_BALANCE';end if;
   update public.vendor_orders set status='closed',closed_at=now(),close_reason=v_reason where id=v_order.id;v_id:=v_order.id;
  elsif p_action='cancel' then
   if v_position.sent_quantity<>0 then raise exception 'VENDOR_CUSTODY_PENDING';end if;
   update public.vendor_orders set status='cancelled',closed_at=now(),close_reason=v_reason where id=v_order.id;v_id:=v_order.id;
  end if;
  update public.vendor_orders set revision=revision+1,status=case when p_action='send' then 'open' else status end where id=v_order.id;
 end if;
 return private.finish_material_command(p_company_id,'jobwork.'||p_action,p_idempotency_key,v_request,v_id,'vendor_jobwork',p_data->>'reason');
end $$;
revoke all on function public.vendor_jobwork_command(uuid,text,jsonb,text) from public,anon;grant execute on function public.vendor_jobwork_command(uuid,text,jsonb,text) to authenticated;

create function public.get_vendor_workspace(p_company_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'number',o.number,'supplier_id',o.supplier_id,'source_lot_id',o.source_lot_id,'item_id',l.item_id,'process',o.process,'due_date',o.due_date,'status',o.status,'revision',o.revision,'quantity',o.quantity::text,'uom',o.uom,'sent_quantity',o.sent_quantity::text,'returned_quantity',o.returned_quantity::text,'loss_quantity',o.loss_quantity::text,'at_vendor_quantity',o.at_vendor_quantity::text,'remaining_to_send',o.remaining_to_send::text,'cancelled_unsent_quantity',o.cancelled_unsent_quantity::text,'close_reason',o.close_reason) order by o.created_at desc) from public.vendor_order_positions o join public.stock_lots l on l.id=o.source_lot_id where o.company_id=p_company_id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'vendor_order_id',vendor_order_id,'kind',kind,'quantity_delta',quantity_delta::text,'uom',uom,'output_lot_id',output_lot_id,'reference',reference,'certificate_reference',certificate_reference,'reason',reason,'created_at',created_at) order by created_at,id) from public.vendor_custody_events where company_id=p_company_id),'[]'::jsonb)
);$$;
revoke all on function public.get_vendor_workspace(uuid) from public,anon;grant execute on function public.get_vendor_workspace(uuid) to authenticated;

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
   bool_or(p.id is not null) requires_final,
   array_agg(distinct w.id) filter(where w.id is not null) work_order_ids,
   jsonb_agg(distinct jsonb_build_object('kind',case when p.id is not null then 'final' else 'incoming' end,
    'bom',w.bom_revision_id,'routing',w.routing_revision_id,'drawing',w.drawing_revision_id,'sales_line',w.sales_order_line_id)) signatures
  from roots r left join public.production_outputs p on p.lot_id=r.ancestor_id
  left join public.work_orders w on w.id=p.work_order_id group by r.company_id,r.lot_id
 ) select company_id,lot_id,requires_final,coalesce(work_order_ids,array[]::uuid[]) work_order_ids,signatures,
  case when jsonb_array_length(signatures)=1 then (signatures->0->>'sales_line')::uuid end sales_order_line_id,
  case when jsonb_array_length(signatures)=1 then (signatures->0->>'drawing')::uuid end drawing_revision_id
 from grouped;
grant select on public.lot_trace_context to authenticated;


create or replace view public.production_demand_commitments with (security_invoker=true) as
 select s.company_id,s.id sales_order_line_id,greatest(
 coalesce((select sum(case when w.source_ncr_id is null then w.quantity-case when w.status='closed' then coalesce((select sum(j.scrap_quantity) from public.job_cards j where j.work_order_id=w.id),0) else 0 end
  else case when w.status='closed' then -coalesce((select sum(j.scrap_quantity) from public.job_cards j where j.work_order_id=w.id),0) else 0 end end) from public.work_orders w where w.sales_order_line_id=s.id),0)
 -coalesce((select sum(n.quantity) from public.ncrs n join public.lot_trace_context t on t.lot_id=n.lot_id where t.sales_order_line_id=s.id and n.status='resolved' and n.disposition='scrap'),0)-coalesce((select -sum(e.quantity_delta) from public.vendor_custody_events e join public.vendor_orders o on o.id=e.vendor_order_id join public.lot_trace_context t on t.lot_id=o.source_lot_id where t.sales_order_line_id=s.id and e.kind='loss'),0),0) planned_quantity
 from public.sales_order_lines s;

create or replace function public.production_command(p_company_id uuid,p_action text,p_data jsonb,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_permission text; v_request jsonb:=jsonb_build_array(p_action,p_data); v_qty numeric; v_other numeric;
 v_item public.items%rowtype; v_pkg public.engineering_packages%rowtype; v_wo public.work_orders%rowtype;
 v_job public.job_cards%rowtype; v_lot public.stock_lots%rowtype; v_issue public.material_issues%rowtype;
 v_line public.sales_order_lines%rowtype; v_bom uuid; v_route uuid; v_header uuid; v_uom text; v_row jsonb; v_good numeric; v_scrap numeric;
begin
 v_permission:=case when p_action in ('create_package','approve_package') then 'master_data.manage'
 when p_action in ('create_work_order','release_work_order','close_work_order') then 'planning.manage'
 when p_action in ('issue_material','return_material','consume_material') then 'stock.issue'
 when p_action in ('start_job','complete_job','record_output') then 'production.execute' else null end;
 if v_permission is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'INVALID_REQUEST'; end if;
 v_id:=private.begin_material_command(p_company_id,v_permission,'production.'||p_action,p_idempotency_key,v_request);
 if v_id is not null then return v_id; end if;
 if p_action='create_package' then
  select * into v_item from public.items where id=(p_data->>'item_id')::uuid and company_id=p_company_id and active;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  v_qty:=private.factory_quantity(p_data,'basis_quantity');
  if jsonb_typeof(p_data->'components') is distinct from 'array' or jsonb_array_length(p_data->'components') not between 1 and 100
   or jsonb_typeof(p_data->'operations') is distinct from 'array' or jsonb_array_length(p_data->'operations') not between 1 and 50 then raise exception 'ENGINEERING_INCOMPLETE'; end if;
  insert into public.boms(company_id,output_item_id,name) values(p_company_id,v_item.id,v_item.sku||' BOM') on conflict(company_id,output_item_id) do update set output_item_id=excluded.output_item_id returning id into v_header;
  insert into public.bom_revisions(company_id,bom_id,revision,output_basis_quantity,output_basis_uom) values(p_company_id,v_header,trim(p_data->>'revision_label'),v_qty,v_item.base_uom) returning id into v_bom;
  for v_row in select value from jsonb_array_elements(p_data->'components') loop
   select base_uom into v_uom from public.items where id=(v_row->>'item_id')::uuid and company_id=p_company_id and active;
   if not found or v_uom is distinct from v_row->>'uom' then raise exception 'UOM_MISMATCH'; end if;
   if coalesce(v_row->>'scrap_allowance_pct','') !~ '^\d{1,3}(\.\d{1,4})?$' or (v_row->>'scrap_allowance_pct')::numeric>100 then raise exception 'INVALID_SCRAP_ALLOWANCE';end if;
   insert into public.bom_lines(company_id,bom_revision_id,component_item_id,quantity,uom,scrap_allowance_pct)
   values(p_company_id,v_bom,(v_row->>'item_id')::uuid,private.factory_quantity(v_row,'quantity'),v_uom,private.factory_quantity(v_row,'scrap_allowance_pct',true));
  end loop;
  insert into public.routings(company_id,output_item_id,name) values(p_company_id,v_item.id,v_item.sku||' route') on conflict(company_id,output_item_id) do update set output_item_id=excluded.output_item_id returning id into v_header;
  insert into public.routing_revisions(company_id,routing_id,revision) values(p_company_id,v_header,trim(p_data->>'revision_label')) returning id into v_route;
  for v_row in select value from jsonb_array_elements(p_data->'operations') loop
   if not exists(select 1 from public.work_centres where id=(v_row->>'work_centre_id')::uuid and company_id=p_company_id and active) then raise exception 'WORK_CENTRE_UNAVAILABLE'; end if;
   insert into public.routing_operations(company_id,routing_revision_id,sequence,work_centre_id,operation_name)
   values(p_company_id,v_route,(v_row->>'sequence')::integer,(v_row->>'work_centre_id')::uuid,trim(v_row->>'name'));
  end loop;
  insert into public.engineering_packages(company_id,item_id,label,bom_revision_id,routing_revision_id) values(p_company_id,v_item.id,trim(p_data->>'revision_label'),v_bom,v_route) returning id into v_id;
 elsif p_action='approve_package' then
  select * into v_pkg from public.engineering_packages where id=(p_data->>'package_id')::uuid and company_id=p_company_id for update;
  if not found or v_pkg.status<>'draft' then raise exception 'INVALID_TRANSITION'; end if;
  perform 1 from public.items where id=v_pkg.item_id or id in(select component_item_id from public.bom_lines where bom_revision_id=v_pkg.bom_revision_id) order by id for update;
  perform 1 from public.bom_revisions where id=v_pkg.bom_revision_id for update;
  perform 1 from public.routing_revisions where id=v_pkg.routing_revision_id for update;
  perform 1 from public.boms b join public.bom_revisions r on r.bom_id=b.id where r.id=v_pkg.bom_revision_id for update of b;
  perform 1 from public.routings r join public.routing_revisions v on v.routing_id=r.id where v.id=v_pkg.routing_revision_id for update of r;
  if not exists(select 1 from public.bom_revisions r join public.boms b on b.id=r.bom_id join public.items i on i.id=b.output_item_id where r.id=v_pkg.bom_revision_id and b.output_item_id=v_pkg.item_id and r.status='draft' and r.output_basis_quantity>0 and r.output_basis_quantity<>'NaN'::numeric and r.output_basis_uom=i.base_uom and i.active)
   or not exists(select 1 from public.routing_revisions v join public.routings r on r.id=v.routing_id where v.id=v_pkg.routing_revision_id and r.output_item_id=v_pkg.item_id and v.status='draft')
   or not exists(select 1 from public.bom_lines where bom_revision_id=v_pkg.bom_revision_id)
   or exists(select 1 from public.bom_lines l join public.items i on i.id=l.component_item_id where l.bom_revision_id=v_pkg.bom_revision_id and (not i.active or l.uom<>i.base_uom or l.quantity='NaN'::numeric or l.scrap_allowance_pct='NaN'::numeric))
   or not exists(select 1 from public.routing_operations where routing_revision_id=v_pkg.routing_revision_id)
   or exists(select 1 from public.routing_operations o join public.work_centres w on w.id=o.work_centre_id where o.routing_revision_id=v_pkg.routing_revision_id and not w.active) then raise exception 'ENGINEERING_INCOMPLETE'; end if;
  update public.bom_revisions set status='approved',approved_by=(select auth.uid()),approved_at=now() where id=v_pkg.bom_revision_id;
  update public.routing_revisions set status='approved',approved_by=(select auth.uid()),approved_at=now() where id=v_pkg.routing_revision_id;
  update public.engineering_packages set status='approved' where id=v_pkg.id; v_id:=v_pkg.id;
 elsif p_action='create_work_order' then
  perform 1 from public.sales_orders o join public.sales_order_lines l on l.sales_order_id=o.id where l.id=(p_data->>'sales_order_line_id')::uuid and l.company_id=p_company_id for update of o;
  select * into v_line from public.sales_order_lines where id=(p_data->>'sales_order_line_id')::uuid and company_id=p_company_id for update;
  if not found or not exists(select 1 from public.sales_orders where id=v_line.sales_order_id and status in ('open','partially_shipped')) then raise exception 'DEMAND_NOT_AVAILABLE'; end if;
  select * into v_pkg from public.engineering_packages where id=(p_data->>'package_id')::uuid and company_id=p_company_id and item_id=v_line.item_id and status='approved';
  if not found then raise exception 'ENGINEERING_REVISION_NOT_APPROVED'; end if;
  if (v_line.bom_revision_id is not null and v_line.bom_revision_id<>v_pkg.bom_revision_id) or (v_line.routing_revision_id is not null and v_line.routing_revision_id<>v_pkg.routing_revision_id) then raise exception 'ENGINEERING_PIN_MISMATCH'; end if;
  v_qty:=private.factory_quantity(p_data,'quantity');
  select planned_quantity into v_other from public.production_demand_commitments where sales_order_line_id=v_line.id;
  select v_other+coalesce(sum(case when r.status='active' then r.quantity else r.consumed_quantity end),0) into v_other from public.stock_reservations r where r.sales_order_line_id=v_line.id and not exists(select 1 from public.lot_trace_context t where t.lot_id=r.lot_id and t.sales_order_line_id=v_line.id);
  if v_other+v_qty > v_line.ordered_quantity then raise exception 'ORDER_QUANTITY_EXCEEDED'; end if;
  insert into public.work_orders(company_id,number,sales_order_line_id,item_id,quantity,uom,bom_revision_id,routing_revision_id,drawing_revision_id,start_date,due_date,created_by)
   values(p_company_id,upper(trim(p_data->>'number')),v_line.id,v_line.item_id,v_qty,v_line.uom,v_pkg.bom_revision_id,v_pkg.routing_revision_id,v_line.drawing_revision_id,(p_data->>'start_date')::date,(p_data->>'due_date')::date,(select auth.uid())) returning id into v_id;
  insert into public.work_order_requirements(company_id,work_order_id,item_id,required_quantity,uom)
   select p_company_id,v_id,l.component_item_id,ceil(l.quantity*v_qty/b.output_basis_quantity*(1+l.scrap_allowance_pct/100)*1000000)/1000000,l.uom
   from public.bom_lines l join public.bom_revisions b on b.id=l.bom_revision_id where l.bom_revision_id=v_pkg.bom_revision_id and b.output_basis_uom=v_line.uom;
  if not found then raise exception 'ENGINEERING_INCOMPLETE'; end if;
 elsif p_action in ('release_work_order','close_work_order') then
  select * into v_wo from public.work_orders where id=(p_data->>'work_order_id')::uuid and company_id=p_company_id for no key update;
  if not found then raise exception 'WORK_ORDER_NOT_FOUND'; end if;
  if v_wo.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
  if p_action='release_work_order' then
   if v_wo.status<>'draft' then raise exception 'INVALID_TRANSITION'; end if;
   if exists(select 1 from public.routing_operations o join public.work_centres w on w.id=o.work_centre_id where o.routing_revision_id=v_wo.routing_revision_id and not w.active) then raise exception 'WORK_CENTRE_UNAVAILABLE'; end if;
   if exists(select 1 from public.production_material_positions where work_order_id=v_wo.id and available_quantity < required_quantity) and v_wo.source_ncr_id is null then raise exception 'MATERIAL_SHORTAGE'; end if;
   insert into public.job_cards(company_id,work_order_id,sequence,name,work_centre_id,planned_quantity,uom)
    select p_company_id,v_wo.id,sequence,operation_name,work_centre_id,v_wo.quantity,v_wo.uom from public.routing_operations where routing_revision_id=v_wo.routing_revision_id;
   if not found then raise exception 'ENGINEERING_INCOMPLETE'; end if;
   update public.work_orders set status='released',revision=revision+1 where id=v_wo.id;
  else
   if v_wo.status not in ('released','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
   perform 1 from public.stock_lots l join public.lot_trace_context t on t.lot_id=l.id where v_wo.id=any(t.work_order_ids) order by l.id for update of l;
   if not exists(select 1 from public.job_cards where work_order_id=v_wo.id) or exists(select 1 from public.job_cards where work_order_id=v_wo.id and status<>'completed') then raise exception 'OPERATIONS_PENDING'; end if;
   if exists(select 1 from public.production_material_positions where work_order_id=v_wo.id and (consumed_quantity < required_quantity or wip_quantity<>0)) then raise exception 'MATERIAL_UNACCOUNTED'; end if;
   select coalesce(sum(quantity),0) into v_qty from public.production_outputs where work_order_id=v_wo.id;
   select coalesce(sum(scrap_quantity),0) into v_other from public.job_cards where work_order_id=v_wo.id;
   if v_qty+v_other<>v_wo.quantity then raise exception 'OUTPUT_UNACCOUNTED'; end if;
   if exists(select 1 from public.vendor_order_positions p join public.lot_trace_context t on t.lot_id=p.source_lot_id where v_wo.id=any(t.work_order_ids) and p.at_vendor_quantity>0) then raise exception 'VENDOR_CUSTODY_PENDING';end if;
   if exists(select 1 from public.lot_trace_context t join public.stock_lots l on l.id=t.lot_id where v_wo.id=any(t.work_order_ids) and l.qc_status<>'released' and not (exists(select 1 from public.ncrs n where n.lot_id=l.id and n.status='resolved' and n.disposition in ('scrap','rework')) and coalesce((select sum(quantity_delta) from public.stock_ledger_entries where lot_id=l.id),0)=0)) then raise exception 'QUALITY_PENDING'; end if;
   update public.work_orders set status='closed',revision=revision+1 where id=v_wo.id;
   if v_wo.source_ncr_id is not null then update public.ncrs set status='resolved',revision=revision+1 where id=v_wo.source_ncr_id and status='awaiting_rework'; end if;
  end if; v_id:=v_wo.id;
 elsif p_action in ('start_job','complete_job') then
  select w.* into v_wo from public.work_orders w join public.job_cards j on j.work_order_id=w.id where j.id=(p_data->>'job_card_id')::uuid and w.company_id=p_company_id for no key update of w;
  select * into v_job from public.job_cards where id=(p_data->>'job_card_id')::uuid and company_id=p_company_id for update;
  if not found or v_wo.status not in ('released','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
  if v_job.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
  if exists(select 1 from public.job_cards where work_order_id=v_wo.id and sequence<v_job.sequence and status<>'completed') then raise exception 'PREDECESSOR_PENDING'; end if;
  if p_action='start_job' then
   if v_job.status<>'pending' then raise exception 'INVALID_TRANSITION'; end if;
   if not exists(select 1 from public.work_centres where id=v_job.work_centre_id and company_id=p_company_id and active) then raise exception 'WORK_CENTRE_UNAVAILABLE'; end if;
   select good_quantity into v_qty from public.job_cards where work_order_id=v_wo.id and sequence<v_job.sequence order by sequence desc limit 1;
   if v_qty=0 and not exists(select 1 from public.job_cards where work_order_id=v_wo.id and sequence>v_job.sequence)
    and exists(select 1 from public.production_material_positions where work_order_id=v_wo.id and consumed_quantity<required_quantity) then raise exception 'MATERIAL_UNACCOUNTED'; end if;
   update public.job_cards set planned_quantity=coalesce(v_qty,v_wo.quantity),status=case when v_qty=0 then 'completed' else 'in_progress' end,
    started_at=now(),completed_at=case when v_qty=0 then now() else null end,revision=revision+1 where id=v_job.id;
  else
   if v_job.status<>'in_progress' then raise exception 'INVALID_TRANSITION'; end if;
   if not exists(select 1 from public.job_cards where work_order_id=v_wo.id and sequence>v_job.sequence)
    and exists(select 1 from public.production_material_positions where work_order_id=v_wo.id and consumed_quantity<required_quantity) then raise exception 'MATERIAL_UNACCOUNTED'; end if;
   v_good:=private.factory_quantity(p_data,'good_quantity',true); v_scrap:=private.factory_quantity(p_data,'scrap_quantity',true);
   if v_good+v_scrap<=0 or v_job.good_quantity+v_job.scrap_quantity+v_good+v_scrap>v_job.planned_quantity then raise exception 'OPERATION_QUANTITY_EXCEEDED'; end if;
   if char_length(trim(coalesce(p_data->>'reason',''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
   if (select result from public.inspections where job_card_id=v_job.id order by recorded_sequence desc limit 1)='failed' then raise exception 'QUALITY_PENDING'; end if;
   update public.job_cards set good_quantity=good_quantity+v_good,scrap_quantity=scrap_quantity+v_scrap,
    status=case when good_quantity+scrap_quantity+v_good+v_scrap=planned_quantity then 'completed' else 'in_progress' end,
    completed_at=case when good_quantity+scrap_quantity+v_good+v_scrap=planned_quantity then now() else null end,revision=revision+1 where id=v_job.id;
  end if;
  update public.work_orders set status='in_progress',revision=revision+1 where id=v_wo.id; v_id:=v_job.id;
 elsif p_action='issue_material' then
  select * into v_wo from public.work_orders where id=(p_data->>'work_order_id')::uuid and company_id=p_company_id for no key update;
  if not found or v_wo.status not in ('released','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
  if not exists(select 1 from public.job_cards where id=(p_data->>'job_card_id')::uuid and work_order_id=v_wo.id and company_id=p_company_id and status<>'completed') then raise exception 'JOB_CARD_NOT_FOUND'; end if;
  select * into v_lot from public.stock_lots where id=(p_data->>'lot_id')::uuid and company_id=p_company_id for update;
  if not found then raise exception 'LOT_NOT_FOUND'; end if;
  if v_lot.revision is distinct from (p_data->>'lot_revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
  if v_lot.qc_status<>'released' and not exists(select 1 from public.ncrs where id=v_wo.source_ncr_id and lot_id=v_lot.id and status='awaiting_rework') then raise exception 'LOT_QC_HOLD'; end if;
  select uom,required_quantity into v_uom,v_other from public.work_order_requirements where work_order_id=v_wo.id and item_id=v_lot.item_id;
  if not found or v_uom is distinct from p_data->>'uom' then raise exception 'UOM_MISMATCH'; end if;
  v_qty:=private.factory_quantity(p_data,'quantity');
  if (select coalesce(sum(quantity_delta),0) from public.stock_ledger_entries where lot_id=v_lot.id)-(select coalesce(sum(quantity-consumed_quantity),0) from public.stock_reservations where lot_id=v_lot.id and status='active') < v_qty then raise exception 'INSUFFICIENT_AVAILABLE_STOCK'; end if;
  if v_qty+(select coalesce(sum(i.quantity-coalesce((select sum(e.quantity) from public.material_events e where e.issue_id=i.id and kind='return'),0)),0) from public.material_issues i where work_order_id=v_wo.id and item_id=v_lot.item_id)>v_other then raise exception 'MATERIAL_REQUIREMENT_EXCEEDED'; end if;
  insert into public.material_issues(company_id,work_order_id,job_card_id,lot_id,item_id,quantity,uom) values(p_company_id,v_wo.id,(p_data->>'job_card_id')::uuid,v_lot.id,v_lot.item_id,v_qty,v_uom) returning id into v_id;
  insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by)
   values(p_company_id,v_lot.id,v_lot.item_id,v_lot.location_id,'issue',-v_qty,v_uom,'material_issue',v_id,p_idempotency_key,(select auth.uid()));
  update public.stock_lots set revision=revision+1,updated_at=now() where id=v_lot.id;
 elsif p_action in ('return_material','consume_material') then
  select w.* into v_wo from public.work_orders w join public.material_issues i on i.work_order_id=w.id where i.id=(p_data->>'issue_id')::uuid and w.company_id=p_company_id for no key update of w;
  select * into v_issue from public.material_issues where id=(p_data->>'issue_id')::uuid and company_id=p_company_id for update;
  if not found or v_wo.status not in ('released','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
  v_qty:=private.factory_quantity(p_data,'quantity');
  if v_qty > v_issue.quantity-coalesce((select sum(quantity) from public.material_events where issue_id=v_issue.id),0) then raise exception 'ISSUE_QUANTITY_EXCEEDED'; end if;
  insert into public.material_events(company_id,issue_id,kind,quantity,reason) values(p_company_id,v_issue.id,case when p_action='return_material' then 'return' else 'consume' end,v_qty,trim(p_data->>'reason')) returning id into v_id;
  if p_action='return_material' then
   select * into v_lot from public.stock_lots where id=v_issue.lot_id and company_id=p_company_id for update;
   if v_lot.revision is distinct from (p_data->>'lot_revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
   insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by,reason)
    values(p_company_id,v_lot.id,v_lot.item_id,v_lot.location_id,'reversal',v_qty,v_issue.uom,'material_return',v_id,p_idempotency_key,(select auth.uid()),trim(p_data->>'reason'));
   -- Unused return re-enters QC hold so changed custody never silently inherits old inspection approval.
   update public.stock_lots set qc_status='hold',revision=revision+1,updated_at=now() where id=v_lot.id;
  end if;
 elsif p_action='record_output' then
  select * into v_wo from public.work_orders where id=(p_data->>'work_order_id')::uuid and company_id=p_company_id for no key update;
  if not found or v_wo.status not in ('released','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
  v_qty:=private.factory_quantity(p_data,'quantity');
  if v_wo.uom is distinct from p_data->>'uom' then raise exception 'UOM_MISMATCH'; end if;
  if exists(select 1 from public.job_cards where work_order_id=v_wo.id and status<>'completed') then raise exception 'OPERATIONS_PENDING'; end if;
  if exists(select 1 from public.production_material_positions where work_order_id=v_wo.id and consumed_quantity<required_quantity) then raise exception 'MATERIAL_UNACCOUNTED'; end if;
  select good_quantity into v_other from public.job_cards where work_order_id=v_wo.id order by sequence desc limit 1;
  if v_other is null or v_qty+coalesce((select sum(quantity) from public.production_outputs where work_order_id=v_wo.id),0)>v_other then raise exception 'OUTPUT_QUANTITY_EXCEEDED'; end if;
  insert into public.stock_lots(company_id,item_id,location_id,lot_code,qc_status) values(p_company_id,v_wo.item_id,(p_data->>'location_id')::uuid,upper(trim(p_data->>'lot_code')),'hold') returning * into v_lot;
  insert into public.production_outputs(company_id,work_order_id,lot_id,quantity,uom) values(p_company_id,v_wo.id,v_lot.id,v_qty,v_wo.uom) returning id into v_id;
  insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by)
   values(p_company_id,v_lot.id,v_lot.item_id,v_lot.location_id,'production_receipt',v_qty,v_wo.uom,'production_output',v_id,p_idempotency_key,(select auth.uid()));
  insert into public.lot_genealogy(company_id,parent_lot_id,child_lot_id,work_order_id,source_issue_id)
   select p_company_id,i.lot_id,v_lot.id,v_wo.id,i.id from public.material_issues i where i.work_order_id=v_wo.id and exists(select 1 from public.material_events e where e.issue_id=i.id and kind='consume');
 end if;
 return private.finish_material_command(p_company_id,'production.'||p_action,p_idempotency_key,v_request,v_id,case when p_action in ('start_job','complete_job') then 'job_card' when p_action like '%material' then 'material_event' when p_action='record_output' then 'production_output' when p_action like '%package' then 'engineering_package' else 'work_order' end,p_data->>'reason');
end $$;

create or replace function private.guard_factory_receipt() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.source_type='finished_goods_receipt' then
  if exists(select 1 from public.goods_receipts where lot_id=new.lot_id) or exists(select 1 from public.production_outputs where lot_id=new.lot_id) or exists(select 1 from public.lot_transformations where output_lot_id=new.lot_id) or exists(select 1 from public.vendor_custody_events where output_lot_id=new.lot_id) then raise exception 'MANAGED_LOT_RECEIPT'; end if;
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
 'genealogy',coalesce((select jsonb_agg(jsonb_build_object('id',id,'parent_lot_id',parent_lot_id,'child_lot_id',child_lot_id,'work_order_id',work_order_id,'source_issue_id',source_issue_id,'vendor_receipt_id',vendor_receipt_id,'transformation_id',transformation_id,'quantity',quantity::text,'uom',uom)) from public.lot_genealogy where company_id=p_company_id),'[]'::jsonb),
 'receipts',coalesce((select jsonb_agg(jsonb_build_object('lot_id',r.lot_id,'supplier_lot',r.supplier_lot,'certificate_reference',r.certificate_reference,'supplier_name',s.name)) from public.goods_receipts r join public.purchase_orders o on o.id=r.purchase_order_id join public.suppliers s on s.id=o.supplier_id where r.company_id=p_company_id),'[]'::jsonb),
 'processReceipts',coalesce((select jsonb_agg(jsonb_build_object('lot_id',e.output_lot_id,'vendor_order_number',o.number,'supplier_name',v.name,'process',o.process,'reference',e.reference,'certificate_reference',e.certificate_reference)) from public.vendor_custody_events e join public.vendor_orders o on o.id=e.vendor_order_id join public.suppliers v on v.id=o.supplier_id where e.company_id=p_company_id and e.kind='return'),'[]'::jsonb),
 'shipments',coalesce((select jsonb_agg(jsonb_build_object('lot_id',l.lot_id,'shipment_id',s.id,'shipment_number',s.shipment_number,'status',s.status,'quantity',l.quantity::text,'uom',i.base_uom)) from public.shipment_lines l join public.shipments s on s.id=l.shipment_id join public.stock_lots lot on lot.id=l.lot_id join public.items i on i.id=lot.item_id where l.company_id=p_company_id),'[]'::jsonb)
);
$$;
