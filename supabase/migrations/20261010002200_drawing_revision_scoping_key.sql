-- Compatibility repair: fresh schemas already contain this composite key.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.drawing_revisions'::regclass and conname='drawing_revisions_id_company_key') then
    alter table public.drawing_revisions add constraint drawing_revisions_id_company_key unique (id, company_id);
  end if;
end $$;
