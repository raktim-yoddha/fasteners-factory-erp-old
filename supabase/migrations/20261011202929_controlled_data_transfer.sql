insert into public.permission_definitions(code,description) values
 ('imports.read','Read controlled import previews and reconciliation.'),('imports.manage','Record validated import previews.'),('imports.approve','Apply a reviewed import atomically.'),
 ('exports.read','Read accounting handoff snapshots.'),('exports.manage','Prepare an accounting handoff snapshot.'),('exports.approve','Approve a reviewed accounting handoff snapshot.') on conflict do nothing;
insert into public.role_permissions(role,permission_code) select 'admin',code from public.permission_definitions where code like 'imports.%' or code like 'exports.%' on conflict do nothing;
insert into public.role_permissions(role,permission_code) values ('accounts','exports.read'),('accounts','exports.manage'),('management','exports.read'),('management','exports.approve'),('auditor','imports.read'),('auditor','exports.read') on conflict do nothing;
create table public.import_batches (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 kind text not null check(kind in ('customers','suppliers','items','opening_stock')),source_name text not null check(char_length(trim(source_name)) between 1 and 160),source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows) between 1 and 500),errors jsonb not null check(jsonb_typeof(errors)='array'),
 status text not null default 'preview' check(status in ('preview','applied')),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 applied_by uuid references auth.users(id),applied_at timestamptz,approval_reason text,
 unique(id,company_id),check((status='preview' and applied_by is null and applied_at is null and approval_reason is null) or (status='applied' and applied_by is not null and applied_at is not null and char_length(trim(approval_reason)) between 1 and 2000))
);
create table public.import_records (
 batch_id uuid not null,company_id uuid not null,row_number integer not null check(row_number>0),entity_type text not null,entity_id uuid not null,
 primary key(batch_id,row_number),foreign key(batch_id,company_id) references public.import_batches(id,company_id)
);
alter table public.import_batches enable row level security;alter table public.import_records enable row level security;
revoke all on public.import_batches,public.import_records from public,anon,authenticated;grant select on public.import_batches,public.import_records to authenticated;
create policy permitted_imports on public.import_batches for select to authenticated using((select private.has_company_permission(company_id,'imports.read')));
create policy permitted_import_records on public.import_records for select to authenticated using((select private.has_company_permission(company_id,'imports.read')));
create trigger immutable_import_records before update or delete on public.import_records for each row execute function private.reject_lot_history_change();
create function private.guard_import_batch() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'IMPORT_IMMUTABLE';end if;
 if old.status<>'preview' or new.status<>'applied' or (to_jsonb(new)-array['status','applied_by','applied_at','approval_reason']) is distinct from (to_jsonb(old)-array['status','applied_by','applied_at','approval_reason']) then raise exception 'IMPORT_IMMUTABLE';end if;return new;
end $$;
revoke all on function private.guard_import_batch() from public,anon,authenticated;
create trigger immutable_import_batch before update or delete on public.import_batches for each row execute function private.guard_import_batch();
create function private.validate_import_rows(p_company_id uuid,p_kind text,p_rows jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_row jsonb;v_errors jsonb:='[]';v_message text;v_key text;v_keys text[]:=array[]::text[];v_n integer:=0;
begin
 if p_kind not in ('customers','suppliers','items','opening_stock') or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'INVALID_IMPORT_REQUEST';end if;
 for v_row in select value from jsonb_array_elements(p_rows) loop
  v_n:=v_n+1;v_message:=null;v_key:=upper(trim(v_row->>case when p_kind in ('customers','suppliers') then 'code' when p_kind='items' then 'sku' else 'lot_code' end));
  if jsonb_typeof(v_row) is distinct from 'object' then v_message:='Expected a record.';
  elsif v_key is null or v_key !~ '^[A-Z0-9][A-Z0-9/-]{2,63}$' then v_message:='Use a code of 3 to 64 letters, digits, slash or hyphen.';
  elsif v_key=any(v_keys) then v_message:='Duplicate code within this file.';
  elsif p_kind in ('customers','suppliers') then
   if v_row->>'name' is null or char_length(trim(v_row->>'name')) not between 1 and 160 then v_message:='Name is required (up to 160 characters).';
   elsif (p_kind='customers' and exists(select 1 from public.customers where company_id=p_company_id and code=v_key)) or (p_kind='suppliers' and exists(select 1 from public.suppliers where company_id=p_company_id and code=v_key)) then v_message:='This code already exists. Imports never overwrite masters.';end if;
  elsif p_kind='items' then
   if v_row->>'description' is null or char_length(trim(v_row->>'description')) not between 1 and 500 then v_message:='Description is required (up to 500 characters).';
   elsif coalesce(v_row->>'base_uom','') not in ('pcs','kg','m','set') then v_message:='Base unit must be pcs, kg, m or set.';
   elsif exists(select 1 from public.items where company_id=p_company_id and sku=v_key) then v_message:='This SKU already exists. Imports never overwrite masters.';end if;
  else
   if coalesce(v_row->>'quantity','') !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' then v_message:='Use an exact positive quantity with up to six decimal places.';
   elsif (v_row->>'quantity')::numeric<=0 then v_message:='Quantity must be positive.';
   elsif not exists(select 1 from public.items where company_id=p_company_id and sku=upper(trim(v_row->>'sku')) and active and base_uom=v_row->>'uom') then v_message:='SKU or base unit does not match an active item.';
   elsif (select count(*) from public.stock_locations where company_id=p_company_id and code=upper(trim(v_row->>'location_code')) and active)<>1 then v_message:='Receiving location is unavailable or its code is ambiguous across warehouses.';
   elsif exists(select 1 from public.stock_lots where company_id=p_company_id and lot_code=v_key) then v_message:='This lot already exists.';
   elsif v_row->>'reference' is null or char_length(trim(v_row->>'reference')) not between 1 and 500 then v_message:='Record the counted opening balance source reference.';end if;
  end if;
  v_keys:=array_append(v_keys,v_key);
  if v_message is not null then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('row',v_n,'message',v_message));end if;
 end loop;return v_errors;
end $$;
revoke all on function private.validate_import_rows(uuid,text,jsonb) from public,anon,authenticated;
create function public.preview_data_import(p_company_id uuid,p_data jsonb,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_errors jsonb;
begin
 v_id:=private.begin_material_command(p_company_id,'imports.manage','import.preview',p_idempotency_key,p_data);if v_id is not null then return v_id;end if;
 v_errors:=private.validate_import_rows(p_company_id,p_data->>'kind',p_data->'rows');
 insert into public.import_batches(company_id,kind,source_name,source_sha256,rows,errors,created_by) values(p_company_id,p_data->>'kind',trim(p_data->>'source_name'),p_data->>'source_sha256',p_data->'rows',v_errors,(select auth.uid())) returning id into v_id;
 return private.finish_material_command(p_company_id,'import.preview',p_idempotency_key,p_data,v_id,'import_batch');
end $$;
create function public.apply_data_import(p_company_id uuid,p_batch_id uuid,p_reason text,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_batch public.import_batches%rowtype;v_row jsonb;v_n integer:=0;v_item uuid;v_location uuid;v_type text;v_request jsonb:=jsonb_build_array(p_batch_id,p_reason);
begin
 v_id:=private.begin_material_command(p_company_id,'imports.approve','import.apply',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 select * into v_batch from public.import_batches where id=p_batch_id and company_id=p_company_id for update;
 if not found or v_batch.status<>'preview' then raise exception 'INVALID_TRANSITION';end if;
 if p_reason is null or char_length(trim(p_reason)) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 if jsonb_array_length(v_batch.errors)>0 or jsonb_array_length(private.validate_import_rows(p_company_id,v_batch.kind,v_batch.rows))>0 then raise exception 'IMPORT_VALIDATION_FAILED';end if;
 if v_batch.kind='opening_stock' and not private.has_company_permission(p_company_id,'stock.receive') then raise exception 'FORBIDDEN';end if;
 for v_row in select value from jsonb_array_elements(v_batch.rows) loop
  v_n:=v_n+1;
  if v_batch.kind='customers' then insert into public.customers(company_id,code,name) values(p_company_id,upper(trim(v_row->>'code')),trim(v_row->>'name')) returning id into v_id;v_type:='customer';
  elsif v_batch.kind='suppliers' then insert into public.suppliers(company_id,code,name) values(p_company_id,upper(trim(v_row->>'code')),trim(v_row->>'name')) returning id into v_id;v_type:='supplier';
  elsif v_batch.kind='items' then insert into public.items(company_id,sku,description,base_uom) values(p_company_id,upper(trim(v_row->>'sku')),trim(v_row->>'description'),v_row->>'base_uom') returning id into v_id;v_type:='item';
  else
   select id into v_item from public.items where company_id=p_company_id and sku=upper(trim(v_row->>'sku')) and active;
   select id into v_location from public.stock_locations where company_id=p_company_id and code=upper(trim(v_row->>'location_code')) and active;
   v_id:=public.receive_finished_goods(p_company_id,v_item,v_location,upper(trim(v_row->>'lot_code')),(v_row->>'quantity')::numeric,v_row->>'uom','import:'||v_batch.id::text||':'||v_n::text);v_type:='stock_lot';
  end if;
  insert into public.import_records(batch_id,company_id,row_number,entity_type,entity_id) values(v_batch.id,p_company_id,v_n,v_type,v_id);
 end loop;
 update public.import_batches set status='applied',applied_by=(select auth.uid()),applied_at=now(),approval_reason=trim(p_reason) where id=v_batch.id;
 return private.finish_material_command(p_company_id,'import.apply',p_idempotency_key,v_request,v_batch.id,'import_batch',trim(p_reason));
end $$;
create function public.get_data_imports(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'imports.read') then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('records',coalesce((select jsonb_agg(to_jsonb(r) order by row_number) from public.import_records r where batch_id=b.id),'[]'::jsonb)) order by created_at desc,id) from public.import_batches b where company_id=p_company_id),'[]'::jsonb);
end $$;
revoke all on function public.preview_data_import(uuid,jsonb,text),public.apply_data_import(uuid,uuid,text,text),public.get_data_imports(uuid) from public,anon;
grant execute on function public.preview_data_import(uuid,jsonb,text),public.apply_data_import(uuid,uuid,text,text),public.get_data_imports(uuid) to authenticated;

create table public.accounting_export_batches (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),from_date date not null,to_date date not null check(to_date>=from_date),
 format_version integer not null default 1 check(format_version=1),rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)<=1000),
 totals jsonb not null,status text not null default 'draft' check(status in ('draft','approved')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),approved_by uuid references auth.users(id),approved_at timestamptz,approval_reason text,
 check((status='draft' and approved_by is null and approved_at is null and approval_reason is null) or (status='approved' and approved_by is not null and approved_at is not null and char_length(trim(approval_reason)) between 1 and 2000))
);
alter table public.accounting_export_batches enable row level security;
revoke all on public.accounting_export_batches from public,anon,authenticated;grant select on public.accounting_export_batches to authenticated;
create policy permitted_accounting_exports on public.accounting_export_batches for select to authenticated using((select private.has_company_permission(company_id,'exports.read')));
create function private.guard_accounting_export() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'EXPORT_IMMUTABLE';end if;
 if old.status<>'draft' or new.status<>'approved' or (to_jsonb(new)-array['status','approved_by','approved_at','approval_reason']) is distinct from (to_jsonb(old)-array['status','approved_by','approved_at','approval_reason']) then raise exception 'EXPORT_IMMUTABLE';end if;return new;
end $$;
revoke all on function private.guard_accounting_export() from public,anon,authenticated;
create trigger immutable_accounting_export before update or delete on public.accounting_export_batches for each row execute function private.guard_accounting_export();
create function public.prepare_accounting_export(p_company_id uuid,p_from_date date,p_to_date date,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_rows jsonb;v_totals jsonb;v_from timestamptz;v_to timestamptz;v_request jsonb:=jsonb_build_array(p_from_date,p_to_date);
begin
 v_id:=private.begin_material_command(p_company_id,'exports.manage','export.prepare',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 if p_from_date is null or p_to_date is null or p_to_date<p_from_date then raise exception 'INVALID_DATE_RANGE';end if;
 v_from:=p_from_date::timestamp at time zone 'Asia/Kolkata';v_to:=(p_to_date+1)::timestamp at time zone 'Asia/Kolkata';
 with events as(
  select 'purchase_receipt'::text event_type,g.id record_id,g.receipt_number reference,g.created_at occurred_at,s.code party_code,i.sku,g.quantity quantity,g.uom,p.currency_code currency,p.unit_price unit_price,g.quantity*p.unit_price amount
   from public.goods_receipts g join public.purchase_orders p on p.id=g.purchase_order_id join public.suppliers s on s.id=p.supplier_id join public.stock_lots l on l.id=g.lot_id join public.items i on i.id=l.item_id where g.company_id=p_company_id and g.created_at>=v_from and g.created_at<v_to
  union all select 'supplier_return',r.id,g.receipt_number,r.created_at,s.code,i.sku,-r.quantity,g.uom,p.currency_code,p.unit_price,-r.quantity*p.unit_price
   from public.goods_returns r join public.goods_receipts g on g.id=r.receipt_id join public.purchase_orders p on p.id=g.purchase_order_id join public.suppliers s on s.id=p.supplier_id join public.stock_lots l on l.id=g.lot_id join public.items i on i.id=l.item_id where r.company_id=p_company_id and r.created_at>=v_from and r.created_at<v_to
  union all select 'dispatch',l.id,s.shipment_number,s.dispatched_at,c.code,i.sku,l.quantity,sl.uom,q.currency_code,sl.unit_price,l.quantity*sl.unit_price
   from public.shipment_lines l join public.shipments s on s.id=l.shipment_id join public.stock_reservations r on r.id=l.reservation_id join public.sales_order_lines sl on sl.id=r.sales_order_line_id join public.sales_orders so on so.id=sl.sales_order_id join public.customers c on c.id=so.customer_id join public.items i on i.id=sl.item_id join public.quotation_lines ql on ql.id=sl.quotation_line_id join public.quotations q on q.id=ql.quotation_id where l.company_id=p_company_id and s.status='dispatched' and s.dispatched_at>=v_from and s.dispatched_at<v_to
  union all select 'customer_return',cr.id,cr.return_number,cr.created_at,c.code,i.sku,-cr.quantity,cr.uom,q.currency_code,sl.unit_price,-cr.quantity*sl.unit_price
   from public.customer_return_receipts cr join public.shipment_lines l on l.id=cr.shipment_line_id join public.stock_reservations r on r.id=l.reservation_id join public.sales_order_lines sl on sl.id=r.sales_order_line_id join public.sales_orders so on so.id=sl.sales_order_id join public.customers c on c.id=so.customer_id join public.items i on i.id=sl.item_id join public.quotation_lines ql on ql.id=sl.quotation_line_id join public.quotations q on q.id=ql.quotation_id where cr.company_id=p_company_id and cr.created_at>=v_from and cr.created_at<v_to
 ),bounded as(select * from events order by occurred_at,record_id limit 1001)
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('quantity',quantity::text,'unit_price',unit_price::text,'amount',amount::text) order by occurred_at,record_id),'[]'::jsonb) into v_rows from bounded e;
 if jsonb_array_length(v_rows)>1000 then raise exception 'EXPORT_RANGE_TOO_LARGE';end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into v_totals from (select event_type,currency,count(*) record_count,sum(amount)::text amount from jsonb_to_recordset(v_rows) as r(event_type text,currency text,amount numeric) group by event_type,currency order by event_type,currency) t;
 insert into public.accounting_export_batches(company_id,from_date,to_date,rows,totals,created_by) values(p_company_id,p_from_date,p_to_date,v_rows,v_totals,(select auth.uid())) returning id into v_id;
 return private.finish_material_command(p_company_id,'export.prepare',p_idempotency_key,v_request,v_id,'accounting_export');
end $$;
create function public.approve_accounting_export(p_company_id uuid,p_batch_id uuid,p_reason text,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_batch public.accounting_export_batches%rowtype;v_request jsonb:=jsonb_build_array(p_batch_id,p_reason);
begin
 v_id:=private.begin_material_command(p_company_id,'exports.approve','export.approve',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 select * into v_batch from public.accounting_export_batches where id=p_batch_id and company_id=p_company_id for update;
 if not found or v_batch.status<>'draft' then raise exception 'INVALID_TRANSITION';end if;
 if p_reason is null or char_length(trim(p_reason)) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 update public.accounting_export_batches set status='approved',approved_by=(select auth.uid()),approved_at=now(),approval_reason=trim(p_reason) where id=v_batch.id;
 return private.finish_material_command(p_company_id,'export.approve',p_idempotency_key,v_request,v_batch.id,'accounting_export',trim(p_reason));
end $$;
create function public.get_accounting_exports(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'exports.read') then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(to_jsonb(b) order by created_at desc,id) from public.accounting_export_batches b where company_id=p_company_id),'[]'::jsonb);
end $$;
revoke all on function public.prepare_accounting_export(uuid,date,date,text),public.approve_accounting_export(uuid,uuid,text,text),public.get_accounting_exports(uuid) from public,anon;
grant execute on function public.prepare_accounting_export(uuid,date,date,text),public.approve_accounting_export(uuid,uuid,text,text),public.get_accounting_exports(uuid) to authenticated;

create or replace function public.set_company_member_access(p_company_id uuid,p_data jsonb,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_user uuid;v_member public.company_memberships%rowtype;v_roles public.app_role[];v_active boolean;v_before jsonb;
begin
 v_id:=private.begin_material_command(p_company_id,'members.manage','member.access',p_idempotency_key,p_data);if v_id is not null then return v_id;end if;
 v_user:=(p_data->>'user_id')::uuid;v_active:=(p_data->>'active')::boolean;
 if v_user is null or v_active is null or jsonb_typeof(p_data->'roles') is distinct from 'array' or jsonb_array_length(p_data->'roles') not between 1 and 15 then raise exception 'INVALID_REQUEST';end if;
 if p_data->>'reason' is null or char_length(trim(p_data->>'reason')) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 select array_agg(distinct role::public.app_role order by role::public.app_role) into v_roles from jsonb_array_elements_text(p_data->'roles') role;
 if not exists(select 1 from auth.users where id=v_user and deleted_at is null) then raise exception 'APPROVED_ACCOUNT_NOT_FOUND';end if;
 -- Serialize all administrator changes, including concurrent removal of the last administrators.
 perform 1 from public.companies where id=p_company_id for update;
 if not private.has_company_permission(p_company_id,'members.manage') then raise exception 'FORBIDDEN';end if;
 select * into v_member from public.company_memberships where company_id=p_company_id and user_id=v_user for update;
 if coalesce(v_member.revision,0) is distinct from (p_data->>'expected_revision')::integer then raise exception 'REVISION_CONFLICT';end if;
 if not (v_active and 'admin'::public.app_role=any(v_roles)) and not exists(select 1 from public.company_memberships m join public.user_company_roles r on r.company_id=m.company_id and r.user_id=m.user_id where m.company_id=p_company_id and m.active and m.user_id<>v_user and r.role='admin') then raise exception 'LAST_ADMIN_REQUIRED';end if;
 select jsonb_build_object('active',v_member.active,'roles',coalesce((select jsonb_agg(role) from public.user_company_roles where company_id=p_company_id and user_id=v_user),'[]'::jsonb)) into v_before;
 insert into public.company_memberships(company_id,user_id,active) values(p_company_id,v_user,v_active)
  on conflict(company_id,user_id) do update set active=excluded.active,revision=public.company_memberships.revision+1;
 delete from public.user_company_roles where company_id=p_company_id and user_id=v_user;
 insert into public.user_company_roles(company_id,user_id,role) select p_company_id,v_user,unnest(v_roles);
 v_id:=private.finish_material_command(p_company_id,'member.access',p_idempotency_key,p_data,v_user,'company_member',trim(p_data->>'reason'));
 -- Keep permission changes reviewable without exposing Auth emails or secrets.
 insert into public.audit_log(company_id,actor_id,entity_type,entity_id,action,reason,metadata) values(p_company_id,(select auth.uid()),'company_member',v_user,'member.access.details',trim(p_data->>'reason'),jsonb_build_object('before',v_before,'after',jsonb_build_object('active',v_active,'roles',v_roles)));
 return v_id;
end $$;
