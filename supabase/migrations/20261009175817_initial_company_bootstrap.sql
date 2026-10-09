-- TASK-0002: one approved user can establish the first tenant; all later tenants need protected administration.
create function public.bootstrap_initial_company(
  p_company_name text,
  p_plant_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0001'; end if;
  if p_company_name is null or char_length(trim(p_company_name)) = 0
    or p_plant_name is null or char_length(trim(p_plant_name)) = 0 then
    raise exception 'INVALID_BOOTSTRAP_REQUEST' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fasteners-factory-initial-company', 0));
  if exists (select 1 from public.companies) then
    raise exception 'INITIAL_COMPANY_ALREADY_EXISTS' using errcode = 'P0001';
  end if;
  insert into public.companies (name, created_by)
  values (trim(p_company_name), (select auth.uid()))
  returning id into v_company_id;
  insert into public.plants (company_id, name)
  values (v_company_id, trim(p_plant_name));
  insert into public.company_memberships (company_id, user_id)
  values (v_company_id, (select auth.uid()));
  insert into public.user_company_roles (company_id, user_id, role)
  values (v_company_id, (select auth.uid()), 'admin');
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action)
  values (v_company_id, (select auth.uid()), 'company', v_company_id, 'company.bootstraped');
  return v_company_id;
end;
$$;

revoke all on function public.bootstrap_initial_company(text, text) from public;
grant execute on function public.bootstrap_initial_company(text, text) to authenticated;
