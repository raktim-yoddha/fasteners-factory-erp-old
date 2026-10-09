-- TASK-0004: production records will pin approved revision ids; revisions never overwrite history.
create table public.boms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  output_item_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (company_id, output_item_id),
  unique (id, company_id),
  foreign key (output_item_id, company_id) references public.items(id, company_id)
);

create table public.bom_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  bom_id uuid not null,
  revision text not null check (char_length(trim(revision)) between 1 and 24),
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded', 'withdrawn')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (bom_id, revision),
  unique (id, company_id),
  foreign key (bom_id, company_id) references public.boms(id, company_id),
  check ((status = 'approved') = (approved_at is not null and approved_by is not null))
);

create table public.bom_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  bom_revision_id uuid not null,
  component_item_id uuid not null,
  quantity numeric(18, 6) not null check (quantity > 0),
  uom text not null check (uom in ('pcs', 'kg', 'm', 'set')),
  scrap_allowance_pct numeric(7, 4) not null default 0 check (scrap_allowance_pct between 0 and 100),
  created_at timestamptz not null default now(),
  unique (bom_revision_id, component_item_id),
  foreign key (bom_revision_id, company_id) references public.bom_revisions(id, company_id),
  foreign key (component_item_id, company_id) references public.items(id, company_id)
);

create table public.routings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  output_item_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (company_id, output_item_id),
  unique (id, company_id),
  foreign key (output_item_id, company_id) references public.items(id, company_id)
);

create table public.routing_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  routing_id uuid not null,
  revision text not null check (char_length(trim(revision)) between 1 and 24),
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded', 'withdrawn')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (routing_id, revision),
  unique (id, company_id),
  foreign key (routing_id, company_id) references public.routings(id, company_id),
  check ((status = 'approved') = (approved_at is not null and approved_by is not null))
);

create table public.routing_operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  routing_revision_id uuid not null,
  sequence integer not null check (sequence > 0),
  work_centre_id uuid not null,
  operation_name text not null check (char_length(trim(operation_name)) between 1 and 160),
  setup_minutes numeric(12, 2) not null default 0 check (setup_minutes >= 0),
  run_minutes_per_unit numeric(12, 4) not null default 0 check (run_minutes_per_unit >= 0),
  created_at timestamptz not null default now(),
  unique (routing_revision_id, sequence),
  foreign key (routing_revision_id, company_id) references public.routing_revisions(id, company_id),
  foreign key (work_centre_id, company_id) references public.work_centres(id, company_id)
);

create index boms_company_idx on public.boms(company_id);
create index bom_revisions_company_idx on public.bom_revisions(company_id);
create index bom_lines_company_idx on public.bom_lines(company_id);
create index routings_company_idx on public.routings(company_id);
create index routing_revisions_company_idx on public.routing_revisions(company_id);
create index routing_operations_company_idx on public.routing_operations(company_id);

create function private.prevent_approved_revision_change()
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

create function private.is_bom_revision_draft(target_revision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bom_revisions where id = target_revision_id and status = 'draft');
$$;

create function private.is_routing_revision_draft(target_revision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.routing_revisions where id = target_revision_id and status = 'draft');
$$;

revoke all on function private.prevent_approved_revision_change() from public;
revoke all on function private.is_bom_revision_draft(uuid) from public;
revoke all on function private.is_routing_revision_draft(uuid) from public;
grant execute on function private.is_bom_revision_draft(uuid) to authenticated;
grant execute on function private.is_routing_revision_draft(uuid) to authenticated;

create trigger prevent_approved_bom_revision_change before update on public.bom_revisions
  for each row execute function private.prevent_approved_revision_change();
create trigger prevent_approved_routing_revision_change before update on public.routing_revisions
  for each row execute function private.prevent_approved_revision_change();

alter table public.boms enable row level security;
alter table public.bom_revisions enable row level security;
alter table public.bom_lines enable row level security;
alter table public.routings enable row level security;
alter table public.routing_revisions enable row level security;
alter table public.routing_operations enable row level security;

revoke all on public.boms, public.bom_revisions, public.bom_lines, public.routings, public.routing_revisions,
  public.routing_operations from anon, authenticated;
grant select, insert, update on public.boms, public.bom_revisions, public.routings, public.routing_revisions to authenticated;
grant select, insert, update on public.bom_lines, public.routing_operations to authenticated;

create policy "read company boms" on public.boms for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company boms" on public.boms for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));

create policy "read company bom revisions" on public.bom_revisions for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company bom revisions" on public.bom_revisions for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));

create policy "read company bom lines" on public.bom_lines for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage draft bom lines" on public.bom_lines for all to authenticated
  using (
    (select private.has_company_permission(company_id, 'master_data.manage'))
    and (select private.is_bom_revision_draft(bom_revision_id))
  )
  with check (
    (select private.has_company_permission(company_id, 'master_data.manage'))
    and (select private.is_bom_revision_draft(bom_revision_id))
  );

create policy "read company routings" on public.routings for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company routings" on public.routings for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));

create policy "read company routing revisions" on public.routing_revisions for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage company routing revisions" on public.routing_revisions for all to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.manage')))
  with check ((select private.has_company_permission(company_id, 'master_data.manage')));

create policy "read company routing operations" on public.routing_operations for select to authenticated
  using ((select private.has_company_permission(company_id, 'master_data.read')));
create policy "manage draft routing operations" on public.routing_operations for all to authenticated
  using (
    (select private.has_company_permission(company_id, 'master_data.manage'))
    and (select private.is_routing_revision_draft(routing_revision_id))
  )
  with check (
    (select private.has_company_permission(company_id, 'master_data.manage'))
    and (select private.is_routing_revision_draft(routing_revision_id))
  );

insert into public.role_permissions (role, permission_code)
values ('engineering', 'master_data.manage')
on conflict do nothing;
