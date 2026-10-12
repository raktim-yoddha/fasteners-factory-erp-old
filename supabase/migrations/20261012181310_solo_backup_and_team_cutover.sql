-- ADR 0019: optional ciphertext backup belongs to an account, never a shared company.
create table public.solo_backups (
 id uuid primary key, owner_id uuid not null references auth.users(id), workspace_id uuid not null,
 ciphertext_sha256 text not null check(ciphertext_sha256 ~ '^[a-f0-9]{64}$'),
 snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 byte_size integer not null check(byte_size between 100 and 134221824),
 object_path text not null unique, status text not null default 'pending' check(status in ('pending','ready')),
 created_at timestamptz not null default now(), confirmed_at timestamptz,
 check((status='ready')=(confirmed_at is not null))
);
alter table public.solo_backups enable row level security;
revoke all on public.solo_backups from public,anon,authenticated;
grant select on public.solo_backups to authenticated;
create policy account_backup_read on public.solo_backups for select to authenticated using(owner_id=(select auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('solo-backups','solo-backups',false,134221824,array['application/octet-stream']) on conflict(id) do nothing;
create policy account_backup_object_read on storage.objects for select to authenticated using(
 bucket_id='solo-backups' and exists(select 1 from public.solo_backups b where b.object_path=name and b.owner_id=(select auth.uid())));
create policy account_backup_object_insert on storage.objects for insert to authenticated with check(
 bucket_id='solo-backups' and exists(select 1 from public.solo_backups b where b.object_path=name and b.owner_id=(select auth.uid()) and b.status='pending'));

create function public.begin_solo_backup(p_id uuid,p_workspace_id uuid,p_ciphertext_sha256 text,p_snapshot_sha256 text,p_byte_size integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.solo_backups%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 perform pg_advisory_xact_lock(hashtextextended('solo-backup:'||p_id::text,0));
 select * into b from public.solo_backups where id=p_id;
 if found then
  if b.owner_id<>(select auth.uid()) or b.workspace_id<>p_workspace_id or b.ciphertext_sha256<>p_ciphertext_sha256 or b.snapshot_sha256<>p_snapshot_sha256 or b.byte_size<>p_byte_size then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return to_jsonb(b);
 end if;
 insert into public.solo_backups(id,owner_id,workspace_id,ciphertext_sha256,snapshot_sha256,byte_size,object_path)
 values(p_id,(select auth.uid()),p_workspace_id,p_ciphertext_sha256,p_snapshot_sha256,p_byte_size,(select auth.uid())::text||'/'||p_id::text||'.bin') returning * into b;
 return to_jsonb(b);
end $$;
create function public.confirm_solo_backup(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.solo_backups%rowtype; size integer;
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 select * into b from public.solo_backups where id=p_id and owner_id=(select auth.uid()) for update;
 if not found then raise exception 'BACKUP_NOT_FOUND';end if;
 select (metadata->>'size')::integer into size from storage.objects where bucket_id='solo-backups' and name=b.object_path;
 if size is distinct from b.byte_size then raise exception 'BACKUP_FILE_MISMATCH';end if;
 if b.status='pending' then update public.solo_backups set status='ready',confirmed_at=now() where id=b.id returning * into b;end if;
 return to_jsonb(b);
end $$;
revoke all on function public.begin_solo_backup(uuid,uuid,text,text,integer),public.confirm_solo_backup(uuid) from public,anon;
grant execute on function public.begin_solo_backup(uuid,uuid,text,text,integer),public.confirm_solo_backup(uuid) to authenticated;

-- A cutover receipt is append-only. Abort and commit take the same lock, preventing a lost-response race.
create table public.solo_cutovers (
 id uuid primary key,owner_id uuid not null references auth.users(id),company_id uuid not null references public.companies(id),
 workspace_id uuid not null,snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 backup_id uuid references public.solo_backups(id),request_hash text not null,
 status text not null check(status in ('committed','aborted')),reason text not null check(char_length(trim(reason)) between 1 and 2000),
 master_mapping jsonb not null default '{}', opening_count integer not null default 0,created_at timestamptz not null default now(),
 check(status<>'committed' or backup_id is not null)
);
create unique index solo_one_committed_cutover on public.solo_cutovers(owner_id,workspace_id) where status='committed';
alter table public.solo_cutovers enable row level security;
revoke all on public.solo_cutovers from public,anon,authenticated;
grant select on public.solo_cutovers to authenticated;
create policy cutover_account_read on public.solo_cutovers for select to authenticated using(owner_id=(select auth.uid()));
create trigger immutable_solo_cutovers before update or delete on public.solo_cutovers for each row execute function private.reject_lot_history_change();
create function public.abort_solo_cutover(p_id uuid,p_company_id uuid,p_workspace_id uuid,p_snapshot_sha256 text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.solo_cutovers%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'imports.approve') then raise exception 'FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('solo-move:'||(select auth.uid())::text||':'||p_id::text,0));
 select * into receipt from public.solo_cutovers where id=p_id;
 if found then
  if receipt.owner_id<>(select auth.uid()) or receipt.company_id<>p_company_id or receipt.workspace_id<>p_workspace_id then raise exception 'CUTOVER_TARGET_MISMATCH';end if;
  return to_jsonb(receipt);
 end if;
 insert into public.solo_cutovers(id,owner_id,company_id,workspace_id,snapshot_sha256,request_hash,status,reason)
 values(p_id,(select auth.uid()),p_company_id,p_workspace_id,p_snapshot_sha256,'aborted','aborted',p_reason) returning * into receipt;
 return to_jsonb(receipt);
end $$;

create function public.commit_solo_cutover(p_id uuid,p_company_id uuid,p_workspace_id uuid,p_backup_id uuid,p_snapshot_sha256 text,p_manifest jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.solo_cutovers%rowtype;backup public.solo_backups%rowtype;
 tables text[]:=array['plants','customers','suppliers','items','warehouses','stock_locations','work_centres','drawings','drawing_revisions','boms','bom_revisions','bom_lines','routings','routing_revisions','routing_operations','engineering_packages','inspection_plans','item_specification_versions','item_unit_conversions','customer_item_references','equipment_assets','inspection_plan_gauges'];
 table_name text;row_data jsonb; mapped jsonb;mapping jsonb:='{}';old_id text;new_id uuid;key text;column_list text; has_rows boolean; row_count integer:=0; opening_count integer:=0; req_hash text;
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 -- This is a broad setup operation, scoped to an active team administrator.
 if not private.has_company_permission(p_company_id,'members.manage') or not private.has_company_permission(p_company_id,'imports.approve') or not private.has_company_permission(p_company_id,'stock.receive') then raise exception 'FORBIDDEN';end if;
 if p_manifest is null or jsonb_typeof(p_manifest->'masters')<>'object' or jsonb_typeof(p_manifest->'openings')<>'array' or jsonb_array_length(p_manifest->'openings')>5000 or p_reason is null or char_length(trim(p_reason)) not between 1 and 2000 then raise exception 'INVALID_CUTOVER_MANIFEST';end if;
 req_hash:=md5(jsonb_build_array(p_company_id,p_workspace_id,p_backup_id,p_snapshot_sha256,p_manifest,p_reason)::text);
 perform pg_advisory_xact_lock(hashtextextended('solo-move:'||(select auth.uid())::text||':'||p_id::text,0));
 select * into receipt from public.solo_cutovers where id=p_id;
 if found then
  if receipt.owner_id<>(select auth.uid()) or receipt.company_id<>p_company_id or receipt.workspace_id<>p_workspace_id then raise exception 'CUTOVER_TARGET_MISMATCH';end if;
  if receipt.status='aborted' then raise exception 'CUTOVER_ABORTED';end if;
  if receipt.request_hash<>req_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return to_jsonb(receipt);
 end if;
 if exists(select 1 from public.solo_cutovers where owner_id=(select auth.uid()) and workspace_id=p_workspace_id and status='committed') then raise exception 'SOLO_ALREADY_MOVED';end if;
 select * into backup from public.solo_backups where id=p_backup_id and owner_id=(select auth.uid()) and workspace_id=p_workspace_id and snapshot_sha256=p_snapshot_sha256 and status='ready' for share;
 if not found then raise exception 'VERIFIED_SOLO_ARCHIVE_REQUIRED';end if;
 perform 1 from public.companies where id=p_company_id for update;
 -- No implicit merge, overwrite or opening balance in a company with operational history.
 foreach table_name in array tables[2:22] loop
  execute format('select exists(select 1 from public.%I where company_id=$1)',table_name) into has_rows using p_company_id;
  if has_rows then raise exception 'CUTOVER_TARGET_NOT_EMPTY';end if;
 end loop;
 foreach table_name in array array['rfqs','quotations','sales_orders','purchase_requisitions','purchase_orders','stock_lots','stock_ledger_entries','work_orders','shipments','vendor_orders'] loop
  execute format('select exists(select 1 from public.%I where company_id=$1)',table_name) into has_rows using p_company_id;
  if has_rows then raise exception 'CUTOVER_TARGET_NOT_EMPTY';end if;
 end loop;
 foreach table_name in array tables loop
  if jsonb_typeof(p_manifest->'masters'->table_name) is distinct from 'array' then raise exception 'INVALID_CUTOVER_MANIFEST';end if;
  for row_data in select value from jsonb_array_elements(p_manifest->'masters'->table_name) loop
   row_count:=row_count+1;if row_count>10000 then raise exception 'CUTOVER_TOO_LARGE';end if;
   old_id:=row_data->>'id';perform old_id::uuid;
   if old_id is null or mapping ? old_id then raise exception 'DUPLICATE_SOURCE_MASTER';end if;
   mapping:=mapping||jsonb_build_object(old_id,gen_random_uuid());
  end loop;
 end loop;
 foreach table_name in array tables loop
  for row_data in select value from jsonb_array_elements(p_manifest->'masters'->table_name) loop
   old_id:=row_data->>'id';new_id:=(mapping->>old_id)::uuid;
   mapped:=row_data-array['id','company_id','created_by','approved_by','approved_at','retired_by','retired_at','retirement_reason','created_at','updated_at','file_path','checksum'];
   for key in select jsonb_object_keys(mapped) loop
    if right(key,3)='_id' and mapped->>key is not null then
     if not mapping ? (mapped->>key) then raise exception 'SOURCE_MASTER_REFERENCE_MISSING';end if;
     mapped:=jsonb_set(mapped,array[key],mapping->(mapped->>key));
    end if;
   end loop;
   mapped:=mapped||jsonb_build_object('id',new_id,'company_id',p_company_id);
   if table_name in ('drawing_revisions','bom_revisions','routing_revisions','engineering_packages','inspection_plans','item_specification_versions','item_unit_conversions') then mapped:=mapped||jsonb_build_object('status','draft');end if;
   -- A local decision never becomes a cloud approval. Drawing bytes stay in the readable archive.
   if table_name='customer_item_references' then mapped:=mapped||jsonb_build_object('drawing_revision_id',null);end if;
   if exists(select 1 from pg_catalog.pg_attribute where attrelid=('public.'||table_name)::regclass and attname='created_by' and not attisdropped) then mapped:=mapped||jsonb_build_object('created_by',(select auth.uid()));end if;
   if table_name='plants' then
    select id into new_id from public.plants where company_id=p_company_id and name=mapped->>'name' limit 1;
    if found then mapping:=jsonb_set(mapping,array[old_id],to_jsonb(new_id));continue;end if;
   end if;
   select string_agg(format('%I',attname),',' order by attnum) into column_list from pg_catalog.pg_attribute
   where attrelid=('public.'||table_name)::regclass and attnum>0 and not attisdropped and mapped ? attname;
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1)',table_name,column_list,column_list,table_name) using mapped;
  end loop;
 end loop;
 for row_data in select value from jsonb_array_elements(p_manifest->'openings') loop
  if not mapping ? (row_data->>'item_id') or not mapping ? (row_data->>'location_id') then raise exception 'SOURCE_MASTER_REFERENCE_MISSING';end if;
  opening_count:=opening_count+1;
  perform public.receive_finished_goods(p_company_id,(mapping->>(row_data->>'item_id'))::uuid,(mapping->>(row_data->>'location_id'))::uuid,row_data->>'lot_code',private.factory_quantity(row_data,'quantity'),row_data->>'uom','solo:'||p_id::text||':'||opening_count::text);
 end loop;
 insert into public.solo_cutovers(id,owner_id,company_id,workspace_id,snapshot_sha256,backup_id,request_hash,status,reason,master_mapping,opening_count)
 values(p_id,(select auth.uid()),p_company_id,p_workspace_id,p_snapshot_sha256,p_backup_id,req_hash,'committed',p_reason,mapping,opening_count) returning * into receipt;
 insert into public.audit_log(company_id,actor_id,entity_type,entity_id,action,reason,metadata)
 values(p_company_id,(select auth.uid()),'solo_cutover',p_id,'solo.moved_to_team',p_reason,jsonb_build_object('workspace_id',p_workspace_id,'snapshot_sha256',p_snapshot_sha256,'master_count',row_count,'opening_count',opening_count,'openings_qc','hold','engineering_status','draft'));
 return to_jsonb(receipt);
end $$;
revoke all on function public.abort_solo_cutover(uuid,uuid,uuid,text,text),public.commit_solo_cutover(uuid,uuid,uuid,uuid,text,jsonb,text) from public,anon;
grant execute on function public.abort_solo_cutover(uuid,uuid,uuid,text,text),public.commit_solo_cutover(uuid,uuid,uuid,uuid,text,jsonb,text) to authenticated;
