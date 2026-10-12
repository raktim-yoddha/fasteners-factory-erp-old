-- ADR 0017: deterministic manufacturing, exact custody and inspection-gated release.
alter table public.bom_revisions add column output_basis_quantity numeric(18,6)
  check (output_basis_quantity > 0 and output_basis_quantity <> 'NaN'::numeric);
alter table public.bom_revisions add column output_basis_uom text check(output_basis_uom in ('pcs','kg','m','set'));

create table public.engineering_packages (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  item_id uuid not null, label text not null check(char_length(trim(label)) between 1 and 24),
  bom_revision_id uuid not null, routing_revision_id uuid not null,
  status text not null default 'draft' check(status in ('draft','approved')),
  unique(id,company_id), unique(company_id,item_id,label),
  foreign key(item_id,company_id) references public.items(id,company_id),
  foreign key(bom_revision_id,company_id) references public.bom_revisions(id,company_id),
  foreign key(routing_revision_id,company_id) references public.routing_revisions(id,company_id)
);
create table public.work_orders (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  number text not null check(number ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'), sales_order_line_id uuid,
  item_id uuid not null, quantity numeric(18,6) not null check(quantity > 0 and quantity <> 'NaN'::numeric),
  uom text not null check(uom in ('pcs','kg','m','set')), bom_revision_id uuid not null, routing_revision_id uuid not null,
  drawing_revision_id uuid, start_date date not null, due_date date not null check(due_date >= start_date),
  status text not null default 'draft' check(status in ('draft','released','in_progress','closed')),
  revision integer not null default 1, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  parent_work_order_id uuid, source_ncr_id uuid,
  unique(id,company_id), unique(company_id,number),
  foreign key(sales_order_line_id,company_id) references public.sales_order_lines(id,company_id),
  foreign key(item_id,company_id) references public.items(id,company_id),
  foreign key(bom_revision_id,company_id) references public.bom_revisions(id,company_id),
  foreign key(routing_revision_id,company_id) references public.routing_revisions(id,company_id),
  foreign key(drawing_revision_id,company_id) references public.drawing_revisions(id,company_id),
  foreign key(parent_work_order_id,company_id) references public.work_orders(id,company_id)
);
create table public.job_cards (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, work_order_id uuid not null,
  sequence integer not null check(sequence > 0), name text not null, work_centre_id uuid not null,
  planned_quantity numeric(18,6) not null, good_quantity numeric(18,6) not null default 0,
  scrap_quantity numeric(18,6) not null default 0, uom text not null,
  status text not null default 'pending' check(status in ('pending','in_progress','completed')), revision integer not null default 1,
  started_at timestamptz, completed_at timestamptz, unique(id,company_id), unique(work_order_id,sequence),
  foreign key(work_order_id,company_id) references public.work_orders(id,company_id),
  foreign key(work_centre_id,company_id) references public.work_centres(id,company_id),
  check(good_quantity >= 0 and scrap_quantity >= 0 and good_quantity+scrap_quantity <= planned_quantity)
);
create table public.work_order_requirements (
  company_id uuid not null, work_order_id uuid not null, item_id uuid not null,
  required_quantity numeric(18,6) not null check(required_quantity > 0), uom text not null,
  primary key(work_order_id,item_id), foreign key(work_order_id,company_id) references public.work_orders(id,company_id),
  foreign key(item_id,company_id) references public.items(id,company_id)
);
create table public.material_issues (
  id uuid primary key default gen_random_uuid(),company_id uuid not null,work_order_id uuid not null,job_card_id uuid not null,
  lot_id uuid not null,item_id uuid not null,quantity numeric(18,6) not null check(quantity > 0),uom text not null,
  created_at timestamptz not null default now(), unique(id,company_id),
  foreign key(work_order_id,company_id) references public.work_orders(id,company_id),
  foreign key(job_card_id,company_id) references public.job_cards(id,company_id),
  foreign key(lot_id,company_id) references public.stock_lots(id,company_id),
  foreign key(item_id,company_id) references public.items(id,company_id)
);
create table public.material_events (
  id uuid primary key default gen_random_uuid(),company_id uuid not null,issue_id uuid not null,
  kind text not null check(kind in ('return','consume')),quantity numeric(18,6) not null check(quantity > 0),
  reason text not null check(char_length(trim(reason)) between 1 and 2000),created_at timestamptz not null default now(),
  foreign key(issue_id,company_id) references public.material_issues(id,company_id)
);
create table public.production_outputs (
  id uuid primary key default gen_random_uuid(),company_id uuid not null,work_order_id uuid not null,lot_id uuid not null,
  quantity numeric(18,6) not null check(quantity > 0),uom text not null,created_at timestamptz not null default now(),
  unique(id,company_id),unique(lot_id),foreign key(work_order_id,company_id) references public.work_orders(id,company_id),
  foreign key(lot_id,company_id) references public.stock_lots(id,company_id)
);
create table public.lot_genealogy (
  id uuid primary key default gen_random_uuid(),company_id uuid not null,parent_lot_id uuid not null,child_lot_id uuid not null,
  work_order_id uuid not null,source_issue_id uuid not null,created_at timestamptz not null default now(),
  foreign key(parent_lot_id,company_id) references public.stock_lots(id,company_id),
  foreign key(child_lot_id,company_id) references public.stock_lots(id,company_id),
  foreign key(work_order_id,company_id) references public.work_orders(id,company_id),
  foreign key(source_issue_id,company_id) references public.material_issues(id,company_id),
  unique(parent_lot_id,child_lot_id,source_issue_id),check(parent_lot_id <> child_lot_id)
);
create table public.inspection_plans (
  id uuid primary key default gen_random_uuid(),company_id uuid not null,item_id uuid not null,label text not null,
  version text not null check(char_length(trim(version)) between 1 and 24),
  sample_size integer not null check(sample_size between 1 and 100),characteristics jsonb not null,
  status text not null default 'draft' check(status in ('draft','approved')),
  created_by uuid not null references auth.users(id),approved_by uuid references auth.users(id),approved_at timestamptz,
  unique(id,company_id),unique(company_id,item_id,label,version),
  foreign key(item_id,company_id) references public.items(id,company_id),
  check(jsonb_typeof(characteristics)='array' and jsonb_array_length(characteristics) between 1 and 50),
  check(char_length(trim(label)) between 1 and 160)
);
create table public.inspections (
  id uuid primary key default gen_random_uuid(),company_id uuid not null,plan_id uuid not null,lot_id uuid,job_card_id uuid,
  lot_revision integer,job_revision integer,kind text not null check(kind in ('incoming','in_process','final')),
  readings jsonb not null,result text not null check(result in ('passed','failed')),reason text not null,
  inspector_id uuid not null references auth.users(id),created_at timestamptz not null default now(),supersedes_id uuid,
  recorded_sequence bigint generated always as identity,
  unique(id,company_id),foreign key(plan_id,company_id) references public.inspection_plans(id,company_id),
  foreign key(lot_id,company_id) references public.stock_lots(id,company_id),
  foreign key(job_card_id,company_id) references public.job_cards(id,company_id),
  foreign key(supersedes_id,company_id) references public.inspections(id,company_id),
  check((lot_id is null) <> (job_card_id is null)),check(char_length(trim(reason)) between 1 and 2000)
);
create table public.ncrs (
  id uuid primary key default gen_random_uuid(),company_id uuid not null,lot_id uuid not null,inspection_id uuid,
  quantity numeric(18,6) not null check(quantity > 0),uom text not null,reason text not null,
  status text not null default 'open' check(status in ('open','awaiting_return','awaiting_rework','resolved')),
  disposition text check(disposition in ('reinspect','scrap','supplier_return','rework')),
  revision integer not null default 1,review_reason text,reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),unique(id,company_id),
  foreign key(lot_id,company_id) references public.stock_lots(id,company_id),
  foreign key(inspection_id,company_id) references public.inspections(id,company_id),
  check(char_length(trim(reason)) between 1 and 2000)
);
alter table public.work_orders add foreign key(source_ncr_id,company_id) references public.ncrs(id,company_id);

insert into public.permission_definitions(code,description) values
 ('production.read','Read factory work, material custody and operations.'),('planning.manage','Plan, release and close work orders.'),
 ('production.execute','Record operation progress and held output.'),('stock.issue','Issue, return and account job materials.'),
 ('quality.read','Read inspections, plans, NCRs and genealogy.'),('quality.manage','Create and approve inspection plans.'),
 ('quality.inspect','Record measured inspection results.'),('quality.review','Contain lots and authorize NCR disposition.') on conflict do nothing;
insert into public.role_permissions(role,permission_code) select 'admin',code from public.permission_definitions on conflict do nothing;
insert into public.role_permissions(role,permission_code) values
 ('planning','production.read'),('planning','planning.manage'),('planning','stock.read'),('planning','sales.read'),
 ('engineering','production.read'),('stores','production.read'),('stores','stock.issue'),
 ('production_supervisor','production.read'),('production_supervisor','production.execute'),('production_supervisor','stock.read'),
 ('operator','production.read'),('operator','production.execute'),('operator','stock.read'),
 ('quality','production.read'),('quality','quality.read'),('quality','quality.manage'),('quality','quality.inspect'),('quality','quality.review'),
 ('management','production.read'),('management','quality.read'),('auditor','production.read'),('auditor','quality.read'),
 ('engineering','quality.read'),('stores','quality.read'),('planning','quality.read') on conflict do nothing;
do $$ declare t text; begin
 foreach t in array array['engineering_packages','work_orders','job_cards','work_order_requirements','material_issues','material_events','production_outputs','lot_genealogy','inspection_plans','inspections','ncrs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy "permitted factory records" on public.%I for select to authenticated using ((select private.has_company_permission(company_id,%L)))',t,case when t in ('inspection_plans','inspections','ncrs','lot_genealogy') then 'quality.read' else 'production.read' end);
  execute format('create index on public.%I(company_id)',t);
 end loop;
end $$;
create index on public.work_orders(sales_order_line_id);
create index on public.job_cards(work_order_id,sequence);
create index on public.material_issues(work_order_id,item_id);
create index on public.material_events(issue_id);
create index on public.production_outputs(work_order_id);
create index on public.inspections(lot_id,created_at desc);
create index on public.inspections(job_card_id,created_at desc);
create index on public.ncrs(lot_id,status);
create index on public.lot_genealogy(child_lot_id);
create index on public.lot_genealogy(parent_lot_id);

create function private.factory_quantity(d jsonb,k text,zero_allowed boolean default false)
returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric; begin
 if (d->>k) is null or (d->>k) !~ '^\d{1,12}(\.\d{1,6})?$' then raise exception 'INVALID_QUANTITY'; end if;
 n:=(d->>k)::numeric; if n<0 or (not zero_allowed and n=0) then raise exception 'INVALID_QUANTITY'; end if; return n;
end $$;
revoke all on function private.factory_quantity(jsonb,text,boolean) from public,anon,authenticated;

create view public.material_issue_positions with(security_invoker=true) as
select i.*,i.quantity-coalesce((select sum(e.quantity) from public.material_events e where e.issue_id=i.id),0) remaining_quantity
from public.material_issues i;
grant select on public.material_issue_positions to authenticated;
create view public.production_material_positions with(security_invoker=true) as
select r.*,coalesce((select sum(e.quantity) from public.material_events e join public.material_issues i on i.id=e.issue_id
 where i.work_order_id=r.work_order_id and i.item_id=r.item_id and e.kind='consume'),0) consumed_quantity,
 coalesce((select sum(i.remaining_quantity) from public.material_issue_positions i where i.work_order_id=r.work_order_id and i.item_id=r.item_id),0) wip_quantity,
 coalesce((select sum(s.available_to_promise) from public.stock_positions s where s.company_id=r.company_id and s.item_id=r.item_id),0) available_quantity,
 coalesce((select sum(p.outstanding_quantity) from public.purchase_order_positions p join public.purchase_orders o on o.id=p.purchase_order_id where o.company_id=r.company_id and o.item_id=r.item_id and o.status in ('approved','partially_received')),0) expected_receipts
from public.work_order_requirements r;
grant select on public.production_material_positions to authenticated;

-- Closed batch losses free demand for bounded replacement work; rework never double counts demand.
create view public.production_demand_commitments with (security_invoker=true) as
 select s.company_id,s.id sales_order_line_id,greatest(
 coalesce((select sum(case when w.source_ncr_id is null then w.quantity-case when w.status='closed' then coalesce((select sum(j.scrap_quantity) from public.job_cards j where j.work_order_id=w.id),0) else 0 end
  else case when w.status='closed' then -coalesce((select sum(j.scrap_quantity) from public.job_cards j where j.work_order_id=w.id),0) else 0 end end) from public.work_orders w where w.sales_order_line_id=s.id),0)
 -coalesce((select sum(n.quantity) from public.ncrs n join public.production_outputs p on p.lot_id=n.lot_id join public.work_orders w on w.id=p.work_order_id where w.sales_order_line_id=s.id and n.status='resolved' and n.disposition='scrap'),0),0) planned_quantity
 from public.sales_order_lines s;
grant select on public.production_demand_commitments to authenticated;

create function public.production_command(p_company_id uuid,p_action text,p_data jsonb,p_idempotency_key text)
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
  select v_other+coalesce(sum(case when r.status='active' then r.quantity else r.consumed_quantity end),0) into v_other from public.stock_reservations r where r.sales_order_line_id=v_line.id and not exists(select 1 from public.production_outputs o join public.work_orders w on w.id=o.work_order_id where o.lot_id=r.lot_id and w.sales_order_line_id=v_line.id);
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
   perform 1 from public.stock_lots l join public.production_outputs o on o.lot_id=l.id where o.work_order_id=v_wo.id order by l.id for update of l;
   if not exists(select 1 from public.job_cards where work_order_id=v_wo.id) or exists(select 1 from public.job_cards where work_order_id=v_wo.id and status<>'completed') then raise exception 'OPERATIONS_PENDING'; end if;
   if exists(select 1 from public.production_material_positions where work_order_id=v_wo.id and (consumed_quantity < required_quantity or wip_quantity<>0)) then raise exception 'MATERIAL_UNACCOUNTED'; end if;
   select coalesce(sum(quantity),0) into v_qty from public.production_outputs where work_order_id=v_wo.id;
   select coalesce(sum(scrap_quantity),0) into v_other from public.job_cards where work_order_id=v_wo.id;
   if v_qty+v_other<>v_wo.quantity then raise exception 'OUTPUT_UNACCOUNTED'; end if;
   if exists(select 1 from public.production_outputs o join public.stock_lots l on l.id=o.lot_id where o.work_order_id=v_wo.id and l.qc_status<>'released' and not (exists(select 1 from public.ncrs n where n.lot_id=l.id and n.status='resolved' and n.disposition in ('scrap','rework')) and coalesce((select sum(quantity_delta) from public.stock_ledger_entries where lot_id=l.id),0)=0)) then raise exception 'QUALITY_PENDING'; end if;
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
revoke all on function public.production_command(uuid,text,jsonb,text) from public,anon;
grant execute on function public.production_command(uuid,text,jsonb,text) to authenticated;

create function public.quality_command(p_company_id uuid,p_action text,p_data jsonb,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_permission text; v_id uuid; v_request jsonb:=jsonb_build_array(p_action,p_data); v_plan public.inspection_plans%rowtype;
 v_lot public.stock_lots%rowtype; v_job public.job_cards%rowtype; v_ncr public.ncrs%rowtype; v_wo public.work_orders%rowtype;
 v_pkg public.engineering_packages%rowtype; v_receipt public.goods_receipts%rowtype;
 v_row jsonb; v_reading jsonb; v_value jsonb; v_keys text[]:=array[]::text[]; v_key text; v_pass boolean:=true;
 v_min numeric; v_max numeric; v_num numeric; v_qty numeric; v_balance numeric; v_reserved numeric; v_uom text; v_item uuid; v_parent uuid;
begin
 v_permission:=case when p_action in ('create_plan','approve_plan') then 'quality.manage' when p_action='inspect' then 'quality.inspect'
 when p_action in ('create_ncr','resolve_ncr') then 'quality.review' else null end;
 if v_permission is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'INVALID_REQUEST'; end if;
 v_id:=private.begin_material_command(p_company_id,v_permission,'quality.'||p_action,p_idempotency_key,v_request); if v_id is not null then return v_id; end if;
 if p_action='create_plan' then
  if not exists(select 1 from public.items where id=(p_data->>'item_id')::uuid and company_id=p_company_id and active) then raise exception 'ITEM_NOT_FOUND'; end if;
  if jsonb_typeof(p_data->'characteristics') is distinct from 'array' or jsonb_array_length(p_data->'characteristics') not between 1 and 50 then raise exception 'INSPECTION_PLAN_INVALID'; end if;
  for v_row in select value from jsonb_array_elements(p_data->'characteristics') loop
   v_key:=v_row->>'key';
   if v_key is null or v_key !~ '^[a-zA-Z0-9_-]{1,40}$' or v_key=any(v_keys) or char_length(trim(coalesce(v_row->>'label',''))) not between 1 and 160 then raise exception 'INSPECTION_PLAN_INVALID'; end if;
   v_keys:=array_append(v_keys,v_key);
   if v_row->>'type'='numeric' then
    if (v_row->>'min') is null or (v_row->>'max') is null or (v_row->>'min') !~ '^-?\d{1,12}(\.\d{1,6})?$' or (v_row->>'max') !~ '^-?\d{1,12}(\.\d{1,6})?$'
     or char_length(trim(coalesce(v_row->>'uom',''))) not between 1 and 32 then raise exception 'INSPECTION_PLAN_INVALID'; end if;
    if (v_row->>'min')::numeric > (v_row->>'max')::numeric then raise exception 'INSPECTION_PLAN_INVALID'; end if;
   elsif v_row->>'type'='attribute' then
    if char_length(trim(coalesce(v_row->>'expected',''))) not between 1 and 160 then raise exception 'INSPECTION_PLAN_INVALID'; end if;
   else raise exception 'INSPECTION_PLAN_INVALID'; end if;
  end loop;
  insert into public.inspection_plans(company_id,item_id,label,version,sample_size,characteristics,created_by)
   values(p_company_id,(p_data->>'item_id')::uuid,trim(p_data->>'label'),trim(p_data->>'version'),(p_data->>'sample_size')::integer,p_data->'characteristics',(select auth.uid())) returning id into v_id;
 elsif p_action='approve_plan' then
  select * into v_plan from public.inspection_plans where id=(p_data->>'plan_id')::uuid and company_id=p_company_id for update;
  if not found or v_plan.status<>'draft' then raise exception 'INVALID_TRANSITION'; end if;
  update public.inspection_plans set status='approved',approved_by=(select auth.uid()),approved_at=now() where id=v_plan.id; v_id:=v_plan.id;
 elsif p_action='inspect' then
  select * into v_plan from public.inspection_plans where id=(p_data->>'plan_id')::uuid and company_id=p_company_id and status='approved';
  if not found then raise exception 'INSPECTION_PLAN_NOT_APPROVED'; end if;
  if (p_data->>'lot_id') is not null then
   select * into v_lot from public.stock_lots where id=(p_data->>'lot_id')::uuid and company_id=p_company_id for update;
   if not found then raise exception 'LOT_NOT_FOUND'; end if;
   if v_lot.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
   v_item:=v_lot.item_id;
   if p_data->>'kind' not in ('incoming','final') or v_lot.qc_status='released' then raise exception 'INVALID_TRANSITION'; end if;
   if (p_data->>'kind'='final') <> exists(select 1 from public.production_outputs where lot_id=v_lot.id) then raise exception 'INSPECTION_CONTEXT_MISMATCH'; end if;
  else
   select w.* into v_wo from public.work_orders w join public.job_cards j on j.work_order_id=w.id where j.id=(p_data->>'job_card_id')::uuid and w.company_id=p_company_id for no key update of w;
   select * into v_job from public.job_cards where id=(p_data->>'job_card_id')::uuid and company_id=p_company_id for update;
   if not found or v_job.status<>'in_progress' or p_data->>'kind'<>'in_process' then raise exception 'INVALID_TRANSITION'; end if;
   if v_job.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if; v_item:=v_wo.item_id;
  end if;
  if v_plan.item_id<>v_item then raise exception 'INSPECTION_CONTEXT_MISMATCH'; end if;
  if (p_data->>'supersedes_id') is not null and not exists(select 1 from public.inspections where id=(p_data->>'supersedes_id')::uuid and company_id=p_company_id and lot_id is not distinct from v_lot.id and job_card_id is not distinct from v_job.id) then raise exception 'INSPECTION_CONTEXT_MISMATCH'; end if;
  if jsonb_typeof(p_data->'readings') is distinct from 'array' or jsonb_array_length(p_data->'readings')<>jsonb_array_length(v_plan.characteristics) then raise exception 'MEASUREMENTS_REQUIRED'; end if;
  for v_row in select value from jsonb_array_elements(v_plan.characteristics) loop
   if (select count(*) from jsonb_array_elements(p_data->'readings') r where r->>'key'=v_row->>'key')<>1 then raise exception 'MEASUREMENTS_REQUIRED'; end if;
   select r into v_reading from jsonb_array_elements(p_data->'readings') r where r->>'key'=v_row->>'key';
   if jsonb_typeof(v_reading->'values') is distinct from 'array' or jsonb_array_length(v_reading->'values')<>v_plan.sample_size then raise exception 'SAMPLE_COUNT_MISMATCH'; end if;
   if v_row->>'type'='numeric' and (v_reading->>'uom') is distinct from v_row->>'uom' then raise exception 'UOM_MISMATCH'; end if;
   for v_value in select value from jsonb_array_elements(v_reading->'values') loop
    v_key:=v_value#>>'{}';
    if v_row->>'type'='numeric' then
     if v_key is null or v_key !~ '^-?\d{1,12}(\.\d{1,6})?$' then raise exception 'INVALID_MEASUREMENT'; end if;
     v_num:=v_key::numeric; v_min:=(v_row->>'min')::numeric; v_max:=(v_row->>'max')::numeric;
     if v_num<v_min or v_num>v_max then v_pass:=false; end if;
    else
     if char_length(trim(coalesce(v_key,''))) not between 1 and 160 then raise exception 'MEASUREMENTS_REQUIRED'; end if;
     if lower(trim(v_key))<>lower(trim(v_row->>'expected')) then v_pass:=false; end if;
    end if;
   end loop;
  end loop;
  insert into public.inspections(company_id,plan_id,lot_id,job_card_id,lot_revision,job_revision,kind,readings,result,reason,inspector_id,supersedes_id)
   values(p_company_id,v_plan.id,v_lot.id,v_job.id,v_lot.revision,v_job.revision,p_data->>'kind',p_data->'readings',case when v_pass then 'passed' else 'failed' end,trim(p_data->>'reason'),(select auth.uid()),(p_data->>'supersedes_id')::uuid) returning id into v_id;
 elsif p_action='create_ncr' then
  select * into v_lot from public.stock_lots where id=(p_data->>'lot_id')::uuid and company_id=p_company_id for update;
  if not found then raise exception 'LOT_NOT_FOUND'; end if;
  if v_lot.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
  v_qty:=private.factory_quantity(p_data,'quantity');
  select coalesce(sum(quantity_delta),0) into v_balance from public.stock_ledger_entries where lot_id=v_lot.id;
  if v_qty>v_balance then raise exception 'INSUFFICIENT_ON_HAND_STOCK'; end if;
  if exists(select 1 from public.ncrs where lot_id=v_lot.id and status<>'resolved') then raise exception 'NCR_ALREADY_OPEN'; end if;
  select base_uom into v_uom from public.items where id=v_lot.item_id;
  insert into public.ncrs(company_id,lot_id,inspection_id,quantity,uom,reason) values(p_company_id,v_lot.id,(select id from public.inspections where lot_id=v_lot.id order by recorded_sequence desc limit 1),v_qty,v_uom,trim(p_data->>'reason')) returning id into v_id;
  update public.stock_lots set qc_status='hold',revision=revision+1,updated_at=now() where id=v_lot.id;
 elsif p_action='resolve_ncr' then
  select * into v_ncr from public.ncrs where id=(p_data->>'ncr_id')::uuid and company_id=p_company_id;
  if not found then raise exception 'NCR_NOT_FOUND'; end if;
  perform 1 from public.work_orders w join public.production_outputs o on o.work_order_id=w.id where o.lot_id=v_ncr.lot_id for no key update of w;
  select * into v_lot from public.stock_lots where id=v_ncr.lot_id and company_id=p_company_id for update;
  select * into v_ncr from public.ncrs where id=(p_data->>'ncr_id')::uuid and company_id=p_company_id for update;
  if not found or v_ncr.status<>'open' then raise exception 'INVALID_TRANSITION'; end if;
  if v_ncr.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
  if char_length(trim(coalesce(p_data->>'reason',''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
  if p_data->>'disposition'='scrap' then
   select coalesce(sum(quantity_delta),0) into v_balance from public.stock_ledger_entries where lot_id=v_lot.id;
   select coalesce(sum(quantity-consumed_quantity),0) into v_reserved from public.stock_reservations where lot_id=v_lot.id and status='active';
   if v_ncr.quantity>v_balance-v_reserved then raise exception 'INSUFFICIENT_AVAILABLE_STOCK'; end if;
   insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by,reason)
    values(p_company_id,v_lot.id,v_lot.item_id,v_lot.location_id,'issue',-v_ncr.quantity,v_ncr.uom,'ncr_scrap',v_ncr.id,p_idempotency_key,(select auth.uid()),trim(p_data->>'reason'));
   update public.stock_lots set qc_status=case when v_balance=v_ncr.quantity then 'rejected' else 'hold' end,revision=revision+1,updated_at=now() where id=v_lot.id;
  elsif p_data->>'disposition'='supplier_return' then
   if not exists(select 1 from public.goods_receipts where lot_id=v_lot.id) then raise exception 'RECEIPT_NOT_FOUND'; end if;
  elsif p_data->>'disposition'='rework' then
   select * into v_pkg from public.engineering_packages where id=(p_data->>'package_id')::uuid and company_id=p_company_id and item_id=v_lot.item_id and status='approved';
   if not found or not exists(select 1 from public.bom_lines where bom_revision_id=v_pkg.bom_revision_id and component_item_id=v_lot.item_id) then raise exception 'REWORK_PACKAGE_REQUIRED'; end if;
   select w.* into v_wo from public.work_orders w join public.production_outputs o on o.work_order_id=w.id where o.lot_id=v_lot.id;
   insert into public.work_orders(company_id,number,sales_order_line_id,item_id,quantity,uom,bom_revision_id,routing_revision_id,drawing_revision_id,start_date,due_date,created_by,parent_work_order_id,source_ncr_id)
    values(p_company_id,upper(trim(p_data->>'number')),v_wo.sales_order_line_id,v_lot.item_id,v_ncr.quantity,v_ncr.uom,v_pkg.bom_revision_id,v_pkg.routing_revision_id,v_wo.drawing_revision_id,(p_data->>'start_date')::date,(p_data->>'due_date')::date,(select auth.uid()),v_wo.id,v_ncr.id) returning id into v_parent;
   insert into public.work_order_requirements(company_id,work_order_id,item_id,required_quantity,uom)
    select p_company_id,v_parent,l.component_item_id,ceil(l.quantity*v_ncr.quantity/b.output_basis_quantity*(1+l.scrap_allowance_pct/100)*1000000)/1000000,l.uom from public.bom_lines l join public.bom_revisions b on b.id=l.bom_revision_id where l.bom_revision_id=v_pkg.bom_revision_id;
   if not exists(select 1 from public.work_order_requirements where work_order_id=v_parent and item_id=v_lot.item_id and required_quantity=v_ncr.quantity) then raise exception 'REWORK_PACKAGE_REQUIRED'; end if;
  elsif p_data->>'disposition'='reinspect' then
   update public.stock_lots set qc_status='hold',revision=revision+1,updated_at=now() where id=v_lot.id;
  else raise exception 'INVALID_TRANSITION'; end if;
  update public.ncrs set disposition=p_data->>'disposition',review_reason=trim(p_data->>'reason'),reviewed_by=(select auth.uid()),
   status=case p_data->>'disposition' when 'supplier_return' then 'awaiting_return' when 'rework' then 'awaiting_rework' else 'resolved' end,revision=revision+1 where id=v_ncr.id; v_id:=v_ncr.id;
 end if;
 return private.finish_material_command(p_company_id,'quality.'||p_action,p_idempotency_key,v_request,v_id,
  case when p_action like '%plan' then 'inspection_plan' when p_action='inspect' then 'inspection' else 'ncr' end,p_data->>'reason');
end $$;
revoke all on function public.quality_command(uuid,text,jsonb,text) from public,anon;
grant execute on function public.quality_command(uuid,text,jsonb,text) to authenticated;
create trigger immutable_approved_inspection_plan before update on public.inspection_plans for each row execute function private.prevent_approved_revision_change();

create or replace function public.release_stock_lot(p_company_id uuid,p_lot_id uuid,p_expected_revision integer,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_lot public.stock_lots%rowtype;v_inspection public.inspections%rowtype;v_request jsonb:=jsonb_build_array(p_lot_id,p_expected_revision);
begin
 v_id:=private.begin_material_command(p_company_id,'quality.release','release_stock_lot',p_idempotency_key,v_request); if v_id is not null then return v_id; end if;
 select * into v_lot from public.stock_lots where id=p_lot_id and company_id=p_company_id for update;
 if not found then raise exception 'LOT_NOT_FOUND'; end if;
 if v_lot.revision is distinct from p_expected_revision then raise exception 'REVISION_CONFLICT'; end if;
 if v_lot.qc_status<>'hold' then raise exception 'INVALID_TRANSITION'; end if;
 if exists(select 1 from public.ncrs where lot_id=v_lot.id and status<>'resolved') then raise exception 'NCR_OPEN'; end if;
 select * into v_inspection from public.inspections where lot_id=v_lot.id order by recorded_sequence desc limit 1;
 if not found or v_inspection.result<>'passed' or v_inspection.lot_revision<>v_lot.revision then raise exception 'INSPECTION_REQUIRED'; end if;
 update public.stock_lots set qc_status='released',revision=revision+1,updated_at=now() where id=v_lot.id;
 return private.finish_material_command(p_company_id,'release_stock_lot',p_idempotency_key,v_request,p_lot_id,'stock_lot');
end $$;

create function private.guard_factory_shipping() returns trigger language plpgsql security definer set search_path='' as $$
declare v_lot public.stock_lots%rowtype;v_id uuid;
begin
 if tg_table_name='packing_order_lines' then
  select lot_id into v_id from public.stock_reservations where id=new.reservation_id and company_id=new.company_id;
  select * into v_lot from public.stock_lots where id=v_id for update;
  if v_lot.qc_status is distinct from 'released' then raise exception 'LOT_QC_HOLD'; end if;
 elsif new.status='dispatched' and old.status<>'dispatched' then
  for v_lot in select l.* from public.stock_lots l join public.shipment_lines s on s.lot_id=l.id where s.shipment_id=new.id order by l.id for update of l loop
   if v_lot.qc_status<>'released' then raise exception 'LOT_QC_HOLD'; end if;
  end loop;
 end if; return new;
end $$;
revoke all on function private.guard_factory_shipping() from public,anon,authenticated;
create trigger qc_before_packing before insert on public.packing_order_lines for each row execute function private.guard_factory_shipping();
create trigger qc_before_dispatch before update on public.shipments for each row execute function private.guard_factory_shipping();

create function private.finish_supplier_return_ncr() returns trigger language plpgsql security definer set search_path='' as $$
declare n public.ncrs%rowtype;v_lot uuid;
begin
 select lot_id into v_lot from public.goods_receipts where id=new.receipt_id;
 for n in select * from public.ncrs where lot_id=v_lot and status='awaiting_return' for update loop
  if (select coalesce(sum(t.quantity),0) from public.goods_returns t join public.goods_receipts r on r.id=t.receipt_id where r.lot_id=v_lot and t.created_at>=n.created_at)>=n.quantity then
   update public.ncrs set status='resolved',revision=revision+1 where id=n.id;
   insert into public.audit_log(company_id,actor_id,entity_type,entity_id,action,reason) values(n.company_id,(select auth.uid()),'ncr',n.id,'ncr.supplier_return_completed',new.reason);
  end if;
 end loop; return new;
end $$;
revoke all on function private.finish_supplier_return_ncr() from public,anon,authenticated;
create trigger ncr_supplier_return after insert on public.goods_returns for each row execute function private.finish_supplier_return_ncr();

insert into public.role_permissions(role,permission_code) values
 ('operator','master_data.read'),('operator','quality.read'),('production_supervisor','quality.read'),
 ('engineering','stock.read'),('auditor','stock.read') on conflict do nothing;

create function public.get_production_workspace(p_company_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'packages',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'item_id',p.item_id,'label',p.label,'status',p.status,
  'bom_revision_id',p.bom_revision_id,'routing_revision_id',p.routing_revision_id,'basis_quantity',b.output_basis_quantity::text,'uom',b.output_basis_uom,
  'components',coalesce((select jsonb_agg(jsonb_build_object('item_id',component_item_id,'quantity',quantity::text,'uom',uom,'scrap_allowance_pct',scrap_allowance_pct::text) order by created_at,id) from public.bom_lines where bom_revision_id=p.bom_revision_id),'[]'::jsonb),
  'operations',coalesce((select jsonb_agg(jsonb_build_object('sequence',sequence,'work_centre_id',work_centre_id,'name',operation_name) order by sequence) from public.routing_operations where routing_revision_id=p.routing_revision_id),'[]'::jsonb)) order by p.label) from public.engineering_packages p join public.bom_revisions b on b.id=p.bom_revision_id where p.company_id=p_company_id),'[]'::jsonb),
 'demand',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'order_number',o.sales_order_number,'item_id',s.item_id,'ordered_quantity',s.ordered_quantity::text,'uom',s.uom,'promised_date',o.promised_date,
  'planned_quantity',coalesce(w.planned,0)::text,'remaining_to_plan',greatest(s.ordered_quantity-coalesce(w.planned,0)-coalesce(r.committed,0),0)::text) order by o.promised_date nulls last)
  from public.sales_order_lines s join public.sales_orders o on o.id=s.sales_order_id
  left join lateral(select planned_quantity planned from public.production_demand_commitments where sales_order_line_id=s.id) w on true
  left join lateral(select sum(case when r.status='active' then r.quantity else r.consumed_quantity end) committed from public.stock_reservations r where r.sales_order_line_id=s.id and not exists(select 1 from public.production_outputs p join public.work_orders wo on wo.id=p.work_order_id where p.lot_id=r.lot_id and wo.sales_order_line_id=s.id)) r on true
  where s.company_id=p_company_id and o.status in ('open','partially_shipped')),'[]'::jsonb),
 'works',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'number',w.number,'sales_order_line_id',w.sales_order_line_id,'item_id',w.item_id,'quantity',w.quantity::text,'uom',w.uom,
  'status',w.status,'revision',w.revision,'start_date',w.start_date,'due_date',w.due_date,'bom_revision_id',w.bom_revision_id,'routing_revision_id',w.routing_revision_id,'drawing_revision_id',w.drawing_revision_id,'source_ncr_id',w.source_ncr_id,
  'approved_rework_lot_id',(select lot_id from public.ncrs where id=w.source_ncr_id and status='awaiting_rework')) order by w.due_date) from public.work_orders w where w.company_id=p_company_id),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'work_order_id',j.work_order_id,'sequence',j.sequence,'name',j.name,'work_centre_id',j.work_centre_id,'planned_quantity',j.planned_quantity::text,
  'good_quantity',j.good_quantity::text,'scrap_quantity',j.scrap_quantity::text,'uom',j.uom,'status',j.status,'revision',j.revision) order by j.work_order_id,j.sequence) from public.job_cards j where j.company_id=p_company_id),'[]'::jsonb),
 'requirements',coalesce((select jsonb_agg(jsonb_build_object('work_order_id',r.work_order_id,'item_id',r.item_id,'required_quantity',r.required_quantity::text,'uom',r.uom,'consumed_quantity',r.consumed_quantity::text,
  'wip_quantity',r.wip_quantity::text,'available_quantity',r.available_quantity::text,'expected_receipts',r.expected_receipts::text)) from public.production_material_positions r where r.company_id=p_company_id),'[]'::jsonb),
 'issues',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'work_order_id',i.work_order_id,'job_card_id',i.job_card_id,'lot_id',i.lot_id,'item_id',i.item_id,'quantity',i.quantity::text,'remaining_quantity',i.remaining_quantity::text,'uom',i.uom)) from public.material_issue_positions i where i.company_id=p_company_id),'[]'::jsonb),
 'outputs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'work_order_id',work_order_id,'lot_id',lot_id,'quantity',quantity::text,'uom',uom)) from public.production_outputs where company_id=p_company_id),'[]'::jsonb),
 'workCentres',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name)) from public.work_centres where company_id=p_company_id and active),'[]'::jsonb)
);
$$;
create function public.get_quality_workspace(p_company_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'item_id',item_id,'label',label,'version',version,'sample_size',sample_size,'characteristics',characteristics,'status',status) order by label,version) from public.inspection_plans where company_id=p_company_id),'[]'::jsonb),
 'inspections',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'lot_id',lot_id,'job_card_id',job_card_id,'kind',kind,'result',result,'lot_revision',lot_revision,'reason',reason,'inspector_id',inspector_id,'created_at',created_at,'readings',readings,'supersedes_id',supersedes_id) order by recorded_sequence desc) from public.inspections where company_id=p_company_id),'[]'::jsonb),
 'ncrs',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'lot_id',n.lot_id,'inspection_id',n.inspection_id,'quantity',n.quantity::text,'uom',n.uom,'reason',n.reason,'status',n.status,'disposition',n.disposition,'revision',n.revision,'review_reason',n.review_reason,
  'rework_work_order_id',(select id from public.work_orders where source_ncr_id=n.id limit 1)) order by n.created_at desc) from public.ncrs n where n.company_id=p_company_id),'[]'::jsonb),
 'genealogy',coalesce((select jsonb_agg(jsonb_build_object('id',id,'parent_lot_id',parent_lot_id,'child_lot_id',child_lot_id,'work_order_id',work_order_id,'source_issue_id',source_issue_id)) from public.lot_genealogy where company_id=p_company_id),'[]'::jsonb),
 'receipts',coalesce((select jsonb_agg(jsonb_build_object('lot_id',r.lot_id,'supplier_lot',r.supplier_lot,'certificate_reference',r.certificate_reference,'supplier_name',s.name)) from public.goods_receipts r join public.purchase_orders o on o.id=r.purchase_order_id join public.suppliers s on s.id=o.supplier_id where r.company_id=p_company_id),'[]'::jsonb),
 'shipments',coalesce((select jsonb_agg(jsonb_build_object('lot_id',l.lot_id,'shipment_id',s.id,'shipment_number',s.shipment_number,'status',s.status,'quantity',l.quantity::text,'uom',i.base_uom)) from public.shipment_lines l join public.shipments s on s.id=l.shipment_id join public.stock_lots lot on lot.id=l.lot_id join public.items i on i.id=lot.item_id where l.company_id=p_company_id),'[]'::jsonb)
);
$$;
revoke all on function public.get_production_workspace(uuid),public.get_quality_workspace(uuid) from public,anon;
grant execute on function public.get_production_workspace(uuid),public.get_quality_workspace(uuid) to authenticated;

-- ADR 0017: factory records participate in company-scoped search.
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
    union all
    select 'Work order', w.id, w.number from public.work_orders w where w.company_id=p_company_id
    union all
    select 'Job card', j.id, w.number || ' / ' || j.sequence::text || ' — ' || j.name from public.job_cards j join public.work_orders w on w.id=j.work_order_id where j.company_id=p_company_id
    union all
    select 'Inspection', i.id, coalesce(l.lot_code,w.number) || ' — ' || i.kind || ' ' || i.result || ' ' || i.id::text from public.inspections i left join public.stock_lots l on l.id=i.lot_id left join public.job_cards j on j.id=i.job_card_id left join public.work_orders w on w.id=j.work_order_id where i.company_id=p_company_id
    union all
    select 'NCR', n.id, l.lot_code || ' — NCR ' || n.status || ' ' || n.id::text from public.ncrs n join public.stock_lots l on l.id=n.lot_id where n.company_id=p_company_id
  ) candidate
  where strpos(lower(candidate.label), v_query) > 0
  order by candidate.label
  limit 20;
end;
$$;

revoke all on function public.search_company_records(uuid, text) from public, anon;
grant execute on function public.search_company_records(uuid, text) to authenticated;

-- ADR 0017: legacy stock commands obey the same custody, planning and revision boundaries.
create function private.guard_factory_receipt() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.source_type='finished_goods_receipt' then
  if exists(select 1 from public.goods_receipts where lot_id=new.lot_id) or exists(select 1 from public.production_outputs where lot_id=new.lot_id) then raise exception 'MANAGED_LOT_RECEIPT'; end if;
  if exists(select 1 from public.stock_ledger_entries where lot_id=new.lot_id) then
   update public.stock_lots set revision=revision+1 where id=new.lot_id;
  end if;
 end if; return new;
end $$;
revoke all on function private.guard_factory_receipt() from public,anon,authenticated;
create trigger factory_receipt_guard before insert on public.stock_ledger_entries for each row execute function private.guard_factory_receipt();

create function private.guard_factory_reservation() returns trigger language plpgsql security definer set search_path='' as $$
declare v_line public.sales_order_lines%rowtype;v_committed numeric;v_planned numeric;
begin
 perform 1 from public.sales_orders where id=(select sales_order_id from public.sales_order_lines where id=new.sales_order_line_id) for update;
 select * into v_line from public.sales_order_lines where id=new.sales_order_line_id;
 if not exists(select 1 from public.production_outputs p join public.work_orders w on w.id=p.work_order_id where p.lot_id=new.lot_id and w.sales_order_line_id=v_line.id) then
  select planned_quantity into v_planned from public.production_demand_commitments where sales_order_line_id=v_line.id;
  select coalesce(sum(case when r.status='active' then r.quantity else r.consumed_quantity end),0) into v_committed from public.stock_reservations r
   where r.sales_order_line_id=v_line.id and not exists(select 1 from public.production_outputs p join public.work_orders w on w.id=p.work_order_id where p.lot_id=r.lot_id and w.sales_order_line_id=v_line.id);
  if v_planned+v_committed+new.quantity>v_line.ordered_quantity then raise exception 'ORDER_QUANTITY_EXCEEDED'; end if;
 end if;return new;
end $$;
revoke all on function private.guard_factory_reservation() from public,anon,authenticated;
create trigger factory_reservation_guard before insert on public.stock_reservations for each row execute function private.guard_factory_reservation();

create function private.guard_engineering_lines() returns trigger language plpgsql security definer set search_path='' as $$
declare v_old uuid;v_new uuid;v_row record;
begin
 if tg_table_name='bom_lines' then
  if tg_op<>'INSERT' then v_old:=old.bom_revision_id; end if;
  if tg_op<>'DELETE' then v_new:=new.bom_revision_id; end if;
  for v_row in select id,status from public.bom_revisions where id in (v_old,v_new) order by id for update loop
   if v_row.status<>'draft' then raise exception 'APPROVED_REVISION_IMMUTABLE'; end if;
  end loop;
 else
  if tg_op<>'INSERT' then v_old:=old.routing_revision_id; end if;
  if tg_op<>'DELETE' then v_new:=new.routing_revision_id; end if;
  for v_row in select id,status from public.routing_revisions where id in (v_old,v_new) order by id for update loop
   if v_row.status<>'draft' then raise exception 'APPROVED_REVISION_IMMUTABLE'; end if;
  end loop;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.guard_engineering_lines() from public,anon,authenticated;
create trigger factory_bom_line_guard before insert or update or delete on public.bom_lines for each row execute function private.guard_engineering_lines();
create trigger factory_routing_line_guard before insert or update or delete on public.routing_operations for each row execute function private.guard_engineering_lines();

create function private.guard_engineering_uom() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.base_uom<>old.base_uom and (
  exists(select 1 from public.bom_lines l join public.bom_revisions r on r.id=l.bom_revision_id where l.component_item_id=old.id and r.status='approved') or
  exists(select 1 from public.boms b join public.bom_revisions r on r.bom_id=b.id where b.output_item_id=old.id and r.status='approved')
 ) then raise exception 'UOM_IN_USE';end if;return new;
end $$;
revoke all on function private.guard_engineering_uom() from public,anon,authenticated;
create trigger factory_item_uom_guard before update on public.items for each row execute function private.guard_engineering_uom();

-- ADR 0017: cancellation recovers prepared allocations without rewriting stock or dispatch history.
create function public.cancel_prepared_shipment(p_company_id uuid,p_shipment_id uuid,p_expected_shipment_revision integer,p_reason text,p_idempotency_key text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_request jsonb;v_ship public.shipments%rowtype;
begin
 v_request:=jsonb_build_object('shipment',p_shipment_id,'revision',p_expected_shipment_revision,'reason',p_reason);
 v_id:=private.begin_material_command(p_company_id,'dispatch.manage','cancel_prepared_shipment',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 if char_length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 select * into v_ship from public.shipments where id=p_shipment_id and company_id=p_company_id for update;
 if not found then raise exception 'SHIPMENT_NOT_FOUND';end if;
 perform 1 from public.packing_orders where id=v_ship.packing_order_id for update;
 if v_ship.revision is distinct from p_expected_shipment_revision then raise exception 'REVISION_CONFLICT';end if;
 if v_ship.status<>'draft' then raise exception 'INVALID_TRANSITION';end if;
 update public.shipments set status='cancelled',revision=revision+1 where id=v_ship.id;
 update public.packing_orders set status='cancelled',revision=revision+1 where id=v_ship.packing_order_id;
 return private.finish_material_command(p_company_id,'cancel_prepared_shipment',p_idempotency_key,v_request,v_ship.id,'shipment',p_reason);
end $$;
create function public.release_stock_reservation(p_company_id uuid,p_reservation_id uuid,p_reason text,p_expected_sales_order_revision integer,p_idempotency_key text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_request jsonb;v_so public.sales_orders%rowtype;v_res public.stock_reservations%rowtype;
begin
 v_request:=jsonb_build_object('reservation',p_reservation_id,'revision',p_expected_sales_order_revision,'reason',p_reason);
 v_id:=private.begin_material_command(p_company_id,'stock.reserve','release_stock_reservation',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 if char_length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 select o.* into v_so from public.sales_orders o join public.sales_order_lines l on l.sales_order_id=o.id join public.stock_reservations r on r.sales_order_line_id=l.id where r.id=p_reservation_id and r.company_id=p_company_id for update of o;
 if not found then raise exception 'RESERVATION_NOT_FOUND';end if;
 select * into v_res from public.stock_reservations where id=p_reservation_id and company_id=p_company_id for update;
 if v_so.revision is distinct from p_expected_sales_order_revision then raise exception 'REVISION_CONFLICT';end if;
 if v_res.status<>'active' then raise exception 'INVALID_TRANSITION';end if;
 if exists(select 1 from public.packing_order_lines l join public.packing_orders p on p.id=l.packing_order_id where l.reservation_id=v_res.id and p.status='packed') then raise exception 'PACKING_PENDING';end if;
 update public.stock_reservations set status='released',released_at=now() where id=v_res.id;
 update public.sales_orders set revision=revision+1 where id=v_so.id;
 return private.finish_material_command(p_company_id,'release_stock_reservation',p_idempotency_key,v_request,v_res.id,'stock_reservation',p_reason);
end $$;
revoke all on function public.cancel_prepared_shipment(uuid,uuid,integer,text,text),public.release_stock_reservation(uuid,uuid,text,integer,text) from public,anon;
grant execute on function public.cancel_prepared_shipment(uuid,uuid,integer,text,text),public.release_stock_reservation(uuid,uuid,text,integer,text) to authenticated;
