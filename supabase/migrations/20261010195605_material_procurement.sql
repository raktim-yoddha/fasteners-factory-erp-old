-- ADR 0016 / TASK-0012: SAMPLE procurement uses base UOM and references, never invented inspection criteria.
alter table public.command_idempotency add column request_hash text;
alter table public.items add column specification text, add column grade text, add column dimensions text,
  add column storage_requirements text, add column reorder_quantity numeric(18,6) check (reorder_quantity >= 0),
  add column preferred_supplier_id uuid, add foreign key (preferred_supplier_id, company_id) references public.suppliers(id, company_id);
alter table public.suppliers add column qualification_note text, add column certificate_requirements text;

create table public.purchase_requisitions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  requisition_number text not null check (requisition_number ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'),
  item_id uuid not null, quantity numeric(18,6) not null check (quantity > 0), uom text not null,
  demand_source text not null check (char_length(trim(demand_source)) between 1 and 500),
  sales_order_line_id uuid, needed_by date not null,
  status text not null default 'requested' check (status in ('requested','ordered')),
  revision integer not null default 1, created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  unique (company_id,requisition_number), unique (id,company_id),
  foreign key (item_id,company_id) references public.items(id,company_id),
  foreign key (sales_order_line_id,company_id) references public.sales_order_lines(id,company_id)
);
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  purchase_order_number text not null check (purchase_order_number ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'),
  requisition_id uuid not null unique, supplier_id uuid not null, item_id uuid not null,
  quantity numeric(18,6) not null check (quantity > 0), uom text not null,
  unit_price numeric(18,4) not null check (unit_price >= 0), currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  promised_date date not null, status text not null default 'draft' check (status in ('draft','approved','partially_received','received')),
  revision integer not null default 1, approved_by uuid references auth.users(id), approved_at timestamptz,
  created_at timestamptz not null default now(), unique (id,company_id), unique(company_id,purchase_order_number),
  foreign key (requisition_id,company_id) references public.purchase_requisitions(id,company_id),
  foreign key (supplier_id,company_id) references public.suppliers(id,company_id),
  foreign key (item_id,company_id) references public.items(id,company_id)
);
create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  receipt_number text not null check (receipt_number ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'), purchase_order_id uuid not null,
  lot_id uuid not null unique, supplier_lot text not null check (char_length(trim(supplier_lot)) between 1 and 160),
  certificate_reference text, quantity numeric(18,6) not null check (quantity > 0), uom text not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  unique (id,company_id), unique(company_id,receipt_number),
  foreign key (purchase_order_id,company_id) references public.purchase_orders(id,company_id),
  foreign key (lot_id,company_id) references public.stock_lots(id,company_id)
);
create table public.goods_returns (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), receipt_id uuid not null,
  quantity numeric(18,6) not null check (quantity > 0), reason text not null check (char_length(trim(reason)) between 1 and 2000),
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  foreign key (receipt_id,company_id) references public.goods_receipts(id,company_id)
);
create table public.stock_count_proposals (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), lot_id uuid not null,
  expected_on_hand numeric(18,6) not null, counted_quantity numeric(18,6) not null check (counted_quantity >= 0),
  expected_lot_revision integer not null, reason text not null check (char_length(trim(reason)) between 1 and 2000),
  status text not null default 'proposed' check (status in ('proposed','approved','reversed')),
  created_by uuid not null references auth.users(id), reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  created_at timestamptz not null default now(), unique (id,company_id),
  foreign key (lot_id,company_id) references public.stock_lots(id,company_id)
);

insert into public.permission_definitions(code,description) values
  ('purchase.read','Read requisitions, purchase orders and receipts.'), ('purchase.manage','Request materials and draft purchase orders.'),
  ('purchase.approve','Approve purchase orders.'), ('stock.return','Return supplier receipts without consuming reserved quantity.'),
  ('stock.count','Propose a physical count.'), ('stock.adjust','Review counts and reverse posted count corrections.') on conflict do nothing;
insert into public.role_permissions(role,permission_code) select 'admin',code from public.permission_definitions on conflict do nothing;
insert into public.role_permissions(role,permission_code) values
  ('purchase','purchase.read'), ('purchase','purchase.manage'), ('management','purchase.read'), ('management','purchase.approve'),
  ('stores','purchase.read'), ('stores','stock.return'), ('stores','stock.count'), ('quality','purchase.read'),
  ('quality','stock.read'), ('management','stock.read'), ('management','stock.adjust') on conflict do nothing;
insert into public.role_permissions(role,permission_code) values
  ('purchase','stock.read'), ('engineering','sales.read'), ('stores','sales.read') on conflict do nothing;

create function public.get_my_company_permissions(p_company_id uuid)
returns table(permission_code text) language sql stable security invoker set search_path = '' as $$
  select distinct permission.permission_code from public.user_company_roles role
  join public.company_memberships membership on membership.company_id=role.company_id and membership.user_id=role.user_id and membership.active
  join public.role_permissions permission on permission.role=role.role
  where role.company_id=p_company_id and role.user_id=(select auth.uid());
$$;
revoke all on function public.get_my_company_permissions(uuid) from public,anon;
grant execute on function public.get_my_company_permissions(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['purchase_requisitions','purchase_orders','goods_receipts','goods_returns','stock_count_proposals'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy "read permitted company records" on public.%I for select to authenticated using ((select private.has_company_permission(company_id, %L)))', t, case when t = 'stock_count_proposals' then 'stock.read' else 'purchase.read' end);
    execute format('create index on public.%I(company_id)',t);
  end loop;
end $$;
create index goods_returns_receipt_idx on public.goods_returns(receipt_id);
create index goods_receipts_order_idx on public.goods_receipts(purchase_order_id);

-- Internal command preflight preserves the same auth/locking rules across this slice.
create function private.begin_material_command(p_company uuid,p_permission text,p_command text,p_key text,p_request jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_result uuid; v_hash text;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED'; end if;
  if not private.has_company_permission(p_company,p_permission) then raise exception 'FORBIDDEN'; end if;
  if p_key is null or char_length(trim(p_key)) not between 1 and 160 then raise exception 'INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company::text || ':' || p_key,0));
  select result_id,request_hash into v_result,v_hash from public.command_idempotency where company_id=p_company and command_name=p_command and idempotency_key=p_key;
  if found and v_hash is distinct from md5(p_request::text) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return v_result;
end $$;
create function private.finish_material_command(p_company uuid,p_command text,p_key text,p_request jsonb,p_result uuid,p_entity text,p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  insert into public.command_idempotency(company_id,command_name,idempotency_key,result_id,request_hash) values(p_company,p_command,p_key,p_result,md5(p_request::text));
  insert into public.audit_log(company_id,actor_id,entity_type,entity_id,action,idempotency_key,reason) values(p_company,(select auth.uid()),p_entity,p_result,p_command,p_key,p_reason);
  return p_result;
end $$;
revoke all on function private.begin_material_command(uuid,text,text,text,jsonb),private.finish_material_command(uuid,text,text,jsonb,uuid,text,text) from public,anon,authenticated;

create function public.request_material(p_company_id uuid,p_number text,p_item_id uuid,p_quantity numeric,p_uom text,p_demand_source text,p_needed_by date,p_sales_order_line_id uuid,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_uom text; v_request jsonb := jsonb_build_array(p_number,p_item_id,p_quantity,p_uom,p_demand_source,p_needed_by,p_sales_order_line_id);
begin
  v_id := private.begin_material_command(p_company_id,'purchase.manage','request_material',p_idempotency_key,v_request); if v_id is not null then return v_id; end if;
  select base_uom into v_uom from public.items where id=p_item_id and company_id=p_company_id and active;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if p_uom is distinct from v_uom then raise exception 'UOM_MISMATCH'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity = 'NaN'::numeric or p_needed_by is null then raise exception 'INVALID_REQUEST'; end if;
  insert into public.purchase_requisitions(company_id,requisition_number,item_id,quantity,uom,demand_source,needed_by,sales_order_line_id,created_by)
  values(p_company_id,upper(trim(p_number)),p_item_id,p_quantity,p_uom,trim(p_demand_source),p_needed_by,p_sales_order_line_id,(select auth.uid())) returning id into v_id;
  return private.finish_material_command(p_company_id,'request_material',p_idempotency_key,v_request,v_id,'purchase_requisition');
end $$;

create function public.create_purchase_order(p_company_id uuid,p_requisition_id uuid,p_supplier_id uuid,p_number text,p_unit_price numeric,p_currency text,p_promised_date date,p_expected_revision integer,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_req public.purchase_requisitions%rowtype; v_request jsonb := jsonb_build_array(p_requisition_id,p_supplier_id,p_number,p_unit_price,p_currency,p_promised_date,p_expected_revision);
begin
  v_id := private.begin_material_command(p_company_id,'purchase.manage','create_purchase_order',p_idempotency_key,v_request); if v_id is not null then return v_id; end if;
  select * into v_req from public.purchase_requisitions where id=p_requisition_id and company_id=p_company_id for update;
  if not found then raise exception 'REQUISITION_NOT_FOUND'; end if;
  if v_req.revision is distinct from p_expected_revision then raise exception 'REVISION_CONFLICT'; end if;
  if v_req.status <> 'requested' then raise exception 'INVALID_TRANSITION'; end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id and company_id=p_company_id and active) then raise exception 'SUPPLIER_NOT_FOUND'; end if;
  if p_unit_price is null or p_unit_price < 0 or p_unit_price='NaN'::numeric or p_promised_date is null then raise exception 'INVALID_REQUEST'; end if;
  insert into public.purchase_orders(company_id,purchase_order_number,requisition_id,supplier_id,item_id,quantity,uom,unit_price,currency_code,promised_date)
  values(p_company_id,upper(trim(p_number)),p_requisition_id,p_supplier_id,v_req.item_id,v_req.quantity,v_req.uom,p_unit_price,p_currency,p_promised_date) returning id into v_id;
  update public.purchase_requisitions set status='ordered',revision=revision+1 where id=v_req.id;
  return private.finish_material_command(p_company_id,'create_purchase_order',p_idempotency_key,v_request,v_id,'purchase_order');
end $$;

create function public.approve_purchase_order(p_company_id uuid,p_order_id uuid,p_expected_revision integer,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_order public.purchase_orders%rowtype; v_request jsonb := jsonb_build_array(p_order_id,p_expected_revision);
begin
  v_id := private.begin_material_command(p_company_id,'purchase.approve','approve_purchase_order',p_idempotency_key,v_request); if v_id is not null then return v_id; end if;
  select * into v_order from public.purchase_orders where id=p_order_id and company_id=p_company_id for update;
  if not found then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;
  if v_order.revision is distinct from p_expected_revision then raise exception 'REVISION_CONFLICT'; end if;
  if v_order.status <> 'draft' then raise exception 'INVALID_TRANSITION'; end if;
  update public.purchase_orders set status='approved',revision=revision+1,approved_at=now(),approved_by=(select auth.uid()) where id=p_order_id;
  return private.finish_material_command(p_company_id,'approve_purchase_order',p_idempotency_key,v_request,p_order_id,'purchase_order');
end $$;

create function public.receive_purchase_order(p_company_id uuid,p_order_id uuid,p_number text,p_lot_code text,p_supplier_lot text,p_certificate_reference text,p_location_id uuid,p_quantity numeric,p_uom text,p_expected_revision integer,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_lot uuid; v_received numeric; v_order public.purchase_orders%rowtype;
  v_request jsonb := jsonb_build_array(p_order_id,p_number,p_lot_code,p_supplier_lot,p_certificate_reference,p_location_id,p_quantity,p_uom,p_expected_revision);
begin
  v_id := private.begin_material_command(p_company_id,'stock.receive','receive_purchase_order',p_idempotency_key,v_request); if v_id is not null then return v_id; end if;
  select * into v_order from public.purchase_orders where id=p_order_id and company_id=p_company_id for update;
  if not found then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;
  if v_order.revision is distinct from p_expected_revision then raise exception 'REVISION_CONFLICT'; end if;
  if v_order.status not in ('approved','partially_received') then raise exception 'INVALID_TRANSITION'; end if;
  if p_uom is distinct from v_order.uom then raise exception 'UOM_MISMATCH'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity='NaN'::numeric then raise exception 'INVALID_REQUEST'; end if;
  if not exists(select 1 from public.stock_locations l join public.warehouses w on w.id=l.warehouse_id and w.company_id=l.company_id where l.id=p_location_id and l.company_id=p_company_id and l.active and w.active) then raise exception 'STOCK_LOCATION_NOT_FOUND'; end if;
  select coalesce(sum(r.quantity),0)-coalesce((select sum(ret.quantity) from public.goods_returns ret join public.goods_receipts gr on gr.id=ret.receipt_id where gr.purchase_order_id=p_order_id),0)
    into v_received from public.goods_receipts r where r.purchase_order_id=p_order_id;
  if v_received+p_quantity > v_order.quantity then raise exception 'PURCHASE_QUANTITY_EXCEEDED'; end if;
  -- Every partial receipt has its own held lot, preserving supplier evidence and independent QC release.
  insert into public.stock_lots(company_id,item_id,location_id,lot_code,qc_status) values(p_company_id,v_order.item_id,p_location_id,upper(trim(p_lot_code)),'hold') returning id into v_lot;
  insert into public.goods_receipts(company_id,receipt_number,purchase_order_id,lot_id,supplier_lot,certificate_reference,quantity,uom,created_by)
    values(p_company_id,upper(trim(p_number)),p_order_id,v_lot,trim(p_supplier_lot),nullif(trim(p_certificate_reference),''),p_quantity,p_uom,(select auth.uid())) returning id into v_id;
  insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by)
    values(p_company_id,v_lot,v_order.item_id,p_location_id,'receipt',p_quantity,p_uom,'goods_receipt',v_id,p_idempotency_key,(select auth.uid()));
  update public.purchase_orders set revision=revision+1,status=case when v_received+p_quantity=quantity then 'received' else 'partially_received' end where id=p_order_id;
  return private.finish_material_command(p_company_id,'receive_purchase_order',p_idempotency_key,v_request,v_id,'goods_receipt');
end $$;

create function public.return_goods_receipt(p_company_id uuid,p_receipt_id uuid,p_quantity numeric,p_reason text,p_expected_lot_revision integer,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_receipt public.goods_receipts%rowtype; v_lot public.stock_lots%rowtype; v_on_hand numeric; v_reserved numeric; v_returned numeric;
  v_request jsonb := jsonb_build_array(p_receipt_id,p_quantity,p_reason,p_expected_lot_revision);
begin
  v_id := private.begin_material_command(p_company_id,'stock.return','return_goods_receipt',p_idempotency_key,v_request); if v_id is not null then return v_id; end if;
  select * into v_receipt from public.goods_receipts where id=p_receipt_id and company_id=p_company_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  -- Lock order before lot, matching receive/reserve/dispatch order to avoid a lock inversion.
  perform 1 from public.purchase_orders where id=v_receipt.purchase_order_id and company_id=p_company_id for update;
  select * into v_lot from public.stock_lots where id=v_receipt.lot_id and company_id=p_company_id for update;
  if v_lot.revision is distinct from p_expected_lot_revision then raise exception 'REVISION_CONFLICT'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity='NaN'::numeric then raise exception 'INVALID_REQUEST'; end if;
  select coalesce(sum(quantity),0) into v_returned from public.goods_returns where receipt_id=p_receipt_id;
  select coalesce(sum(quantity_delta),0) into v_on_hand from public.stock_ledger_entries where lot_id=v_lot.id and company_id=p_company_id;
  select coalesce(sum(quantity-consumed_quantity),0) into v_reserved from public.stock_reservations where lot_id=v_lot.id and company_id=p_company_id and status='active';
  if p_quantity > v_receipt.quantity-v_returned or p_quantity > v_on_hand-v_reserved then raise exception 'INSUFFICIENT_AVAILABLE_STOCK'; end if;
  insert into public.goods_returns(company_id,receipt_id,quantity,reason,created_by) values(p_company_id,p_receipt_id,p_quantity,trim(p_reason),(select auth.uid())) returning id into v_id;
  insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by,reason)
    values(p_company_id,v_lot.id,v_lot.item_id,v_lot.location_id,'reversal',-p_quantity,v_receipt.uom,'supplier_return',v_id,p_idempotency_key,(select auth.uid()),trim(p_reason));
  update public.stock_lots set revision=revision+1,updated_at=now() where id=v_lot.id;
  update public.purchase_orders set status='partially_received',revision=revision+1 where id=v_receipt.purchase_order_id;
  return private.finish_material_command(p_company_id,'return_goods_receipt',p_idempotency_key,v_request,v_id,'goods_return',p_reason);
end $$;

create function public.reject_stock_lot(p_company_id uuid,p_lot_id uuid,p_reason text,p_expected_revision integer,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_lot public.stock_lots%rowtype; v_request jsonb := jsonb_build_array(p_lot_id,p_reason,p_expected_revision);
begin
  v_id := private.begin_material_command(p_company_id,'quality.release','reject_stock_lot',p_idempotency_key,v_request); if v_id is not null then return v_id; end if;
  select * into v_lot from public.stock_lots where id=p_lot_id and company_id=p_company_id for update;
  if not found then raise exception 'LOT_NOT_FOUND'; end if;
  if v_lot.revision is distinct from p_expected_revision then raise exception 'REVISION_CONFLICT'; end if;
  if v_lot.qc_status <> 'hold' then raise exception 'INVALID_TRANSITION'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
  update public.stock_lots set qc_status='rejected',revision=revision+1,updated_at=now() where id=p_lot_id;
  return private.finish_material_command(p_company_id,'reject_stock_lot',p_idempotency_key,v_request,p_lot_id,'stock_lot',p_reason);
end $$;

create function public.propose_stock_count(p_company_id uuid,p_lot_id uuid,p_counted_quantity numeric,p_reason text,p_expected_revision integer,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_lot public.stock_lots%rowtype; v_balance numeric; v_request jsonb := jsonb_build_array(p_lot_id,p_counted_quantity,p_reason,p_expected_revision);
begin
  v_id := private.begin_material_command(p_company_id,'stock.count','propose_stock_count',p_idempotency_key,v_request); if v_id is not null then return v_id; end if;
  select * into v_lot from public.stock_lots where id=p_lot_id and company_id=p_company_id for update;
  if not found then raise exception 'LOT_NOT_FOUND'; end if;
  if v_lot.revision is distinct from p_expected_revision then raise exception 'REVISION_CONFLICT'; end if;
  if p_counted_quantity is null or p_counted_quantity < 0 or p_counted_quantity='NaN'::numeric then raise exception 'INVALID_REQUEST'; end if;
  select coalesce(sum(quantity_delta),0) into v_balance from public.stock_ledger_entries where company_id=p_company_id and lot_id=p_lot_id;
  insert into public.stock_count_proposals(company_id,lot_id,expected_on_hand,counted_quantity,expected_lot_revision,reason,created_by)
    values(p_company_id,p_lot_id,v_balance,p_counted_quantity,p_expected_revision,trim(p_reason),(select auth.uid())) returning id into v_id;
  return private.finish_material_command(p_company_id,'propose_stock_count',p_idempotency_key,v_request,v_id,'stock_count',p_reason);
end $$;

create function public.review_stock_count(p_company_id uuid,p_proposal_id uuid,p_reverse boolean,p_reason text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_count public.stock_count_proposals%rowtype; v_lot public.stock_lots%rowtype; v_balance numeric; v_reserved numeric; v_delta numeric; v_uom text;
  v_command text := case when p_reverse then 'reverse_stock_count' else 'approve_stock_count' end;
  v_request jsonb := jsonb_build_array(p_proposal_id,p_reverse,p_reason);
begin
  v_id := private.begin_material_command(p_company_id,'stock.adjust',v_command,p_idempotency_key,v_request); if v_id is not null then return v_id; end if;
  select * into v_count from public.stock_count_proposals where id=p_proposal_id and company_id=p_company_id for update;
  if not found then raise exception 'COUNT_NOT_FOUND'; end if;
  if p_reverse is null or (not p_reverse and v_count.status <> 'proposed') or (p_reverse and v_count.status <> 'approved') then raise exception 'INVALID_TRANSITION'; end if;
  if not p_reverse and v_count.created_by=(select auth.uid()) then raise exception 'SECOND_REVIEWER_REQUIRED'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
  select * into v_lot from public.stock_lots where id=v_count.lot_id and company_id=p_company_id for update;
  select coalesce(sum(quantity_delta),0) into v_balance from public.stock_ledger_entries where company_id=p_company_id and lot_id=v_lot.id;
  select coalesce(sum(quantity-consumed_quantity),0) into v_reserved from public.stock_reservations where company_id=p_company_id and lot_id=v_lot.id and status='active';
  if not p_reverse and (v_lot.revision <> v_count.expected_lot_revision or v_balance <> v_count.expected_on_hand) then raise exception 'REVISION_CONFLICT'; end if;
  v_delta := case when p_reverse then v_count.expected_on_hand-v_count.counted_quantity else v_count.counted_quantity-v_count.expected_on_hand end;
  if v_balance+v_delta < v_reserved or v_balance+v_delta < 0 then raise exception 'INSUFFICIENT_AVAILABLE_STOCK'; end if;
  select base_uom into v_uom from public.items where id=v_lot.item_id;
  if v_delta <> 0 then
    insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by,reason)
      values(p_company_id,v_lot.id,v_lot.item_id,v_lot.location_id,case when p_reverse then 'reversal' else 'adjustment' end,v_delta,v_uom,'stock_count',p_proposal_id,p_idempotency_key,(select auth.uid()),trim(p_reason));
  end if;
  update public.stock_lots set revision=revision+1,updated_at=now() where id=v_lot.id;
  update public.stock_count_proposals set status=case when p_reverse then 'reversed' else 'approved' end,reviewed_by=(select auth.uid()),reviewed_at=now() where id=p_proposal_id;
  return private.finish_material_command(p_company_id,v_command,p_idempotency_key,v_request,p_proposal_id,'stock_count',p_reason);
end $$;

-- No default PUBLIC execution of a privileged API; each function performs its own company permission check.
revoke all on function public.request_material(uuid,text,uuid,numeric,text,text,date,uuid,text),public.create_purchase_order(uuid,uuid,uuid,text,numeric,text,date,integer,text),public.approve_purchase_order(uuid,uuid,integer,text),public.receive_purchase_order(uuid,uuid,text,text,text,text,uuid,numeric,text,integer,text),public.return_goods_receipt(uuid,uuid,numeric,text,integer,text),public.reject_stock_lot(uuid,uuid,text,integer,text),public.propose_stock_count(uuid,uuid,numeric,text,integer,text),public.review_stock_count(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.request_material(uuid,text,uuid,numeric,text,text,date,uuid,text),public.create_purchase_order(uuid,uuid,uuid,text,numeric,text,date,integer,text),public.approve_purchase_order(uuid,uuid,integer,text),public.receive_purchase_order(uuid,uuid,text,text,text,text,uuid,numeric,text,integer,text),public.return_goods_receipt(uuid,uuid,numeric,text,integer,text),public.reject_stock_lot(uuid,uuid,text,integer,text),public.propose_stock_count(uuid,uuid,numeric,text,integer,text),public.review_stock_count(uuid,uuid,boolean,text,text) to authenticated;

create function private.audit_master_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    insert into public.audit_log(company_id,actor_id,entity_type,entity_id,action)
      values(new.company_id,(select auth.uid()),tg_table_name,new.id,tg_table_name || case when tg_op='INSERT' then '.created' else '.updated' end);
  end if;
  return new;
end $$;
revoke all on function private.audit_master_change() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['customers','suppliers','items','drawings','warehouses','stock_locations','work_centres'] loop
    execute format('create trigger audit_master_change after insert or update on public.%I for each row execute function private.audit_master_change()',t);
  end loop;
end $$;
