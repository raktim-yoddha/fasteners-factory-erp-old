-- ADR 0017: immutable customer part definitions; existing commercial/engineering pins survive retirement.
insert into public.permission_definitions(code,description) values
 ('customer_parts.read','Read customer part numbers and their controlled item/drawing references.'),
 ('customer_parts.manage','Record and retire customer part references with a reason.') on conflict do nothing;
insert into public.role_permissions(role,permission_code)
 select role,'customer_parts.read' from public.role_permissions where permission_code='master_data.read' on conflict do nothing;
insert into public.role_permissions(role,permission_code) values
 ('admin','customer_parts.manage'),('sales','customer_parts.manage'),('engineering','customer_parts.manage'),('auditor','customer_parts.read') on conflict do nothing;
create table public.customer_item_references (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,customer_id uuid not null,item_id uuid not null,
 part_number text not null check(char_length(trim(part_number)) between 1 and 80 and part_number=upper(trim(part_number))),
 part_revision text not null default '' check(char_length(trim(part_revision)) between 0 and 24 and part_revision=upper(trim(part_revision))),
 reference_version integer not null check(reference_version>0),
 description text not null check(char_length(trim(description)) between 1 and 500),drawing_revision_id uuid,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 retired_at timestamptz,retired_by uuid references auth.users(id),retirement_reason text,
 unique(id,company_id),unique(company_id,customer_id,part_number,part_revision,reference_version),
 foreign key(customer_id,company_id) references public.customers(id,company_id),
 foreign key(item_id,company_id) references public.items(id,company_id),
 foreign key(drawing_revision_id,company_id) references public.drawing_revisions(id,company_id),
 check((retired_at is null and retired_by is null and retirement_reason is null) or
  (retired_at is not null and retired_by is not null and retirement_reason is not null and char_length(trim(retirement_reason)) between 1 and 2000))
);
alter table public.customer_item_references enable row level security;
revoke all on public.customer_item_references from public,anon,authenticated;
grant select on public.customer_item_references to authenticated;
create policy permitted_customer_parts on public.customer_item_references for select to authenticated
 using((select private.has_company_permission(company_id,'customer_parts.read')));
create index on public.customer_item_references(company_id,item_id);
create index on public.customer_item_references(company_id,drawing_revision_id);
create unique index customer_part_current_unique on public.customer_item_references(company_id,customer_id,part_number,part_revision) where retired_at is null;
create function private.guard_customer_part_definition() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'CUSTOMER_PART_IMMUTABLE';end if;
 if old.retired_at is not null or
  (to_jsonb(new)-array['retired_at','retired_by','retirement_reason']) is distinct from (to_jsonb(old)-array['retired_at','retired_by','retirement_reason'])
  or new.retired_at is null then raise exception 'CUSTOMER_PART_IMMUTABLE';end if;
 return new;
end $$;
revoke all on function private.guard_customer_part_definition() from public,anon,authenticated;
create trigger customer_part_definition_guard before update or delete on public.customer_item_references
 for each row execute function private.guard_customer_part_definition();
create function public.create_customer_part_reference(p_company_id uuid,p_data jsonb,p_idempotency_key text)
 returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_item uuid;v_drawing uuid;v_customer uuid;v_version integer;v_number text;v_revision text;
begin
 v_id:=private.begin_material_command(p_company_id,'customer_parts.manage','create_customer_part_reference',p_idempotency_key,p_data);if v_id is not null then return v_id;end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 v_item:=(p_data->>'item_id')::uuid;v_drawing:=(p_data->>'drawing_revision_id')::uuid;v_customer:=(p_data->>'customer_id')::uuid;
 v_number:=upper(trim(p_data->>'part_number'));v_revision:=coalesce(upper(trim(p_data->>'part_revision')),'');
 if not exists(select 1 from public.customers where id=v_customer and company_id=p_company_id and active) then raise exception 'CUSTOMER_NOT_FOUND';end if;
 if not exists(select 1 from public.items where id=v_item and company_id=p_company_id and active) then raise exception 'ITEM_NOT_FOUND';end if;
 if v_drawing is not null and not exists(select 1 from public.drawing_revisions r join public.drawings d on d.id=r.drawing_id
  where r.id=v_drawing and r.company_id=p_company_id and r.status='approved' and d.item_id=v_item) then raise exception 'ENGINEERING_REVISION_ITEM_MISMATCH';end if;
 if p_data->>'reason' is null or char_length(trim(p_data->>'reason')) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':customer-part:'||v_customer::text||':'||v_number||':'||v_revision,0));
 if exists(select 1 from public.customer_item_references where company_id=p_company_id and customer_id=v_customer and part_number=v_number and part_revision=v_revision and retired_at is null) then raise exception 'CUSTOMER_PART_ACTIVE_EXISTS';end if;
 select coalesce(max(reference_version),0)+1 into v_version from public.customer_item_references where company_id=p_company_id and customer_id=v_customer and part_number=v_number and part_revision=v_revision;
 insert into public.customer_item_references(company_id,customer_id,item_id,part_number,part_revision,reference_version,description,drawing_revision_id,created_by)
 values(p_company_id,v_customer,v_item,v_number,v_revision,v_version,trim(p_data->>'description'),v_drawing,(select auth.uid())) returning id into v_id;
 return private.finish_material_command(p_company_id,'create_customer_part_reference',p_idempotency_key,p_data,v_id,'customer_part_reference',trim(p_data->>'reason'));
end $$;
create function public.retire_customer_part_reference(p_company_id uuid,p_reference_id uuid,p_reason text,p_idempotency_key text)
 returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_part public.customer_item_references%rowtype;v_request jsonb:=jsonb_build_array(p_reference_id,p_reason);
begin
 v_id:=private.begin_material_command(p_company_id,'customer_parts.manage','retire_customer_part_reference',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 select * into v_part from public.customer_item_references where id=p_reference_id and company_id=p_company_id for update;
 if not found then raise exception 'CUSTOMER_PART_NOT_FOUND';end if;
 if v_part.retired_at is not null then raise exception 'INVALID_TRANSITION';end if;
 if p_reason is null or char_length(trim(p_reason)) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 update public.customer_item_references set retired_at=now(),retired_by=(select auth.uid()),retirement_reason=trim(p_reason) where id=v_part.id;
 return private.finish_material_command(p_company_id,'retire_customer_part_reference',p_idempotency_key,v_request,v_part.id,'customer_part_reference',trim(p_reason));
end $$;
create function public.get_customer_part_workspace(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'customer_parts.read') then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('customer_name',c.name,'customer_code',c.code,'sku',i.sku,
  'drawing_label',case when dr.id is not null then d.drawing_number||' Rev '||dr.revision end) order by c.name,r.part_number,r.part_revision,r.id)
  from public.customer_item_references r join public.customers c on c.id=r.customer_id join public.items i on i.id=r.item_id
  left join public.drawing_revisions dr on dr.id=r.drawing_revision_id left join public.drawings d on d.id=dr.drawing_id
  where r.company_id=p_company_id),'[]'::jsonb);
end $$;
revoke all on function public.create_customer_part_reference(uuid,jsonb,text),public.retire_customer_part_reference(uuid,uuid,text,text),public.get_customer_part_workspace(uuid) from public,anon;
grant execute on function public.create_customer_part_reference(uuid,jsonb,text),public.retire_customer_part_reference(uuid,uuid,text,text),public.get_customer_part_workspace(uuid) to authenticated;

alter table public.quotation_lines add column customer_part_reference_id uuid,
 add foreign key(customer_part_reference_id,company_id) references public.customer_item_references(id,company_id);
alter table public.sales_order_lines add column customer_part_reference_id uuid,
 add foreign key(customer_part_reference_id,company_id) references public.customer_item_references(id,company_id);
alter table public.work_orders add column customer_part_reference_id uuid,
 add foreign key(customer_part_reference_id,company_id) references public.customer_item_references(id,company_id);
create index on public.quotation_lines(company_id,customer_part_reference_id);
create index on public.sales_order_lines(company_id,customer_part_reference_id);
create index on public.work_orders(company_id,customer_part_reference_id);
create function private.pin_customer_part_reference() returns trigger language plpgsql security definer set search_path='' as $$
declare v_part public.customer_item_references%rowtype;v_customer uuid;v_expected uuid;
begin
 if tg_op='UPDATE' then
  if new.customer_part_reference_id is distinct from old.customer_part_reference_id
   or (old.customer_part_reference_id is not null and (new.company_id,new.item_id,new.drawing_revision_id) is distinct from (old.company_id,old.item_id,old.drawing_revision_id)) then raise exception 'CUSTOMER_PART_IMMUTABLE';end if;
  if old.customer_part_reference_id is not null then
   if tg_table_name='quotation_lines' then
    if new.quotation_id is distinct from old.quotation_id then raise exception 'CUSTOMER_PART_IMMUTABLE';end if;
   elsif tg_table_name='sales_order_lines' then
    if (new.sales_order_id,new.quotation_line_id) is distinct from (old.sales_order_id,old.quotation_line_id) then raise exception 'CUSTOMER_PART_IMMUTABLE';end if;
   elsif tg_table_name='work_orders' then
    if new.sales_order_line_id is distinct from old.sales_order_line_id then raise exception 'CUSTOMER_PART_IMMUTABLE';end if;
   end if;
  end if;
  return new;
 end if;
 if tg_table_name='quotation_lines' then
  if new.customer_part_reference_id is null then return new;end if;
  select customer_id into v_customer from public.quotations where id=new.quotation_id and company_id=new.company_id;
  select * into v_part from public.customer_item_references where id=new.customer_part_reference_id and company_id=new.company_id for update;
  if not found or v_part.customer_id is distinct from v_customer or v_part.item_id is distinct from new.item_id then raise exception 'CUSTOMER_PART_CONTEXT_MISMATCH';end if;
  if v_part.retired_at is not null then raise exception 'CUSTOMER_PART_RETIRED';end if;
  if v_part.drawing_revision_id is not null and v_part.drawing_revision_id is distinct from new.drawing_revision_id then raise exception 'CUSTOMER_PART_DRAWING_MISMATCH';end if;
 elsif tg_table_name='sales_order_lines' then
  select customer_part_reference_id into v_expected from public.quotation_lines where id=new.quotation_line_id and company_id=new.company_id;
  if new.customer_part_reference_id is not null and new.customer_part_reference_id is distinct from v_expected then raise exception 'CUSTOMER_PART_CONTEXT_MISMATCH';end if;
  new.customer_part_reference_id:=v_expected;
  select customer_id into v_customer from public.sales_orders where id=new.sales_order_id and company_id=new.company_id;
 elsif tg_table_name='work_orders' then
  select customer_part_reference_id into v_expected from public.sales_order_lines where id=new.sales_order_line_id and company_id=new.company_id;
  if new.customer_part_reference_id is not null and new.customer_part_reference_id is distinct from v_expected then raise exception 'CUSTOMER_PART_CONTEXT_MISMATCH';end if;
  new.customer_part_reference_id:=v_expected;
  select o.customer_id into v_customer from public.sales_order_lines l join public.sales_orders o on o.id=l.sales_order_id where l.id=new.sales_order_line_id and l.company_id=new.company_id;
 end if;
 if tg_table_name<>'quotation_lines' and new.customer_part_reference_id is not null then
  select * into v_part from public.customer_item_references where id=new.customer_part_reference_id and company_id=new.company_id;
  if not found or v_part.item_id is distinct from new.item_id or v_part.customer_id is distinct from v_customer
   or (v_part.drawing_revision_id is not null and v_part.drawing_revision_id is distinct from new.drawing_revision_id) then raise exception 'CUSTOMER_PART_CONTEXT_MISMATCH';end if;
 end if;
 return new;
end $$;
revoke all on function private.pin_customer_part_reference() from public,anon,authenticated;
create trigger b_pin_customer_part_reference before insert or update on public.quotation_lines for each row execute function private.pin_customer_part_reference();
create trigger b_pin_customer_part_reference before insert or update on public.sales_order_lines for each row execute function private.pin_customer_part_reference();
create trigger b_pin_customer_part_reference before insert or update on public.work_orders for each row execute function private.pin_customer_part_reference();
create function private.guard_customer_part_quote_approval() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='approved' and old.status<>'approved' then
  perform 1 from public.customer_item_references r join public.quotation_lines q on q.customer_part_reference_id=r.id
   where q.quotation_id=new.id order by r.id for update of r;
  if exists(select 1 from public.quotation_lines q join public.customer_item_references r on r.id=q.customer_part_reference_id
   where q.quotation_id=new.id and r.retired_at is not null) then raise exception 'CUSTOMER_PART_RETIRED';end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_customer_part_quote_approval() from public,anon,authenticated;
create trigger customer_part_quote_approval_guard before update on public.quotations for each row execute function private.guard_customer_part_quote_approval();


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
  v_hash text;
  v_request jsonb:=jsonb_build_array(p_rfq_id,p_quotation_number,p_currency_code,p_valid_until,p_lines);
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0001'; end if;
  if not (select private.has_company_permission(p_company_id, 'sales.manage')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_quotation_number is null or char_length(trim(p_quotation_number)) = 0 or p_currency_code !~ '^[A-Z]{3}$'
    or p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100
    or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_QUOTATION_REQUEST' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id,request_hash into v_quotation_id,v_hash from public.command_idempotency
  where company_id = p_company_id and command_name = 'create_quotation' and idempotency_key = p_idempotency_key;
  if found then
    if v_hash is not null and v_hash is distinct from md5(v_request::text) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
    return v_quotation_id;
  end if;

  select customer_id into v_customer_id from public.rfqs
  where id = p_rfq_id and company_id = p_company_id and status = 'qualified' for update;
  if not found then raise exception 'RFQ_NOT_QUALIFIED' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid, pricing_source text, customer_part_reference_id uuid)
    left join public.items item on item.id = line.item_id and item.company_id = p_company_id and item.active
    where line.item_id is null or item.id is null or line.quantity is null or line.quantity <= 0
      or line.uom not in ('pcs', 'kg', 'm', 'set') or line.unit_price is null or line.unit_price < 0
  ) then raise exception 'INVALID_QUOTATION_LINE' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid, pricing_source text, customer_part_reference_id uuid)
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
  insert into public.quotation_lines (company_id, quotation_id, item_id, quantity, uom, unit_price, bom_revision_id, routing_revision_id, pricing_source, customer_part_reference_id)
  select p_company_id, v_quotation_id, line.item_id, line.quantity, line.uom, line.unit_price, line.bom_revision_id, line.routing_revision_id, coalesce(nullif(trim(line.pricing_source), ''), 'Manual entry'), line.customer_part_reference_id
  from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid, pricing_source text, customer_part_reference_id uuid);
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id, request_hash)
  values (p_company_id, 'create_quotation', p_idempotency_key, v_quotation_id, md5(v_request::text));
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key)
  values (p_company_id, (select auth.uid()), 'quotation', v_quotation_id, 'quotation.created', p_idempotency_key);
  return v_quotation_id;
end;
$$;

create or replace function public.get_production_workspace(p_company_id uuid) returns jsonb
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
  left join lateral(select sum(case when r.status='active' then r.quantity else r.consumed_quantity end) committed from public.stock_reservations r where r.sales_order_line_id=s.id and not exists(select 1 from public.lot_trace_context t where t.lot_id=r.lot_id and t.sales_order_line_id=s.id)) r on true
  where s.company_id=p_company_id and o.status in ('open','partially_shipped')),'[]'::jsonb),
 'works',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'number',w.number,'sales_order_line_id',w.sales_order_line_id,'item_id',w.item_id,'quantity',w.quantity::text,'uom',w.uom,
  'status',w.status,'revision',w.revision,'start_date',w.start_date,'due_date',w.due_date,'bom_revision_id',w.bom_revision_id,'routing_revision_id',w.routing_revision_id,'drawing_revision_id',w.drawing_revision_id,'customer_part_reference_id',w.customer_part_reference_id,'customer_part_number',(select part_number from public.customer_item_references where id=w.customer_part_reference_id),'customer_part_revision',(select part_revision from public.customer_item_references where id=w.customer_part_reference_id),'source_ncr_id',w.source_ncr_id,
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

create or replace function public.get_packing_workspace(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'dispatch.read') then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object(
 'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'shipment_id',s.id,'shipment_number',s.shipment_number,'shipment_revision',s.revision,'status',s.status,'lot_id',t.id,'lot_code',t.lot_code,'sku',i.sku,'customer_part_number',(select part_number from public.customer_item_references where id=sl.customer_part_reference_id),'customer_part_revision',(select part_revision from public.customer_item_references where id=sl.customer_part_reference_id),'quantity',l.quantity::text,'uom',sl.uom,'packaged_quantity',coalesce(p.quantity,0)::text,'remaining_quantity',(l.quantity-coalesce(p.quantity,0))::text) order by s.created_at desc,l.id)
  from public.shipment_lines l join public.shipments s on s.id=l.shipment_id join public.stock_lots t on t.id=l.lot_id join public.items i on i.id=t.item_id
  join public.stock_reservations r on r.id=l.reservation_id join public.sales_order_lines sl on sl.id=r.sales_order_line_id
  left join lateral(select sum(quantity) quantity from public.shipment_packages where shipment_line_id=l.id) p on true where l.company_id=p_company_id),'[]'::jsonb),
 'packages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'shipment_line_id',shipment_line_id,'package_code',package_code,'quantity',quantity::text,'uom',uom,'created_at',created_at) order by created_at,id) from public.shipment_packages where company_id=p_company_id),'[]'::jsonb)
 );
end $$;
