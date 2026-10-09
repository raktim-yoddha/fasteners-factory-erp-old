-- TASK-0002: authorization data is database-owned; never use user metadata for permissions.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum (
  'admin', 'management', 'sales', 'engineering', 'costing', 'planning', 'purchase', 'stores',
  'production_supervisor', 'operator', 'quality', 'subcontract_coordinator', 'packing_dispatch',
  'accounts', 'auditor'
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null check (char_length(trim(name)) between 1 and 160),
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_memberships (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table public.user_company_roles (
  company_id uuid not null,
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id, role),
  foreign key (company_id, user_id)
    references public.company_memberships(company_id, user_id) on delete cascade
);

create table public.permission_definitions (
  code text primary key check (code ~ '^[a-z]+(\.[a-z_]+)+$'),
  description text not null
);

create table public.role_permissions (
  role public.app_role not null,
  permission_code text not null references public.permission_definitions(code) on delete cascade,
  primary key (role, permission_code)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id),
  actor_id uuid references auth.users(id),
  entity_type text not null check (char_length(trim(entity_type)) between 1 and 80),
  entity_id uuid,
  action text not null check (char_length(trim(action)) between 1 and 120),
  occurred_at timestamptz not null default now(),
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  check (idempotency_key is null or char_length(idempotency_key) between 1 and 160)
);

create index company_memberships_user_company_idx on public.company_memberships(user_id, company_id) where active;
create index user_company_roles_user_company_idx on public.user_company_roles(user_id, company_id);
create index audit_log_company_occurred_idx on public.audit_log(company_id, occurred_at desc);

create function private.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = (select auth.uid())
      and membership.active
  );
$$;

create function private.has_company_permission(target_company_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_company_roles user_role
    join public.role_permissions role_permission on role_permission.role = user_role.role
    where user_role.company_id = target_company_id
      and user_role.user_id = (select auth.uid())
      and role_permission.permission_code = required_permission
  );
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Operator'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.is_company_member(uuid) from public;
revoke all on function private.has_company_permission(uuid, text) from public;
revoke all on function private.handle_new_user() from public;
grant execute on function private.is_company_member(uuid) to authenticated;
grant execute on function private.has_company_permission(uuid, text) to authenticated;

create trigger create_profile_after_auth_user
  after insert on auth.users
  for each row execute function private.handle_new_user();

insert into public.permission_definitions (code, description) values
  ('company.settings.manage', 'Manage company and plant settings.'),
  ('members.manage', 'Invite, deactivate and assign company members.'),
  ('audit.read', 'Read the company audit log.'),
  ('master_data.read', 'Read company master data.'),
  ('master_data.manage', 'Create and change company master data.')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code)
select 'admin', code from public.permission_definitions
on conflict do nothing;

insert into public.role_permissions (role, permission_code) values
  ('management', 'audit.read'),
  ('management', 'master_data.read'),
  ('sales', 'master_data.read'),
  ('engineering', 'master_data.read'),
  ('costing', 'master_data.read'),
  ('planning', 'master_data.read'),
  ('purchase', 'master_data.read'),
  ('stores', 'master_data.read'),
  ('production_supervisor', 'master_data.read'),
  ('quality', 'master_data.read'),
  ('subcontract_coordinator', 'master_data.read'),
  ('packing_dispatch', 'master_data.read'),
  ('auditor', 'audit.read')
on conflict do nothing;

alter table public.companies enable row level security;
alter table public.plants enable row level security;
alter table public.profiles enable row level security;
alter table public.company_memberships enable row level security;
alter table public.user_company_roles enable row level security;
alter table public.permission_definitions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.companies, public.plants, public.profiles, public.company_memberships,
  public.user_company_roles, public.permission_definitions, public.role_permissions, public.audit_log
  from anon;
revoke all on public.companies, public.plants, public.profiles, public.company_memberships,
  public.user_company_roles, public.permission_definitions, public.role_permissions, public.audit_log
  from authenticated;

grant select on public.companies, public.plants, public.company_memberships, public.user_company_roles,
  public.permission_definitions, public.role_permissions, public.audit_log to authenticated;
grant select, update on public.profiles to authenticated;
grant insert, update on public.company_memberships, public.user_company_roles to authenticated;
grant update on public.companies, public.plants to authenticated;

create policy "members read their company" on public.companies for select to authenticated
  using ((select private.is_company_member(id)));
create policy "settings managers update their company" on public.companies for update to authenticated
  using ((select private.has_company_permission(id, 'company.settings.manage')))
  with check ((select private.has_company_permission(id, 'company.settings.manage')));

create policy "members read company plants" on public.plants for select to authenticated
  using ((select private.is_company_member(company_id)));
create policy "settings managers update plants" on public.plants for update to authenticated
  using ((select private.has_company_permission(company_id, 'company.settings.manage')))
  with check ((select private.has_company_permission(company_id, 'company.settings.manage')));

create policy "users read profiles in their companies" on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.company_memberships caller_membership
      join public.company_memberships profile_membership on profile_membership.company_id = caller_membership.company_id
      where caller_membership.user_id = (select auth.uid())
        and caller_membership.active
        and profile_membership.user_id = profiles.user_id
        and profile_membership.active
    )
  );
create policy "users update their own profile" on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "members read company membership" on public.company_memberships for select to authenticated
  using ((select private.is_company_member(company_id)));
create policy "member managers add members" on public.company_memberships for insert to authenticated
  with check ((select private.has_company_permission(company_id, 'members.manage')));
create policy "member managers update members" on public.company_memberships for update to authenticated
  using ((select private.has_company_permission(company_id, 'members.manage')))
  with check ((select private.has_company_permission(company_id, 'members.manage')));

create policy "members read company roles" on public.user_company_roles for select to authenticated
  using ((select private.is_company_member(company_id)));
create policy "member managers assign roles" on public.user_company_roles for insert to authenticated
  with check ((select private.has_company_permission(company_id, 'members.manage')));
create policy "member managers change roles" on public.user_company_roles for update to authenticated
  using ((select private.has_company_permission(company_id, 'members.manage')))
  with check ((select private.has_company_permission(company_id, 'members.manage')));

create policy "authenticated users read permission definitions" on public.permission_definitions for select to authenticated
  using (true);
create policy "authenticated users read role permissions" on public.role_permissions for select to authenticated
  using (true);
create policy "authorized users read audit records" on public.audit_log for select to authenticated
  using ((select private.has_company_permission(company_id, 'audit.read')));
