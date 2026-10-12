-- Deterministic, approved specifications and explicit item-specific unit bases.
insert into public.permission_definitions(code,description) values
 ('item_controls.read','Read controlled specifications and unit conversion history.'),
 ('item_controls.manage','Record specification and conversion proposals.'),
 ('item_controls.approve','Approve or retire controlled specifications and conversions.') on conflict do nothing;
insert into public.role_permissions(role,permission_code)
 select role,'item_controls.read' from public.role_permissions where permission_code='master_data.read' on conflict do nothing;
insert into public.role_permissions(role,permission_code) values
 ('admin','item_controls.manage'),('engineering','item_controls.manage'),('admin','item_controls.approve'),
 ('engineering','item_controls.approve'),('management','item_controls.approve'),('auditor','item_controls.read') on conflict do nothing;
create table public.item_specification_versions (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,item_id uuid not null,version integer not null check(version>0),
 product_type text not null check(char_length(trim(product_type)) between 1 and 120),
 diameter_mm numeric(18,6) check(diameter_mm>0 and diameter_mm<>'NaN'::numeric),
 length_mm numeric(18,6) check(length_mm>0 and length_mm<>'NaN'::numeric),
 thread_pitch_mm numeric(18,6) check(thread_pitch_mm>0 and thread_pitch_mm<>'NaN'::numeric),
 thread_designation text not null default '' check(char_length(thread_designation)<=120),
 material_grade text not null default '' check(char_length(material_grade)<=120),
 property_class text not null default '' check(char_length(property_class)<=120),
 coating text not null default '' check(char_length(coating)<=120),
 standard_reference text not null default '' check(char_length(standard_reference)<=160),
 evidence text not null check(char_length(trim(evidence)) between 1 and 2000),
 status text not null default 'draft' check(status in ('draft','approved','retired')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 approved_by uuid references auth.users(id),approved_at timestamptz,retired_by uuid references auth.users(id),retired_at timestamptz,retirement_reason text,
 unique(id,company_id),unique(company_id,item_id,version),foreign key(item_id,company_id) references public.items(id,company_id),
 check((status='draft' and approved_at is null and approved_by is null and retired_at is null and retired_by is null and retirement_reason is null)
  or (status='approved' and approved_at is not null and approved_by is not null and retired_at is null and retired_by is null and retirement_reason is null)
  or (status='retired' and approved_at is not null and approved_by is not null and retired_at is not null and retired_by is not null and char_length(trim(retirement_reason)) between 1 and 2000))
);
create unique index item_specification_current on public.item_specification_versions(company_id,item_id) where status='approved';
create table public.item_unit_conversions (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,item_id uuid not null,version integer not null check(version>0),
 from_uom text not null check(from_uom in ('pcs','kg','m','set','box','bundle')),
 to_uom text not null check(to_uom in ('pcs','kg','m','set') and from_uom<>to_uom),
 from_quantity numeric(18,6) not null check(from_quantity>0 and from_quantity<>'NaN'::numeric),
 to_quantity numeric(18,6) not null check(to_quantity>0 and to_quantity<>'NaN'::numeric),
 evidence text not null check(char_length(trim(evidence)) between 1 and 2000),
 status text not null default 'draft' check(status in ('draft','approved','retired')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 approved_by uuid references auth.users(id),approved_at timestamptz,retired_by uuid references auth.users(id),retired_at timestamptz,retirement_reason text,
 unique(id,company_id),unique(company_id,item_id,from_uom,version),foreign key(item_id,company_id) references public.items(id,company_id),
 check((status='draft' and approved_at is null and approved_by is null and retired_at is null and retired_by is null and retirement_reason is null)
  or (status='approved' and approved_at is not null and approved_by is not null and retired_at is null and retired_by is null and retirement_reason is null)
  or (status='retired' and approved_at is not null and approved_by is not null and retired_at is not null and retired_by is not null and char_length(trim(retirement_reason)) between 1 and 2000))
);
create unique index item_conversion_current on public.item_unit_conversions(company_id,item_id,from_uom) where status='approved';
alter table public.item_specification_versions enable row level security;
alter table public.item_unit_conversions enable row level security;
revoke all on public.item_specification_versions,public.item_unit_conversions from public,anon,authenticated;
grant select on public.item_specification_versions,public.item_unit_conversions to authenticated;
create policy permitted_specifications on public.item_specification_versions for select to authenticated using((select private.has_company_permission(company_id,'item_controls.read')));
create policy permitted_conversions on public.item_unit_conversions for select to authenticated using((select private.has_company_permission(company_id,'item_controls.read')));
create function private.guard_item_control_history() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'ITEM_CONTROL_IMMUTABLE';end if;
 if (to_jsonb(new)-array['status','approved_by','approved_at','retired_by','retired_at','retirement_reason']) is distinct from
  (to_jsonb(old)-array['status','approved_by','approved_at','retired_by','retired_at','retirement_reason']) then raise exception 'ITEM_CONTROL_IMMUTABLE';end if;
 if old.status='draft' and new.status='approved' then return new;end if;
 if old.status='approved' and new.status='retired' and (new.approved_by,new.approved_at) is not distinct from (old.approved_by,old.approved_at) then return new;end if;
 raise exception 'INVALID_TRANSITION';
end $$;
revoke all on function private.guard_item_control_history() from public,anon,authenticated;
create trigger immutable_specification before update or delete on public.item_specification_versions for each row execute function private.guard_item_control_history();
create trigger immutable_conversion before update or delete on public.item_unit_conversions for each row execute function private.guard_item_control_history();
create function public.item_control_command(p_company_id uuid,p_action text,p_data jsonb,p_idempotency_key text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_item uuid;v_version integer;v_base text;v_permission text;v_row record;v_request jsonb:=jsonb_build_array(p_action,p_data);
begin
 if p_action not in ('create_specification','approve_specification','retire_specification','create_conversion','approve_conversion','retire_conversion') then raise exception 'UNKNOWN_COMMAND';end if;
 v_permission:=case when p_action in ('create_specification','create_conversion') then 'item_controls.manage' else 'item_controls.approve' end;
 v_id:=private.begin_material_command(p_company_id,v_permission,'item_control.'||p_action,p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 if p_action in ('create_specification','create_conversion') then
  select id,base_uom into v_item,v_base from public.items where id=(p_data->>'item_id')::uuid and company_id=p_company_id and active for update;
  if not found then raise exception 'ITEM_NOT_FOUND';end if;
  if p_action='create_specification' then
   select coalesce(max(version),0)+1 into v_version from public.item_specification_versions where company_id=p_company_id and item_id=v_item;
   insert into public.item_specification_versions(company_id,item_id,version,product_type,diameter_mm,length_mm,thread_pitch_mm,thread_designation,material_grade,property_class,coating,standard_reference,evidence,created_by)
    values(p_company_id,v_item,v_version,trim(p_data->>'product_type'),nullif(p_data->>'diameter_mm','')::numeric,nullif(p_data->>'length_mm','')::numeric,nullif(p_data->>'thread_pitch_mm','')::numeric,
     coalesce(trim(p_data->>'thread_designation'),''),coalesce(trim(p_data->>'material_grade'),''),coalesce(trim(p_data->>'property_class'),''),coalesce(trim(p_data->>'coating'),''),coalesce(trim(p_data->>'standard_reference'),''),trim(p_data->>'evidence'),(select auth.uid())) returning id into v_id;
  else
   select coalesce(max(version),0)+1 into v_version from public.item_unit_conversions where company_id=p_company_id and item_id=v_item and from_uom=p_data->>'from_uom';
   insert into public.item_unit_conversions(company_id,item_id,version,from_uom,to_uom,from_quantity,to_quantity,evidence,created_by)
    values(p_company_id,v_item,v_version,p_data->>'from_uom',v_base,private.factory_quantity(p_data,'from_quantity'),private.factory_quantity(p_data,'to_quantity'),trim(p_data->>'evidence'),(select auth.uid())) returning id into v_id;
  end if;
 else
  if p_data->>'reason' is null or char_length(trim(p_data->>'reason')) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
  -- Item lock serializes approval against new quotation pins and competing revisions.
  if p_action like '%specification' then
   select item_id into v_item from public.item_specification_versions where id=(p_data->>'id')::uuid and company_id=p_company_id;
  else select item_id into v_item from public.item_unit_conversions where id=(p_data->>'id')::uuid and company_id=p_company_id;end if;
  if v_item is null then raise exception 'ITEM_CONTROL_NOT_FOUND';end if;
  perform 1 from public.items where id=v_item and company_id=p_company_id for update;
  if p_action like '%specification' then select * into v_row from public.item_specification_versions where id=(p_data->>'id')::uuid and company_id=p_company_id for update;
  else select * into v_row from public.item_unit_conversions where id=(p_data->>'id')::uuid and company_id=p_company_id for update;end if;
  if p_action like 'approve_%' then
   if v_row.status<>'draft' then raise exception 'INVALID_TRANSITION';end if;
   if p_action='approve_specification' then
    if exists(select 1 from public.item_specification_versions where company_id=p_company_id and item_id=v_item and status='approved') then raise exception 'ITEM_CONTROL_ACTIVE_EXISTS';end if;
    update public.item_specification_versions set status='approved',approved_by=(select auth.uid()),approved_at=now() where id=v_row.id;
   else
    if exists(select 1 from public.item_unit_conversions where company_id=p_company_id and item_id=v_item and from_uom=v_row.from_uom and status='approved') then raise exception 'ITEM_CONTROL_ACTIVE_EXISTS';end if;
    update public.item_unit_conversions set status='approved',approved_by=(select auth.uid()),approved_at=now() where id=v_row.id;
   end if;
  else
   if v_row.status<>'approved' then raise exception 'INVALID_TRANSITION';end if;
   if p_action='retire_specification' then update public.item_specification_versions set status='retired',retired_by=(select auth.uid()),retired_at=now(),retirement_reason=trim(p_data->>'reason') where id=v_row.id;
   else update public.item_unit_conversions set status='retired',retired_by=(select auth.uid()),retired_at=now(),retirement_reason=trim(p_data->>'reason') where id=v_row.id;end if;
  end if;
  v_id:=v_row.id;
 end if;
 return private.finish_material_command(p_company_id,'item_control.'||p_action,p_idempotency_key,v_request,v_id,'item_control',coalesce(p_data->>'reason',p_data->>'evidence'));
end $$;
create function public.get_item_controls(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'item_controls.read') then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object('specifications',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('diameter_mm',diameter_mm::text,'length_mm',length_mm::text,'thread_pitch_mm',thread_pitch_mm::text) order by item_id,version desc) from public.item_specification_versions s where company_id=p_company_id),'[]'::jsonb),
 'conversions',coalesce((select jsonb_agg(to_jsonb(u)||jsonb_build_object('from_quantity',from_quantity::text,'to_quantity',to_quantity::text) order by item_id,from_uom,version desc) from public.item_unit_conversions u where company_id=p_company_id),'[]'::jsonb));
end $$;
revoke all on function public.item_control_command(uuid,text,jsonb,text),public.get_item_controls(uuid) from public,anon;
grant execute on function public.item_control_command(uuid,text,jsonb,text),public.get_item_controls(uuid) to authenticated;

-- Original commercial and manufacturing agreements keep their immutable specification version.
alter table public.quotation_lines add column item_specification_id uuid,add foreign key(item_specification_id,company_id) references public.item_specification_versions(id,company_id);
alter table public.sales_order_lines add column item_specification_id uuid,add foreign key(item_specification_id,company_id) references public.item_specification_versions(id,company_id);
alter table public.work_orders add column item_specification_id uuid,add foreign key(item_specification_id,company_id) references public.item_specification_versions(id,company_id);
create function private.pin_item_specification() returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if tg_op='UPDATE' then
  if new.item_specification_id is distinct from old.item_specification_id or
   (old.item_specification_id is not null and (new.item_id,new.company_id) is distinct from (old.item_id,old.company_id)) then raise exception 'ITEM_CONTROL_IMMUTABLE';end if;
  if tg_table_name='quotation_lines' and new.quotation_id is distinct from old.quotation_id then raise exception 'ITEM_CONTROL_IMMUTABLE';end if;
  if tg_table_name='sales_order_lines' and (new.sales_order_id,new.quotation_line_id) is distinct from (old.sales_order_id,old.quotation_line_id) then raise exception 'ITEM_CONTROL_IMMUTABLE';end if;
  if tg_table_name='work_orders' and (new.sales_order_line_id,new.parent_work_order_id) is distinct from (old.sales_order_line_id,old.parent_work_order_id) then raise exception 'ITEM_CONTROL_IMMUTABLE';end if;
  return new;
 end if;
 if tg_table_name='quotation_lines' then
  perform 1 from public.items where id=new.item_id and company_id=new.company_id for update;
  select id into v_id from public.item_specification_versions where item_id=new.item_id and company_id=new.company_id and status='approved';
 elsif tg_table_name='sales_order_lines' then select item_specification_id into v_id from public.quotation_lines where id=new.quotation_line_id and company_id=new.company_id;
 elsif new.parent_work_order_id is not null then select item_specification_id into v_id from public.work_orders where id=new.parent_work_order_id and company_id=new.company_id;
 else select item_specification_id into v_id from public.sales_order_lines where id=new.sales_order_line_id and company_id=new.company_id;end if;
 if new.item_specification_id is not null and new.item_specification_id is distinct from v_id then raise exception 'ITEM_SPECIFICATION_CONTEXT_MISMATCH';end if;
 new.item_specification_id:=v_id;return new;
end $$;
revoke all on function private.pin_item_specification() from public,anon,authenticated;
create trigger pin_item_specification before insert or update on public.quotation_lines for each row execute function private.pin_item_specification();
create trigger pin_item_specification before insert or update on public.sales_order_lines for each row execute function private.pin_item_specification();
create trigger pin_item_specification before insert or update on public.work_orders for each row execute function private.pin_item_specification();

create function private.convert_item_quantity(p_company_id uuid,p_item_id uuid,p_conversion_id uuid,p_quantity numeric,p_from_uom text) returns numeric
 language plpgsql security definer set search_path='' as $$
declare v_rule public.item_unit_conversions%rowtype;v_qty numeric;v_base text;
begin
 select base_uom into v_base from public.items where id=p_item_id and company_id=p_company_id;
 if not found then raise exception 'ITEM_NOT_FOUND';end if;
 if p_quantity is null or p_quantity<=0 or p_quantity in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or p_quantity<>trunc(p_quantity,6) then raise exception 'INVALID_QUANTITY';end if;
 if p_conversion_id is null then
  if p_from_uom is distinct from v_base then raise exception 'UOM_MISMATCH';end if;v_qty:=p_quantity;
 else
  select * into v_rule from public.item_unit_conversions where id=p_conversion_id and company_id=p_company_id for share;
  if not found or v_rule.item_id is distinct from p_item_id or v_rule.from_uom is distinct from p_from_uom or v_rule.to_uom is distinct from v_base then raise exception 'CONVERSION_CONTEXT_MISMATCH';end if;
  if v_rule.status<>'approved' then raise exception 'CONVERSION_NOT_APPROVED';end if;
  v_qty:=p_quantity*v_rule.to_quantity/v_rule.from_quantity;
  -- Reject rounding, including fractional pieces, instead of silently altering stock.
  if v_qty<>trunc(v_qty,6) or v_qty*v_rule.from_quantity<>p_quantity*v_rule.to_quantity then raise exception 'CONVERSION_PRECISION_LOSS';end if;
 end if;
 if v_qty>=1000000000000 or (p_conversion_id is not null and v_base in ('pcs','set') and v_qty<>trunc(v_qty)) then raise exception 'CONVERSION_PRECISION_LOSS';end if;
 return v_qty::numeric(18,6);
end $$;
revoke all on function private.convert_item_quantity(uuid,uuid,uuid,numeric,text) from public,anon,authenticated;
create table public.unit_conversion_events (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,item_id uuid not null,conversion_id uuid not null,
 entity_type text not null check(entity_type in ('goods_receipt','shipment_package')),entity_id uuid not null,
 input_quantity numeric(18,6) not null check(input_quantity>0),input_uom text not null,base_quantity numeric(18,6) not null check(base_quantity>0),base_uom text not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(company_id,entity_type,entity_id),
 foreign key(item_id,company_id) references public.items(id,company_id),foreign key(conversion_id,company_id) references public.item_unit_conversions(id,company_id)
);
alter table public.unit_conversion_events enable row level security;
revoke all on public.unit_conversion_events from public,anon,authenticated;grant select on public.unit_conversion_events to authenticated;
create policy permitted_conversion_events on public.unit_conversion_events for select to authenticated using(
 (entity_type='goods_receipt' and (select private.has_company_permission(company_id,'purchase.read'))) or
 (entity_type='shipment_package' and (select private.has_company_permission(company_id,'dispatch.read'))));
create trigger immutable_conversion_events before update or delete on public.unit_conversion_events for each row execute function private.reject_lot_history_change();
create function public.receive_purchase_order_in_unit(p_company_id uuid,p_data jsonb,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_item uuid;v_qty numeric;v_conversion uuid;v_base text;
begin
 v_id:=private.begin_material_command(p_company_id,'stock.receive','receipt.in_unit',p_idempotency_key,p_data);if v_id is not null then return v_id;end if;
 select item_id,uom into v_item,v_base from public.purchase_orders where id=(p_data->>'order_id')::uuid and company_id=p_company_id;
 if not found then raise exception 'PURCHASE_ORDER_NOT_FOUND';end if;
 v_conversion:=(p_data->>'conversion_id')::uuid;
 v_qty:=private.convert_item_quantity(p_company_id,v_item,v_conversion,(p_data->>'quantity')::numeric,p_data->>'uom');
 v_id:=public.receive_purchase_order(p_company_id,(p_data->>'order_id')::uuid,p_data->>'number',p_data->>'lot_code',p_data->>'supplier_lot',p_data->>'certificate_reference',(p_data->>'location_id')::uuid,v_qty,v_base,(p_data->>'expected_revision')::integer,'unit:'||p_idempotency_key);
 if v_conversion is not null then insert into public.unit_conversion_events(company_id,item_id,conversion_id,entity_type,entity_id,input_quantity,input_uom,base_quantity,base_uom,created_by)
  values(p_company_id,v_item,v_conversion,'goods_receipt',v_id,(p_data->>'quantity')::numeric,p_data->>'uom',v_qty,v_base,(select auth.uid()));end if;
 return private.finish_material_command(p_company_id,'receipt.in_unit',p_idempotency_key,p_data,v_id,'goods_receipt');
end $$;
create function public.add_shipment_package_in_unit(p_company_id uuid,p_data jsonb,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_item uuid;v_base text;v_conversion uuid;v_qty numeric;
begin
 v_id:=private.begin_material_command(p_company_id,'dispatch.manage','package.in_unit',p_idempotency_key,p_data);if v_id is not null then return v_id;end if;
 select t.item_id,i.base_uom into v_item,v_base from public.shipment_lines l join public.stock_lots t on t.id=l.lot_id join public.items i on i.id=t.item_id where l.id=(p_data->>'shipment_line_id')::uuid and l.company_id=p_company_id;
 if not found then raise exception 'SHIPMENT_LINE_NOT_FOUND';end if;
 v_conversion:=(p_data->>'conversion_id')::uuid;v_qty:=private.convert_item_quantity(p_company_id,v_item,v_conversion,(p_data->>'quantity')::numeric,p_data->>'uom');
 v_id:=public.add_shipment_package(p_company_id,jsonb_set(jsonb_set(p_data,'{quantity}',to_jsonb(v_qty::text)),'{uom}',to_jsonb(v_base)),'unit:'||p_idempotency_key);
 if v_conversion is not null then insert into public.unit_conversion_events(company_id,item_id,conversion_id,entity_type,entity_id,input_quantity,input_uom,base_quantity,base_uom,created_by)
  values(p_company_id,v_item,v_conversion,'shipment_package',v_id,(p_data->>'quantity')::numeric,p_data->>'uom',v_qty,v_base,(select auth.uid()));end if;
 return private.finish_material_command(p_company_id,'package.in_unit',p_idempotency_key,p_data,v_id,'shipment_package');
end $$;
revoke all on function public.receive_purchase_order_in_unit(uuid,jsonb,text),public.add_shipment_package_in_unit(uuid,jsonb,text) from public,anon;
grant execute on function public.receive_purchase_order_in_unit(uuid,jsonb,text),public.add_shipment_package_in_unit(uuid,jsonb,text) to authenticated;

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
  'status',w.status,'revision',w.revision,'start_date',w.start_date,'due_date',w.due_date,'bom_revision_id',w.bom_revision_id,'routing_revision_id',w.routing_revision_id,'drawing_revision_id',w.drawing_revision_id,'item_specification_id',w.item_specification_id,'customer_part_reference_id',w.customer_part_reference_id,'customer_part_number',(select part_number from public.customer_item_references where id=w.customer_part_reference_id),'customer_part_revision',(select part_revision from public.customer_item_references where id=w.customer_part_reference_id),'source_ncr_id',w.source_ncr_id,
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
 'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'shipment_id',s.id,'shipment_number',s.shipment_number,'shipment_revision',s.revision,'status',s.status,'lot_id',t.id,'lot_code',t.lot_code,'sku',i.sku,'item_id',i.id,'item_specification_id',sl.item_specification_id,'customer_part_number',(select part_number from public.customer_item_references where id=sl.customer_part_reference_id),'customer_part_revision',(select part_revision from public.customer_item_references where id=sl.customer_part_reference_id),'quantity',l.quantity::text,'uom',sl.uom,'packaged_quantity',coalesce(p.quantity,0)::text,'remaining_quantity',(l.quantity-coalesce(p.quantity,0))::text) order by s.created_at desc,l.id)
  from public.shipment_lines l join public.shipments s on s.id=l.shipment_id join public.stock_lots t on t.id=l.lot_id join public.items i on i.id=t.item_id
  join public.stock_reservations r on r.id=l.reservation_id join public.sales_order_lines sl on sl.id=r.sales_order_line_id
  left join lateral(select sum(quantity) quantity from public.shipment_packages where shipment_line_id=l.id) p on true where l.company_id=p_company_id),'[]'::jsonb),
 'packages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'shipment_line_id',shipment_line_id,'package_code',package_code,'quantity',quantity::text,'uom',uom,'created_at',created_at,'input_quantity',(select e.input_quantity::text from public.unit_conversion_events e where e.entity_type='shipment_package' and e.entity_id=shipment_packages.id and e.company_id=p_company_id),'input_uom',(select e.input_uom from public.unit_conversion_events e where e.entity_type='shipment_package' and e.entity_id=shipment_packages.id and e.company_id=p_company_id)) order by created_at,id) from public.shipment_packages where company_id=p_company_id),'[]'::jsonb)
 );
end $$;
