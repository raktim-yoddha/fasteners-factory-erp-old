-- ADR 0017: private drawing files, immutable approval pins and explicit engineering change reasons.
insert into public.permission_definitions(code,description) values
 ('drawings.read','Read private company drawing revisions and their files.'),
 ('drawings.manage','Create drawing revisions, store files and approve engineering changes.') on conflict do nothing;
insert into public.role_permissions(role,permission_code)
 select role,'drawings.read' from public.role_permissions where permission_code='master_data.read' on conflict do nothing;
insert into public.role_permissions(role,permission_code) values
 ('admin','drawings.manage'),('engineering','drawings.manage'),('auditor','drawings.read') on conflict do nothing;

create table public.drawing_documents (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,drawing_revision_id uuid not null unique,
 original_name text not null check(char_length(original_name) between 1 and 255),
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 byte_size integer not null check(byte_size between 1 and 5242880),sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 object_path text not null unique,status text not null default 'pending' check(status in ('pending','ready')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),confirmed_at timestamptz,
 unique(id,company_id),foreign key(drawing_revision_id,company_id) references public.drawing_revisions(id,company_id),
 check((status='ready')=(confirmed_at is not null))
);
alter table public.drawing_documents enable row level security;
revoke all on public.drawing_documents from public,anon,authenticated;
grant select on public.drawing_documents to authenticated;
create policy permitted_drawing_documents on public.drawing_documents for select to authenticated using (
 (select private.has_company_permission(company_id,'drawings.read')) and (status='ready' or created_by=(select auth.uid()))
);
create index on public.drawing_documents(company_id);
create trigger confirmed_drawing_document_guard before update or delete on public.drawing_documents
 for each row execute function private.guard_confirmed_document();
-- Revision state and file pins change only through audited commands.
revoke insert,update,delete on public.drawing_revisions from authenticated;

create policy factory_drawing_insert on storage.objects for insert to authenticated with check (
 bucket_id='factory-evidence' and exists(select 1 from public.drawing_documents d join public.drawing_revisions r on r.id=d.drawing_revision_id
 where d.object_path=name and d.status='pending' and r.status='draft' and d.created_by=(select auth.uid())
 and (select private.has_company_permission(d.company_id,'drawings.manage')))
);
create policy factory_drawing_read on storage.objects for select to authenticated using (
 bucket_id='factory-evidence' and exists(select 1 from public.drawing_documents d where d.object_path=name
 and (d.status='ready' or d.created_by=(select auth.uid())) and (select private.has_company_permission(d.company_id,'drawings.read')))
);

create function private.guard_drawing_approval_file() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.status='approved' then raise exception 'APPROVED_REVISION_IMMUTABLE';end if;return old;
 end if;
 if new.status='approved' and (tg_op='INSERT' or old.status<>'approved') and not exists(
  select 1 from public.drawing_documents d where d.drawing_revision_id=new.id and d.company_id=new.company_id
  and d.status='ready' and d.object_path=new.file_path and d.sha256=new.checksum
 ) then raise exception 'DRAWING_FILE_REQUIRED';end if;
 return new;
end $$;
revoke all on function private.guard_drawing_approval_file() from public,anon,authenticated;
create trigger drawing_approval_file_guard before insert or update or delete on public.drawing_revisions
 for each row execute function private.guard_drawing_approval_file();
create function private.guard_drawing_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.id,new.company_id,new.item_id,new.drawing_number) is distinct from (old.id,old.company_id,old.item_id,old.drawing_number)
 and exists(select 1 from public.drawing_revisions where drawing_id=old.id) then raise exception 'DRAWING_IDENTITY_IMMUTABLE';end if;
 return new;
end $$;
revoke all on function private.guard_drawing_identity() from public,anon,authenticated;
create trigger drawing_identity_guard before update on public.drawings for each row execute function private.guard_drawing_identity();

create function public.create_drawing_revision(p_company_id uuid,p_drawing_id uuid,p_revision text,p_reason text,p_idempotency_key text)
 returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_request jsonb:=jsonb_build_array(p_drawing_id,p_revision,p_reason);
begin
 v_id:=private.begin_material_command(p_company_id,'drawings.manage','create_drawing_revision',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 perform 1 from public.drawings where id=p_drawing_id and company_id=p_company_id for update;
 if not found then raise exception 'DRAWING_NOT_FOUND';end if;
 if p_revision is null or char_length(trim(p_revision)) not between 1 and 24 then raise exception 'INVALID_REQUEST';end if;
 if p_reason is null or char_length(trim(p_reason)) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 insert into public.drawing_revisions(company_id,drawing_id,revision) values(p_company_id,p_drawing_id,trim(p_revision)) returning id into v_id;
 return private.finish_material_command(p_company_id,'create_drawing_revision',p_idempotency_key,v_request,v_id,'drawing_revision',trim(p_reason));
end $$;
create function public.begin_drawing_document(p_company_id uuid,p_data jsonb,p_idempotency_key text)
 returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_revision public.drawing_revisions%rowtype;v_size numeric;v_mime text;
begin
 v_id:=private.begin_material_command(p_company_id,'drawings.manage','begin_drawing_document',p_idempotency_key,p_data);if v_id is not null then return v_id;end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 select * into v_revision from public.drawing_revisions where id=(p_data->>'drawing_revision_id')::uuid and company_id=p_company_id for update;
 if not found then raise exception 'DRAWING_NOT_FOUND';end if;
 if v_revision.status<>'draft' then raise exception 'APPROVED_REVISION_IMMUTABLE';end if;
 if exists(select 1 from public.drawing_documents where drawing_revision_id=v_revision.id) then raise exception 'DRAWING_FILE_EXISTS';end if;
 v_size:=private.factory_quantity(p_data,'byte_size');v_mime:=p_data->>'mime_type';
 if v_size<>trunc(v_size) or v_size>5242880 or v_mime not in ('application/pdf','image/png','image/jpeg') then raise exception 'INVALID_DOCUMENT_FILE';end if;
 v_id:=gen_random_uuid();
 insert into public.drawing_documents(id,company_id,drawing_revision_id,original_name,mime_type,byte_size,sha256,object_path,created_by)
 values(v_id,p_company_id,v_revision.id,p_data->>'original_name',v_mime,v_size::integer,p_data->>'sha256',p_company_id::text||'/'||v_id::text,(select auth.uid()));
 return private.finish_material_command(p_company_id,'begin_drawing_document',p_idempotency_key,p_data,v_id,'drawing_document');
end $$;
create function public.confirm_drawing_document(p_company_id uuid,p_document_id uuid,p_idempotency_key text)
 returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_doc public.drawing_documents%rowtype;v_object storage.objects%rowtype;v_request jsonb:=jsonb_build_array(p_document_id);
begin
 v_id:=private.begin_material_command(p_company_id,'drawings.manage','confirm_drawing_document',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 -- Same lock order as begin/approve: revision, then document, then object.
 perform 1 from public.drawing_revisions r join public.drawing_documents d on d.drawing_revision_id=r.id
 where d.id=p_document_id and d.company_id=p_company_id for update of r;
 if not found then raise exception 'DOCUMENT_NOT_FOUND';end if;
 select * into v_doc from public.drawing_documents where id=p_document_id and company_id=p_company_id for update;
 if v_doc.status<>'ready' then
  if not exists(select 1 from public.drawing_revisions where id=v_doc.drawing_revision_id and status='draft') then raise exception 'INVALID_TRANSITION';end if;
  if v_doc.created_by is distinct from (select auth.uid()) then raise exception 'FORBIDDEN';end if;
  select * into v_object from storage.objects where bucket_id='factory-evidence' and name=v_doc.object_path for update;
  if not found then raise exception 'DOCUMENT_UPLOAD_INCOMPLETE';end if;
  if coalesce(v_object.metadata->>'size','')!~'^\d+$' or (v_object.metadata->>'size')::numeric<>v_doc.byte_size
  or v_object.metadata->>'mimetype' is distinct from v_doc.mime_type or v_object.owner_id is distinct from v_doc.created_by::text
  or v_object.user_metadata->>'sha256' is distinct from v_doc.sha256 then raise exception 'DOCUMENT_FILE_MISMATCH';end if;
  update public.drawing_documents set status='ready',confirmed_at=now() where id=v_doc.id;
 end if;
 return private.finish_material_command(p_company_id,'confirm_drawing_document',p_idempotency_key,v_request,v_doc.id,'drawing_document');
end $$;
create function public.approve_drawing_revision(p_company_id uuid,p_revision_id uuid,p_reason text,p_idempotency_key text)
 returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_revision public.drawing_revisions%rowtype;v_doc public.drawing_documents%rowtype;v_request jsonb:=jsonb_build_array(p_revision_id,p_reason);
begin
 v_id:=private.begin_material_command(p_company_id,'drawings.manage','approve_drawing_revision',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 select * into v_revision from public.drawing_revisions where id=p_revision_id and company_id=p_company_id for update;
 if not found then raise exception 'DRAWING_NOT_FOUND';end if;
 if v_revision.status<>'draft' then raise exception 'INVALID_TRANSITION';end if;
 if p_reason is null or char_length(trim(p_reason)) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 select * into v_doc from public.drawing_documents where drawing_revision_id=v_revision.id and status='ready';
 if not found then raise exception 'DRAWING_FILE_REQUIRED';end if;
 update public.drawing_revisions set status='approved',approved_at=now(),approved_by=(select auth.uid()),file_path=v_doc.object_path,checksum=v_doc.sha256 where id=v_revision.id;
 return private.finish_material_command(p_company_id,'approve_drawing_revision',p_idempotency_key,v_request,v_revision.id,'drawing_revision',trim(p_reason));
end $$;
create function public.get_drawing_workspace(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'drawings.read') then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object(
  'drawings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'item_id',item_id,'drawing_number',drawing_number) order by drawing_number,id) from public.drawings where company_id=p_company_id),'[]'::jsonb),
  'revisions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'drawing_id',drawing_id,'revision',revision,'status',status,'approved_at',approved_at,'approved_by',approved_by) order by created_at desc,id) from public.drawing_revisions where company_id=p_company_id),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc,d.id) from public.drawing_documents d where d.company_id=p_company_id and (d.status='ready' or d.created_by=(select auth.uid()))),'[]'::jsonb)
 );
end $$;
revoke all on function public.create_drawing_revision(uuid,uuid,text,text,text),public.begin_drawing_document(uuid,jsonb,text),
 public.confirm_drawing_document(uuid,uuid,text),public.approve_drawing_revision(uuid,uuid,text,text),public.get_drawing_workspace(uuid) from public,anon;
grant execute on function public.create_drawing_revision(uuid,uuid,text,text,text),public.begin_drawing_document(uuid,jsonb,text),
 public.confirm_drawing_document(uuid,uuid,text),public.approve_drawing_revision(uuid,uuid,text,text),public.get_drawing_workspace(uuid) to authenticated;
