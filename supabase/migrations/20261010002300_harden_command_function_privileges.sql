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

revoke all on function public.rls_auto_enable() from public, anon, authenticated;

create policy "no direct command idempotency access" on public.command_idempotency
  for select to authenticated using (false);
