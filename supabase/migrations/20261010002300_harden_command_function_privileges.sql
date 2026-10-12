-- Supabase's default function privileges can include anon; commands must remain callable only after authentication.
do $$
declare
  command_function record;
begin
  for command_function in
    select p.oid::regprocedure as identity
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon', command_function.identity);
  end loop;
end;
$$;

-- Hosted Supabase may install this helper; the disposable local stack does not.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

create policy "no direct command idempotency access" on public.command_idempotency
  for select to authenticated using (false);
