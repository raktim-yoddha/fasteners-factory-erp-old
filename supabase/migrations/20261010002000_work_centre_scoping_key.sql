-- Corrects the first hosted migration: composite references enforce company scope at the database boundary.
alter table public.work_centres
  add constraint work_centres_id_company_key unique (id, company_id);
