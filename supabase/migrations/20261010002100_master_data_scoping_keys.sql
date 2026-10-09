-- Adds composite parent keys required by tenant-scoped foreign keys in the commercial model.
alter table public.customers
  add constraint customers_id_company_key unique (id, company_id);

alter table public.suppliers
  add constraint suppliers_id_company_key unique (id, company_id);
