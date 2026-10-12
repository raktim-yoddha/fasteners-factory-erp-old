-- Compatibility repair: fresh schemas already contain these composite keys.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.customers'::regclass and conname='customers_id_company_key') then
    alter table public.customers add constraint customers_id_company_key unique (id, company_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.suppliers'::regclass and conname='suppliers_id_company_key') then
    alter table public.suppliers add constraint suppliers_id_company_key unique (id, company_id);
  end if;
end $$;
