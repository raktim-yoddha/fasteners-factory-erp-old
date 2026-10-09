-- TASK-0005: commercial state transitions are command-only; clients receive read access, not direct state writes.
create table public.rfqs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  rfq_number text not null check (rfq_number ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'),
  customer_id uuid not null,
  status text not null default 'new' check (status in ('new', 'awaiting_info', 'review_required', 'qualified', 'lost', 'duplicate')),
  due_date date,
  requirement_summary text not null check (char_length(trim(requirement_summary)) between 1 and 2000),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, rfq_number),
  unique (id, company_id),
  foreign key (customer_id, company_id) references public.customers(id, company_id)
);

create table public.rfq_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  rfq_id uuid not null,
  item_id uuid,
  requested_description text not null check (char_length(trim(requested_description)) between 1 and 500),
  quantity numeric(18, 6) not null check (quantity > 0),
  uom text not null check (uom in ('pcs', 'kg', 'm', 'set')),
  required_by date,
  foreign key (rfq_id, company_id) references public.rfqs(id, company_id),
  foreign key (item_id, company_id) references public.items(id, company_id)
);

create table public.feasibility_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  rfq_id uuid not null,
  status text not null default 'under_review' check (status in ('engineering_pending', 'under_review', 'info_required', 'feasible', 'conditional', 'not_feasible')),
  drawing_revision_id uuid,
  bom_revision_id uuid,
  routing_revision_id uuid,
  conditions text,
  revision integer not null default 1 check (revision > 0),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (rfq_id),
  foreign key (rfq_id, company_id) references public.rfqs(id, company_id),
  foreign key (drawing_revision_id, company_id) references public.drawing_revisions(id, company_id),
  foreign key (bom_revision_id, company_id) references public.bom_revisions(id, company_id),
  foreign key (routing_revision_id, company_id) references public.routing_revisions(id, company_id)
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  quotation_number text not null check (quotation_number ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'),
  rfq_id uuid not null,
  customer_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'accepted', 'rejected', 'expired')),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  valid_until date,
  revision integer not null default 1 check (revision > 0),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, quotation_number),
  unique (id, company_id),
  foreign key (rfq_id, company_id) references public.rfqs(id, company_id),
  foreign key (customer_id, company_id) references public.customers(id, company_id),
  check ((status = 'approved') = (approved_at is not null and approved_by is not null) or status <> 'approved')
);

create table public.quotation_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  quotation_id uuid not null,
  item_id uuid not null,
  quantity numeric(18, 6) not null check (quantity > 0),
  uom text not null check (uom in ('pcs', 'kg', 'm', 'set')),
  unit_price numeric(18, 4) not null check (unit_price >= 0),
  bom_revision_id uuid,
  routing_revision_id uuid,
  foreign key (quotation_id, company_id) references public.quotations(id, company_id),
  foreign key (item_id, company_id) references public.items(id, company_id),
  foreign key (bom_revision_id, company_id) references public.bom_revisions(id, company_id),
  foreign key (routing_revision_id, company_id) references public.routing_revisions(id, company_id),
  unique (id, company_id)
);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  sales_order_number text not null check (sales_order_number ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'),
  quotation_id uuid not null,
  customer_id uuid not null,
  customer_po_number text not null check (char_length(trim(customer_po_number)) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'partially_shipped', 'fulfilled', 'cancelled')),
  promised_date date,
  created_at timestamptz not null default now(),
  unique (company_id, sales_order_number),
  unique (quotation_id),
  unique (id, company_id),
  foreign key (quotation_id, company_id) references public.quotations(id, company_id),
  foreign key (customer_id, company_id) references public.customers(id, company_id)
);

create table public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sales_order_id uuid not null,
  quotation_line_id uuid not null,
  item_id uuid not null,
  ordered_quantity numeric(18, 6) not null check (ordered_quantity > 0),
  uom text not null check (uom in ('pcs', 'kg', 'm', 'set')),
  unit_price numeric(18, 4) not null check (unit_price >= 0),
  bom_revision_id uuid,
  routing_revision_id uuid,
  foreign key (sales_order_id, company_id) references public.sales_orders(id, company_id),
  foreign key (quotation_line_id, company_id) references public.quotation_lines(id, company_id),
  foreign key (item_id, company_id) references public.items(id, company_id),
  foreign key (bom_revision_id, company_id) references public.bom_revisions(id, company_id),
  foreign key (routing_revision_id, company_id) references public.routing_revisions(id, company_id)
);

create index rfqs_company_idx on public.rfqs(company_id);
create index feasibility_reviews_company_idx on public.feasibility_reviews(company_id);
create index quotations_company_idx on public.quotations(company_id);
create index sales_orders_company_idx on public.sales_orders(company_id);

alter table public.rfqs enable row level security;
alter table public.rfq_lines enable row level security;
alter table public.feasibility_reviews enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_lines enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;

revoke all on public.rfqs, public.rfq_lines, public.feasibility_reviews, public.quotations, public.quotation_lines,
  public.sales_orders, public.sales_order_lines from anon, authenticated;
grant select on public.rfqs, public.rfq_lines, public.feasibility_reviews, public.quotations, public.quotation_lines,
  public.sales_orders, public.sales_order_lines to authenticated;

create policy "read company rfqs" on public.rfqs for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales.read')));
create policy "read company rfq lines" on public.rfq_lines for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales.read')));
create policy "read company feasibility" on public.feasibility_reviews for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales.read')));
create policy "read company quotations" on public.quotations for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales.read')));
create policy "read company quotation lines" on public.quotation_lines for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales.read')));
create policy "read company sales orders" on public.sales_orders for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales.read')));
create policy "read company sales order lines" on public.sales_order_lines for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales.read')));

insert into public.permission_definitions (code, description) values
  ('sales.read', 'Read RFQs, quotations and sales orders.'),
  ('sales.manage', 'Create and advance commercial records.'),
  ('engineering.feasibility.manage', 'Record feasibility decisions.'),
  ('quotation.approve', 'Approve quotations before acceptance.')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code) values
  ('admin', 'sales.read'), ('admin', 'sales.manage'), ('admin', 'engineering.feasibility.manage'), ('admin', 'quotation.approve'),
  ('management', 'sales.read'), ('sales', 'sales.read'), ('sales', 'sales.manage'),
  ('engineering', 'sales.read'), ('engineering', 'engineering.feasibility.manage'),
  ('costing', 'sales.read'), ('costing', 'sales.manage'), ('management', 'quotation.approve')
on conflict do nothing;
