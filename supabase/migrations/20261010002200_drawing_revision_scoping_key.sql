-- Adds the composite parent key required by feasibility's pinned drawing reference.
alter table public.drawing_revisions
  add constraint drawing_revisions_id_company_key unique (id, company_id);
