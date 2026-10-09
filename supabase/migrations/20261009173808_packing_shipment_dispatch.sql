-- TASK-0007: dispatch is a trusted command; a shipment never decrements stock from the browser.
alter table public.stock_reservations add constraint stock_reservations_id_company_key unique (id, company_id);
alter table public.stock_reservations
  add column consumed_quantity numeric(18, 6) not null default 0 check (consumed_quantity >= 0 and consumed_quantity <= quantity);

create table public.packing_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  sales_order_id uuid not null,
  packing_number text not null check (packing_number ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'),
  status text not null default 'draft' check (status in ('draft', 'packed', 'dispatched', 'cancelled')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, packing_number),
  unique (id, company_id),
  foreign key (sales_order_id, company_id) references public.sales_orders(id, company_id)
);

create table public.packing_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  packing_order_id uuid not null,
  reservation_id uuid not null,
  quantity numeric(18, 6) not null check (quantity > 0),
  foreign key (packing_order_id, company_id) references public.packing_orders(id, company_id),
  foreign key (reservation_id, company_id) references public.stock_reservations(id, company_id),
  unique (packing_order_id, reservation_id)
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  packing_order_id uuid not null,
  shipment_number text not null check (shipment_number ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'),
  status text not null default 'draft' check (status in ('draft', 'dispatched', 'cancelled')),
  revision integer not null default 1 check (revision > 0),
  dispatched_at timestamptz,
  dispatched_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (company_id, shipment_number),
  unique (id, company_id),
  foreign key (packing_order_id, company_id) references public.packing_orders(id, company_id),
  check ((status = 'dispatched') = (dispatched_at is not null and dispatched_by is not null) or status <> 'dispatched')
);

create table public.shipment_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  shipment_id uuid not null,
  reservation_id uuid not null,
  lot_id uuid not null,
  quantity numeric(18, 6) not null check (quantity > 0),
  foreign key (shipment_id, company_id) references public.shipments(id, company_id),
  foreign key (reservation_id, company_id) references public.stock_reservations(id, company_id),
  foreign key (lot_id, company_id) references public.stock_lots(id, company_id),
  unique (shipment_id, reservation_id)
);

create index packing_orders_company_idx on public.packing_orders(company_id);
create index shipments_company_idx on public.shipments(company_id);
create index shipment_lines_shipment_idx on public.shipment_lines(company_id, shipment_id);

create function public.dispatch_shipment(
  p_company_id uuid,
  p_shipment_id uuid,
  p_expected_shipment_revision integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment_id uuid;
  v_packing_order_id uuid;
  v_sales_order_id uuid;
  v_shipment_status text;
  v_packing_status text;
  v_shipment_revision integer;
  v_on_hand numeric(18, 6);
  v_reservation record;
  v_has_open_quantity boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;
  if not (select private.has_company_permission(p_company_id, 'dispatch.manage')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_expected_shipment_revision is null or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_DISPATCH_REQUEST' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_shipment_id
  from public.command_idempotency
  where company_id = p_company_id and command_name = 'dispatch_shipment' and idempotency_key = p_idempotency_key;
  if found then
    return v_shipment_id;
  end if;

  select shipment.id, shipment.packing_order_id, shipment.status, shipment.revision, packing.sales_order_id, packing.status
  into v_shipment_id, v_packing_order_id, v_shipment_status, v_shipment_revision, v_sales_order_id, v_packing_status
  from public.shipments shipment
  join public.packing_orders packing on packing.id = shipment.packing_order_id and packing.company_id = shipment.company_id
  where shipment.id = p_shipment_id and shipment.company_id = p_company_id
  for update of shipment, packing;
  if not found then
    raise exception 'SHIPMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_shipment_status <> 'draft' or v_packing_status <> 'packed' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if v_shipment_revision <> p_expected_shipment_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  perform 1 from public.sales_orders where id = v_sales_order_id and company_id = p_company_id for update;
  for v_reservation in
    select line.id as shipment_line_id, line.lot_id as shipment_lot_id, line.quantity as shipment_quantity, reservation.id as reservation_id,
      reservation.lot_id as reservation_lot_id, reservation.sales_order_line_id, reservation.quantity as reservation_quantity,
      reservation.consumed_quantity, reservation.status, lot.item_id, lot.location_id, item.base_uom
    from public.shipment_lines line
    join public.stock_reservations reservation on reservation.id = line.reservation_id and reservation.company_id = line.company_id
    join public.stock_lots lot on lot.id = line.lot_id and lot.company_id = line.company_id
    join public.items item on item.id = lot.item_id and item.company_id = lot.company_id
    where line.shipment_id = v_shipment_id and line.company_id = p_company_id
    for update of reservation, lot
  loop
    if v_reservation.status <> 'active' or v_reservation.reservation_lot_id <> v_reservation.shipment_lot_id then
      raise exception 'INVALID_RESERVATION' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.packing_order_lines packing_line
      where packing_line.company_id = p_company_id
        and packing_line.packing_order_id = v_packing_order_id
        and packing_line.reservation_id = v_reservation.reservation_id
        and packing_line.quantity >= v_reservation.shipment_quantity
    ) or not exists (
      select 1 from public.sales_order_lines order_line
      where order_line.company_id = p_company_id
        and order_line.id = v_reservation.sales_order_line_id
        and order_line.sales_order_id = v_sales_order_id
    ) then
      raise exception 'INVALID_PACKING_ORDER' using errcode = 'P0001';
    end if;
    if v_reservation.reservation_quantity - v_reservation.consumed_quantity < v_reservation.shipment_quantity then
      raise exception 'INSUFFICIENT_RESERVED_STOCK' using errcode = 'P0001';
    end if;
    select coalesce(sum(quantity_delta), 0::numeric) into v_on_hand
    from public.stock_ledger_entries
    where company_id = p_company_id and lot_id = v_reservation.reservation_lot_id;
    if v_on_hand < v_reservation.shipment_quantity then
      raise exception 'INSUFFICIENT_ON_HAND_STOCK' using errcode = 'P0001';
    end if;
    insert into public.stock_ledger_entries (
      company_id, lot_id, item_id, location_id, movement_type, quantity_delta, uom, source_type, source_id, idempotency_key, created_by
    ) values (
      p_company_id, v_reservation.reservation_lot_id, v_reservation.item_id, v_reservation.location_id,
      'shipment', -v_reservation.shipment_quantity, v_reservation.base_uom, 'shipment_line', v_reservation.shipment_line_id,
      v_reservation.shipment_line_id::text, (select auth.uid())
    );
    update public.stock_reservations
    set consumed_quantity = consumed_quantity + v_reservation.shipment_quantity,
        status = case when consumed_quantity + v_reservation.shipment_quantity = quantity then 'consumed' else 'active' end
    where id = v_reservation.reservation_id and company_id = p_company_id;
  end loop;

  if not found then
    raise exception 'EMPTY_SHIPMENT' using errcode = 'P0001';
  end if;
  update public.shipments
  set status = 'dispatched', dispatched_at = now(), dispatched_by = (select auth.uid()), revision = revision + 1
  where id = v_shipment_id and company_id = p_company_id;
  update public.packing_orders
  set status = 'dispatched', revision = revision + 1, updated_at = now()
  where id = v_packing_order_id and company_id = p_company_id;

  select exists (
    select 1
    from public.sales_order_lines order_line
    where order_line.sales_order_id = v_sales_order_id
      and order_line.company_id = p_company_id
      and order_line.ordered_quantity > coalesce((
        select sum(dispatched_line.quantity)
        from public.shipment_lines dispatched_line
        join public.shipments dispatched_shipment on dispatched_shipment.id = dispatched_line.shipment_id
        join public.stock_reservations dispatched_reservation on dispatched_reservation.id = dispatched_line.reservation_id
        where dispatched_shipment.company_id = p_company_id
          and dispatched_shipment.status = 'dispatched'
          and dispatched_reservation.sales_order_line_id = order_line.id
      ), 0::numeric)
  ) into v_has_open_quantity;
  update public.sales_orders
  set status = case when v_has_open_quantity then 'partially_shipped' else 'fulfilled' end,
      revision = revision + 1,
      updated_at = now()
  where id = v_sales_order_id and company_id = p_company_id;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'dispatch_shipment', p_idempotency_key, v_shipment_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key)
  values (p_company_id, (select auth.uid()), 'shipment', v_shipment_id, 'shipment.dispatched', p_idempotency_key);
  return v_shipment_id;
end;
$$;

revoke all on function public.dispatch_shipment(uuid, uuid, integer, text) from public;
grant execute on function public.dispatch_shipment(uuid, uuid, integer, text) to authenticated;

alter table public.packing_orders enable row level security;
alter table public.packing_order_lines enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_lines enable row level security;

revoke all on public.packing_orders, public.packing_order_lines, public.shipments, public.shipment_lines from anon, authenticated;
grant select on public.packing_orders, public.packing_order_lines, public.shipments, public.shipment_lines to authenticated;

create policy "read company packing orders" on public.packing_orders for select to authenticated
  using ((select private.has_company_permission(company_id, 'dispatch.read')));
create policy "read company packing lines" on public.packing_order_lines for select to authenticated
  using ((select private.has_company_permission(company_id, 'dispatch.read')));
create policy "read company shipments" on public.shipments for select to authenticated
  using ((select private.has_company_permission(company_id, 'dispatch.read')));
create policy "read company shipment lines" on public.shipment_lines for select to authenticated
  using ((select private.has_company_permission(company_id, 'dispatch.read')));

insert into public.permission_definitions (code, description) values
  ('dispatch.read', 'Read packing orders and shipments.'),
  ('dispatch.manage', 'Dispatch packed shipments through the trusted command.')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code) values
  ('admin', 'dispatch.read'), ('admin', 'dispatch.manage'),
  ('management', 'dispatch.read'), ('sales', 'dispatch.read'),
  ('packing_dispatch', 'dispatch.read'), ('packing_dispatch', 'dispatch.manage')
on conflict do nothing;
