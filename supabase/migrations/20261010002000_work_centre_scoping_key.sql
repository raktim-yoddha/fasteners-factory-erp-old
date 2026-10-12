-- Compatibility repair: fresh schemas already contain this composite key.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.work_centres'::regclass and conname='work_centres_id_company_key') then
    alter table public.work_centres add constraint work_centres_id_company_key unique (id, company_id);
  end if;
end $$;
