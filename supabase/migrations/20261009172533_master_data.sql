-- TASK-0003: fictional SAMPLE records may be added only after a trusted company bootstrap exists.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  name text not null check (char_length(trim(name)) between 1 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  name text not null check (char_length(trim(name)) between 1 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  sku text not null check (sku ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'),
  description text not null check (char_length(trim(description)) between 1 and 500),
  base_uom text not null check (base_uom in ('pcs', 'kg', 'm', 'set')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku),
  unique (id, company_id)
);

create table public.drawings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  item_id uuid not null,
  drawing_number text not null check (char_length(trim(drawing_number)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (company_id, drawing_number),
  unique (id, company_id),
  foreign key (item_id, company_id) references public.items(id, company_id)
);

create table public.drawing_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  drawing_id uuid not null,
  revision text not null check (char_length(trim(revision)) between 1 and 24),
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded', 'withdrawn')),
  file_path text,
  checksum text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (drawing_id, revision),
  foreign key (drawing_id, company_id) references public.drawings(id, company_id),
  check ((status = 'approved') = (approved_at is not null and approved_by is not null))
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  plant_id uuid not null,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  name text not null check (char_length(trim(name)) between 1 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (plant_id, company_id) references public.plants(id, company_id)
);

create table public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  warehouse_id uuid not null,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  name text not null check (char_length(trim(name)) between 1 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (warehouse_id, code),
  foreign key (warehouse_id, company_id) references public.warehouses(id, company_id)
);

create table public.work_centres (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  plant_id uuid not null,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  name text not null check (char_length(trim(name)) between 1 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  foreign key (plant_id, company_id) references public.plants(id, company_id)
);

create index customers_company_idx on public.customers(company_id);
create index suppliers_company_idx on public.suppliers(company_id);
create index items_company_idx on public.items(company_id);
create index drawings_company_idx on public.drawings(company_id);
create index drawing_revisions_company_idx on public.drawing_revisions(company_id);
create index warehouses_company_idx on public.warehouses(company_id);
create index stock_locations_company_idx on public.stock_locations(company_id);
create index work_centres_company_idx on public.work_centres(company_id);

create function private.prevent_approved_drawing_revision_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'approved' then
    raise exception 'APPROVED_REVISION_IMMUTABLE';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_approved_drawing_revision_change() from public;
create trigger prevent_approved_drawing_revision_change
  before update on public.drawing_revisions
  for each row execute function private.prevent_approved_drawing_revision_change();

alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.items enable row level security;
alter table public.drawings enable row level security;
alter table public.drawing_revisions enable row level security;
alter table public.warehouses enable row level security;
alter table public.stock_locations enable row level security;
alter table public.work_centres enable row level security;

revoke all on public.customers, public.suppliers, public.items, public.drawings, public.drawing_revisions,
  public.warehouses, public.stock_locations, public.work_centres from anon, authenticated;
grant select, insert, update on public.customers, public.suppliers, public.items, public.drawings,
  public.drawing_revisions, public.warehouses, public.stock_locations, public.work_centres to authenticated;

create policy "read company customers" on public.customers for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company customers" on public.customers for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));

create policy "read company suppliers" on public.suppliers for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company suppliers" on public.suppliers for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));

create policy "read company items" on public.items for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company items" on public.items for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));

create policy "read company drawings" on public.drawings for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company drawings" on public.drawings for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));

create policy "read company drawing revisions" on public.drawing_revisions for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company drawing revisions" on public.drawing_revisions for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));

create policy "read company warehouses" on public.warehouses for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company warehouses" on public.warehouses for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));

create policy "read company stock locations" on public.stock_locations for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company stock locations" on public.stock_locations for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));

create policy "read company work centres" on public.work_centres for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company work centres" on public.work_centres for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));
