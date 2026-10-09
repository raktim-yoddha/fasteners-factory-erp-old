-- TASK-0006: inventory quantity is derived exclusively from this append-only ledger.
alter table public.stock_locations add constraint stock_locations_id_company_key unique (id, company_id);
alter table public.sales_order_lines add constraint sales_order_lines_id_company_key unique (id, company_id);
alter table public.sales_orders add column revision integer not null default 1 check (revision > 0);
alter table public.sales_orders add column updated_at timestamptz not null default now();

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null,
  location_id uuid not null,
  lot_code text not null check (lot_code ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'),
  qc_status text not null default 'released' check (qc_status in ('released', 'hold', 'rejected')),
  created_at timestamptz not null default now(),
  unique (company_id, lot_code),
  unique (id, company_id),
  foreign key (item_id, company_id) references public.items(id, company_id),
  foreign key (location_id, company_id) references public.stock_locations(id, company_id)
);

create table public.stock_ledger_entries (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id),
  lot_id uuid not null,
  item_id uuid not null,
  location_id uuid not null,
  movement_type text not null check (movement_type in ('receipt', 'issue', 'adjustment', 'reversal', 'production_receipt', 'shipment')),
  quantity_delta numeric(18, 6) not null check (quantity_delta <> 0),
  uom text not null check (uom in ('pcs', 'kg', 'm', 'set')),
  source_type text not null check (char_length(trim(source_type)) between 1 and 80),
  source_id uuid,
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 1 and 160),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  reason text,
  unique (company_id, idempotency_key),
  foreign key (lot_id, company_id) references public.stock_lots(id, company_id),
  foreign key (item_id, company_id) references public.items(id, company_id),
  foreign key (location_id, company_id) references public.stock_locations(id, company_id)
);

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  sales_order_line_id uuid not null,
  lot_id uuid not null,
  quantity numeric(18, 6) not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'released', 'consumed')),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 1 and 160),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  released_at timestamptz,
  unique (company_id, idempotency_key),
  foreign key (sales_order_line_id, company_id) references public.sales_order_lines(id, company_id),
  foreign key (lot_id, company_id) references public.stock_lots(id, company_id),
  check ((status = 'released') = (released_at is not null) or status <> 'released')
);

create table public.command_idempotency (
  company_id uuid not null references public.companies(id),
  command_name text not null check (char_length(trim(command_name)) between 1 and 80),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 1 and 160),
  result_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (company_id, command_name, idempotency_key)
);

create index stock_lots_company_idx on public.stock_lots(company_id);
create index stock_ledger_entries_lot_idx on public.stock_ledger_entries(company_id, lot_id);
create index stock_reservations_lot_active_idx on public.stock_reservations(company_id, lot_id) where status = 'active';
create index stock_reservations_sales_order_line_active_idx on public.stock_reservations(company_id, sales_order_line_id) where status = 'active';

create view public.stock_positions
with (security_invoker = true)
as
select
  lot.company_id,
  lot.id as lot_id,
  lot.item_id,
  lot.location_id,
  lot.qc_status,
  coalesce(ledger.on_hand, 0::numeric) as on_hand,
  coalesce(reservation.reserved, 0::numeric) as reserved,
  coalesce(ledger.on_hand, 0::numeric) - coalesce(reservation.reserved, 0::numeric) as available_to_promise
from public.stock_lots lot
left join lateral (
  select sum(entry.quantity_delta) as on_hand
  from public.stock_ledger_entries entry
  where entry.company_id = lot.company_id and entry.lot_id = lot.id
) ledger on true
left join lateral (
  select sum(reservation.quantity) as reserved
  from public.stock_reservations reservation
  where reservation.company_id = lot.company_id
    and reservation.lot_id = lot.id
    and reservation.status = 'active'
) reservation on true;

create function public.reserve_finished_goods(
  p_company_id uuid,
  p_sales_order_line_id uuid,
  p_lot_id uuid,
  p_quantity numeric,
  p_expected_sales_order_revision integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation_id uuid;
  v_line_item_id uuid;
  v_order_id uuid;
  v_order_status text;
  v_order_revision integer;
  v_lot_item_id uuid;
  v_lot_qc_status text;
  v_on_hand numeric(18, 6);
  v_reserved numeric(18, 6);
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;
  if not (select private.has_company_permission(p_company_id, 'stock.reserve')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_expected_sales_order_revision is null
    or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_RESERVATION_REQUEST' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_reservation_id
  from public.command_idempotency
  where company_id = p_company_id and command_name = 'reserve_finished_goods' and idempotency_key = p_idempotency_key;
  if found then
    return v_reservation_id;
  end if;

  select line.item_id, header.id, header.status, header.revision
  into v_line_item_id, v_order_id, v_order_status, v_order_revision
  from public.sales_order_lines line
  join public.sales_orders header on header.id = line.sales_order_id and header.company_id = line.company_id
  where line.id = p_sales_order_line_id and line.company_id = p_company_id
  for update of header;
  if not found then
    raise exception 'SALES_ORDER_LINE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_order_status not in ('open', 'partially_shipped') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if v_order_revision <> p_expected_sales_order_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  select item_id, qc_status into v_lot_item_id, v_lot_qc_status
  from public.stock_lots
  where id = p_lot_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'LOT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_lot_item_id <> v_line_item_id then
    raise exception 'LOT_ITEM_MISMATCH' using errcode = 'P0001';
  end if;
  if v_lot_qc_status <> 'released' then
    raise exception 'LOT_QC_HOLD' using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity_delta), 0::numeric) into v_on_hand
  from public.stock_ledger_entries
  where company_id = p_company_id and lot_id = p_lot_id;
  select coalesce(sum(quantity), 0::numeric) into v_reserved
  from public.stock_reservations
  where company_id = p_company_id and lot_id = p_lot_id and status = 'active';
  if v_on_hand - v_reserved < p_quantity then
    raise exception 'INSUFFICIENT_AVAILABLE_STOCK' using errcode = 'P0001';
  end if;

  insert into public.stock_reservations (company_id, sales_order_line_id, lot_id, quantity, idempotency_key, created_by)
  values (p_company_id, p_sales_order_line_id, p_lot_id, p_quantity, p_idempotency_key, (select auth.uid()))
  returning id into v_reservation_id;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'reserve_finished_goods', p_idempotency_key, v_reservation_id);
  update public.sales_orders
  set revision = revision + 1, updated_at = now()
  where id = v_order_id and company_id = p_company_id;
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key, metadata)
  values (
    p_company_id, (select auth.uid()), 'stock_reservation', v_reservation_id, 'stock.reserved', p_idempotency_key,
    jsonb_build_object('sales_order_line_id', p_sales_order_line_id, 'lot_id', p_lot_id, 'quantity', p_quantity)
  );
  return v_reservation_id;
end;
$$;

revoke all on function public.reserve_finished_goods(uuid, uuid, uuid, numeric, integer, text) from public;
grant execute on function public.reserve_finished_goods(uuid, uuid, uuid, numeric, integer, text) to authenticated;

alter table public.stock_lots enable row level security;
alter table public.stock_ledger_entries enable row level security;
alter table public.stock_reservations enable row level security;
alter table public.command_idempotency enable row level security;

revoke all on public.stock_lots, public.stock_ledger_entries, public.stock_reservations, public.command_idempotency from anon, authenticated;
grant select on public.stock_lots, public.stock_ledger_entries, public.stock_reservations, public.stock_positions to authenticated;

create policy "read company stock lots" on public.stock_lots for select to authenticated
  using ((select private.has_company_permission(company_id, 'stock.read')));
create policy "read company stock ledger" on public.stock_ledger_entries for select to authenticated
  using ((select private.has_company_permission(company_id, 'stock.read')));
create policy "read company stock reservations" on public.stock_reservations for select to authenticated
  using ((select private.has_company_permission(company_id, 'stock.read')));

insert into public.permission_definitions (code, description) values
  ('stock.read', 'Read stock lots, ledger entries and availability.'),
  ('stock.reserve', 'Reserve released finished goods against a sales order.')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code) values
  ('admin', 'stock.read'), ('admin', 'stock.reserve'),
  ('management', 'stock.read'), ('sales', 'stock.read'), ('stores', 'stock.read'), ('stores', 'stock.reserve'),
  ('packing_dispatch', 'stock.read'), ('packing_dispatch', 'stock.reserve')
on conflict do nothing;
