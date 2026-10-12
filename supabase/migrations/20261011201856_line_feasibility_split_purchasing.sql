create or replace function private.pin_item_specification() returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if tg_op='UPDATE' then
  if new.item_specification_id is distinct from old.item_specification_id or
   (old.item_specification_id is not null and (new.item_id,new.company_id) is distinct from (old.item_id,old.company_id)) then raise exception 'ITEM_CONTROL_IMMUTABLE';end if;
  if tg_table_name='quotation_lines' then
   if new.quotation_id is distinct from old.quotation_id then raise exception 'ITEM_CONTROL_IMMUTABLE';end if;
  elsif tg_table_name='sales_order_lines' then
   if (new.sales_order_id,new.quotation_line_id) is distinct from (old.sales_order_id,old.quotation_line_id) then raise exception 'ITEM_CONTROL_IMMUTABLE';end if;
  elsif tg_table_name='work_orders' then
   if (new.sales_order_line_id,new.parent_work_order_id) is distinct from (old.sales_order_line_id,old.parent_work_order_id) then raise exception 'ITEM_CONTROL_IMMUTABLE';end if;
  end if;
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
create function private.freeze_controlled_item_unit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.base_uom is distinct from old.base_uom and (exists(select 1 from public.item_unit_conversions where item_id=old.id) or exists(select 1 from public.item_specification_versions where item_id=old.id)) then raise exception 'UOM_IN_USE';end if;
 return new;
end $$;
revoke all on function private.freeze_controlled_item_unit() from public,anon,authenticated;
create trigger freeze_controlled_item_unit before update on public.items for each row execute function private.freeze_controlled_item_unit();

alter table public.purchase_orders drop constraint purchase_orders_requisition_id_key;
create index purchase_orders_requisition_idx on public.purchase_orders(requisition_id);
create view public.purchase_requisition_positions with(security_invoker=true) as
 select r.id requisition_id,r.company_id,r.quantity requested_quantity,coalesce(sum(o.quantity),0) allocated_quantity,r.quantity-coalesce(sum(o.quantity),0) remaining_quantity
 from public.purchase_requisitions r left join public.purchase_orders o on o.requisition_id=r.id and o.company_id=r.company_id group by r.id;
revoke all on public.purchase_requisition_positions from public,anon;grant select on public.purchase_requisition_positions to authenticated;
create function public.create_partial_purchase_order(p_company_id uuid,p_requisition_id uuid,p_supplier_id uuid,p_number text,p_quantity numeric,p_unit_price numeric,p_currency text,p_promised_date date,p_expected_revision integer,p_idempotency_key text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_req public.purchase_requisitions%rowtype;v_used numeric;v_request jsonb:=jsonb_build_array(p_requisition_id,p_supplier_id,p_number,p_quantity,p_unit_price,p_currency,p_promised_date,p_expected_revision);
begin
 v_id:=private.begin_material_command(p_company_id,'purchase.manage','create_partial_purchase_order',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 select * into v_req from public.purchase_requisitions where id=p_requisition_id and company_id=p_company_id for update;
 if not found then raise exception 'REQUISITION_NOT_FOUND';end if;
 if v_req.revision is distinct from p_expected_revision then raise exception 'REVISION_CONFLICT';end if;
 select coalesce(sum(quantity),0) into v_used from public.purchase_orders where requisition_id=v_req.id and company_id=p_company_id;
 if v_req.status<>'requested' or p_quantity is null or p_quantity<=0 or p_quantity in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or p_quantity<>trunc(p_quantity,6) then raise exception 'INVALID_QUANTITY';end if;
 if p_quantity>v_req.quantity-v_used then raise exception 'REQUISITION_QUANTITY_EXCEEDED';end if;
 if not exists(select 1 from public.suppliers where id=p_supplier_id and company_id=p_company_id and active) then raise exception 'SUPPLIER_NOT_FOUND';end if;
 if p_unit_price is null or p_unit_price<0 or p_unit_price in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or p_unit_price<>trunc(p_unit_price,4) or p_promised_date is null then raise exception 'INVALID_REQUEST';end if;
 insert into public.purchase_orders(company_id,purchase_order_number,requisition_id,supplier_id,item_id,quantity,uom,unit_price,currency_code,promised_date)
 values(p_company_id,upper(trim(p_number)),v_req.id,p_supplier_id,v_req.item_id,p_quantity,v_req.uom,p_unit_price,p_currency,p_promised_date) returning id into v_id;
 update public.purchase_requisitions set status=case when p_quantity+v_used=quantity then 'ordered' else 'requested' end,revision=revision+1 where id=v_req.id;
 return private.finish_material_command(p_company_id,'create_partial_purchase_order',p_idempotency_key,v_request,v_id,'purchase_order');
end $$;
-- Legacy callers order the remaining demand, never the original quantity a second time.
create or replace function public.create_purchase_order(p_company_id uuid,p_requisition_id uuid,p_supplier_id uuid,p_number text,p_unit_price numeric,p_currency text,p_promised_date date,p_expected_revision integer,p_idempotency_key text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_remaining numeric;v_request jsonb:=jsonb_build_array(p_requisition_id,p_supplier_id,p_number,p_unit_price,p_currency,p_promised_date,p_expected_revision);
begin
 v_id:=private.begin_material_command(p_company_id,'purchase.manage','create_purchase_order',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 perform 1 from public.purchase_requisitions where id=p_requisition_id and company_id=p_company_id for update;
 if not found then raise exception 'REQUISITION_NOT_FOUND';end if;
 select remaining_quantity into v_remaining from public.purchase_requisition_positions where requisition_id=p_requisition_id and company_id=p_company_id;
 v_id:=public.create_partial_purchase_order(p_company_id,p_requisition_id,p_supplier_id,p_number,v_remaining,p_unit_price,p_currency,p_promised_date,p_expected_revision,'remaining:'||p_idempotency_key);
 return private.finish_material_command(p_company_id,'create_purchase_order',p_idempotency_key,v_request,v_id,'purchase_order');
end $$;
revoke all on function public.create_partial_purchase_order(uuid,uuid,uuid,text,numeric,numeric,text,date,integer,text) from public,anon;
grant execute on function public.create_partial_purchase_order(uuid,uuid,uuid,text,numeric,numeric,text,date,integer,text) to authenticated;

alter table public.rfq_lines add unique(id,company_id);
create table public.rfq_line_feasibility_reviews (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,rfq_line_id uuid not null,item_id uuid,version integer not null check(version>0),
 status text not null check(status in ('feasible','conditional','not_feasible','info_required')),
 drawing_revision_id uuid,bom_revision_id uuid,routing_revision_id uuid,
 conditions text not null check(char_length(conditions)<=2000),reviewed_by uuid not null references auth.users(id),reviewed_at timestamptz not null default now(),
 unique(id,company_id),unique(rfq_line_id,version),foreign key(rfq_line_id,company_id) references public.rfq_lines(id,company_id),
 foreign key(item_id,company_id) references public.items(id,company_id),
 foreign key(drawing_revision_id,company_id) references public.drawing_revisions(id,company_id),
 foreign key(bom_revision_id,company_id) references public.bom_revisions(id,company_id),
 foreign key(routing_revision_id,company_id) references public.routing_revisions(id,company_id),
 check(status not in ('feasible','conditional') or item_id is not null),check(status='feasible' or char_length(trim(conditions))>0)
);
alter table public.rfq_line_feasibility_reviews enable row level security;
revoke all on public.rfq_line_feasibility_reviews from public,anon,authenticated;grant select on public.rfq_line_feasibility_reviews to authenticated;
create policy permitted_line_reviews on public.rfq_line_feasibility_reviews for select to authenticated using((select private.has_company_permission(company_id,'sales.read')));
create trigger immutable_line_reviews before update or delete on public.rfq_line_feasibility_reviews for each row execute function private.reject_lot_history_change();
create view public.current_rfq_line_reviews with(security_invoker=true) as select distinct on(rfq_line_id) * from public.rfq_line_feasibility_reviews order by rfq_line_id,version desc;
revoke all on public.current_rfq_line_reviews from public,anon;grant select on public.current_rfq_line_reviews to authenticated;
create function public.record_rfq_line_feasibility(p_company_id uuid,p_data jsonb,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_line public.rfq_lines%rowtype;v_rfq public.rfqs%rowtype;v_item uuid;v_version integer;v_status text;
begin
 v_id:=private.begin_material_command(p_company_id,'engineering.feasibility.manage','rfq.line_feasibility',p_idempotency_key,p_data);if v_id is not null then return v_id;end if;
 select r.* into v_rfq from public.rfqs r join public.rfq_lines l on l.rfq_id=r.id where l.id=(p_data->>'line_id')::uuid and l.company_id=p_company_id for update of r;
 if not found then raise exception 'RFQ_NOT_FOUND';end if;
 if v_rfq.revision is distinct from (p_data->>'expected_revision')::integer then raise exception 'REVISION_CONFLICT';end if;
 if v_rfq.status not in ('new','awaiting_info','review_required','qualified') then raise exception 'INVALID_TRANSITION';end if;
 if exists(select 1 from public.quotations where rfq_id=v_rfq.id) then raise exception 'RFQ_REVIEW_LOCKED';end if;
 select * into v_line from public.rfq_lines where id=(p_data->>'line_id')::uuid and company_id=p_company_id;
 v_item:=(p_data->>'item_id')::uuid;v_status:=p_data->>'status';
 if v_line.item_id is not null and v_item is distinct from v_line.item_id then raise exception 'RFQ_LINE_ITEM_MISMATCH';end if;
 if v_item is not null and not exists(select 1 from public.items where id=v_item and company_id=p_company_id and active and base_uom=v_line.uom) then raise exception 'UOM_MISMATCH';end if;
 if p_data->>'drawing_revision_id' is not null and not exists(select 1 from public.drawing_revisions r join public.drawings d on d.id=r.drawing_id where r.id=(p_data->>'drawing_revision_id')::uuid and r.company_id=p_company_id and r.status='approved' and d.item_id=v_item) then raise exception 'ENGINEERING_REVISION_ITEM_MISMATCH';end if;
 if p_data->>'bom_revision_id' is not null and not exists(select 1 from public.bom_revisions r join public.boms b on b.id=r.bom_id where r.id=(p_data->>'bom_revision_id')::uuid and r.company_id=p_company_id and r.status='approved' and b.output_item_id=v_item) then raise exception 'ENGINEERING_REVISION_ITEM_MISMATCH';end if;
 if p_data->>'routing_revision_id' is not null and not exists(select 1 from public.routing_revisions r join public.routings rt on rt.id=r.routing_id where r.id=(p_data->>'routing_revision_id')::uuid and r.company_id=p_company_id and r.status='approved' and rt.output_item_id=v_item) then raise exception 'ENGINEERING_REVISION_ITEM_MISMATCH';end if;
 select coalesce(max(version),0)+1 into v_version from public.rfq_line_feasibility_reviews where rfq_line_id=v_line.id;
 insert into public.rfq_line_feasibility_reviews(company_id,rfq_line_id,item_id,version,status,drawing_revision_id,bom_revision_id,routing_revision_id,conditions,reviewed_by)
 values(p_company_id,v_line.id,v_item,v_version,v_status,(p_data->>'drawing_revision_id')::uuid,(p_data->>'bom_revision_id')::uuid,(p_data->>'routing_revision_id')::uuid,coalesce(trim(p_data->>'conditions'),''),(select auth.uid())) returning id into v_id;
 update public.rfqs set status=case
  when exists(select 1 from public.current_rfq_line_reviews r join public.rfq_lines l on l.id=r.rfq_line_id where l.rfq_id=v_rfq.id and r.status in ('feasible','conditional')) then 'qualified'
  when not exists(select 1 from public.rfq_lines l left join public.current_rfq_line_reviews r on r.rfq_line_id=l.id where l.rfq_id=v_rfq.id and (r.id is null or r.status<>'not_feasible')) then 'lost'
  else 'awaiting_info' end,revision=revision+1,updated_at=now() where id=v_rfq.id;
 return private.finish_material_command(p_company_id,'rfq.line_feasibility',p_idempotency_key,p_data,v_id,'rfq_line_feasibility',p_data->>'conditions');
end $$;
revoke all on function public.record_rfq_line_feasibility(uuid,jsonb,text) from public,anon;grant execute on function public.record_rfq_line_feasibility(uuid,jsonb,text) to authenticated;
alter table public.quotation_lines add column rfq_line_id uuid,add column feasibility_review_id uuid,
 add foreign key(rfq_line_id,company_id) references public.rfq_lines(id,company_id),
 add foreign key(feasibility_review_id,company_id) references public.rfq_line_feasibility_reviews(id,company_id);
create or replace function private.pin_quotation_engineering() returns trigger language plpgsql security definer set search_path='' as $$
declare v_review record;v_rfq uuid;v_uom text;
begin
 select rfq_id into v_rfq from public.quotations where id=new.quotation_id and company_id=new.company_id;
 if new.rfq_line_id is not null then
  select r.* into v_review from public.current_rfq_line_reviews r join public.rfq_lines l on l.id=r.rfq_line_id where l.id=new.rfq_line_id and l.rfq_id=v_rfq and l.company_id=new.company_id;
  if not found or v_review.status not in ('feasible','conditional') then raise exception 'RFQ_LINE_NOT_QUALIFIED';end if;
  if v_review.item_id is distinct from new.item_id then raise exception 'RFQ_LINE_ITEM_MISMATCH';end if;
  new.feasibility_review_id:=v_review.id;
 elsif exists(select 1 from public.rfq_line_feasibility_reviews r join public.rfq_lines l on l.id=r.rfq_line_id where l.rfq_id=v_rfq) then raise exception 'RFQ_LINE_REQUIRED';
 else select * into v_review from public.feasibility_reviews where rfq_id=v_rfq and company_id=new.company_id;
  if not found or v_review.status not in ('feasible','conditional') then raise exception 'RFQ_NOT_QUALIFIED';end if;
 end if;
 new.drawing_revision_id:=v_review.drawing_revision_id;
 if (new.bom_revision_id is not null and v_review.bom_revision_id is not null and new.bom_revision_id<>v_review.bom_revision_id) or
  (new.routing_revision_id is not null and v_review.routing_revision_id is not null and new.routing_revision_id<>v_review.routing_revision_id) then raise exception 'ENGINEERING_PIN_MISMATCH';end if;
 new.bom_revision_id:=coalesce(new.bom_revision_id,v_review.bom_revision_id);new.routing_revision_id:=coalesce(new.routing_revision_id,v_review.routing_revision_id);
 if new.drawing_revision_id is not null and not exists(select 1 from public.drawing_revisions r join public.drawings d on d.id=r.drawing_id where r.id=new.drawing_revision_id and r.company_id=new.company_id and r.status='approved' and d.item_id=new.item_id) then raise exception 'ENGINEERING_REVISION_ITEM_MISMATCH';end if;
 select base_uom into v_uom from public.items where id=new.item_id and company_id=new.company_id;
 if new.uom is distinct from v_uom then raise exception 'UOM_MISMATCH';end if;
 return new;
end $$;
create function private.guard_line_review_pins() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.rfq_line_id,new.feasibility_review_id) is distinct from (old.rfq_line_id,old.feasibility_review_id) then raise exception 'ENGINEERING_PIN_MISMATCH';end if;return new;
end $$;
revoke all on function private.guard_line_review_pins() from public,anon,authenticated;
create trigger fixed_line_review_pins before update on public.quotation_lines for each row execute function private.guard_line_review_pins();
create function private.guard_controlled_quote_approval() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='approved' and old.status<>'approved' then
  perform 1 from public.items i join public.quotation_lines l on l.item_id=i.id where l.quotation_id=new.id order by i.id for update of i;
  if exists(select 1 from public.quotation_lines l join public.item_specification_versions s on s.id=l.item_specification_id where l.quotation_id=new.id and s.status<>'approved') then raise exception 'SPECIFICATION_RETIRED';end if;
 end if;return new;
end $$;
revoke all on function private.guard_controlled_quote_approval() from public,anon,authenticated;
create trigger controlled_quote_approval before update on public.quotations for each row execute function private.guard_controlled_quote_approval();
create function private.guard_whole_rfq_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.rfq_line_feasibility_reviews r join public.rfq_lines l on l.id=r.rfq_line_id where l.rfq_id=new.rfq_id) or
  (select count(distinct coalesce(item_id::text,'unresolved')) from public.rfq_lines where rfq_id=new.rfq_id)>1 then raise exception 'RFQ_LINE_REQUIRED';end if;
 return new;
end $$;
revoke all on function private.guard_whole_rfq_review() from public,anon,authenticated;
create trigger whole_rfq_review_guard before insert or update on public.feasibility_reviews for each row execute function private.guard_whole_rfq_review();

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
    select 1 from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid, pricing_source text, customer_part_reference_id uuid, rfq_line_id uuid)
    left join public.items item on item.id = line.item_id and item.company_id = p_company_id and item.active
    where line.item_id is null or item.id is null or line.quantity is null or line.quantity <= 0
      or line.uom not in ('pcs', 'kg', 'm', 'set') or line.unit_price is null or line.unit_price < 0
  ) then raise exception 'INVALID_QUOTATION_LINE' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid, pricing_source text, customer_part_reference_id uuid, rfq_line_id uuid)
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
  insert into public.quotation_lines (company_id, quotation_id, item_id, quantity, uom, unit_price, bom_revision_id, routing_revision_id, pricing_source, customer_part_reference_id, rfq_line_id)
  select p_company_id, v_quotation_id, line.item_id, line.quantity, line.uom, line.unit_price, line.bom_revision_id, line.routing_revision_id, coalesce(nullif(trim(line.pricing_source), ''), 'Manual entry'), line.customer_part_reference_id, line.rfq_line_id
  from jsonb_to_recordset(p_lines) as line(item_id uuid, quantity numeric, uom text, unit_price numeric, bom_revision_id uuid, routing_revision_id uuid, pricing_source text, customer_part_reference_id uuid, rfq_line_id uuid);
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id, request_hash)
  values (p_company_id, 'create_quotation', p_idempotency_key, v_quotation_id, md5(v_request::text));
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key)
  values (p_company_id, (select auth.uid()), 'quotation', v_quotation_id, 'quotation.created', p_idempotency_key);
  return v_quotation_id;
end;
$$;
