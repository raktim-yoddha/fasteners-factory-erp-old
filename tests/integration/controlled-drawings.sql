-- Disposable SAMPLE tenants. File metadata here; actual bytes and Storage API covered in browser E2E.
begin;
select set_config('app.sample_company_id',gen_random_uuid()::text,true);
select set_config('app.sample_operator_id',gen_random_uuid()::text,true);
select set_config('app.sample_reader_id',gen_random_uuid()::text,true);
select set_config('app.sample_outsider_id',gen_random_uuid()::text,true);
select set_config('app.sample_drawing_id',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 select current_setting(setting)::uuid,'authenticated','authenticated','sample+'||current_setting(setting)||'@invalid.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"display_name":"SAMPLE Operator"}'::jsonb,now(),now()
 from unnest(array['app.sample_operator_id','app.sample_reader_id','app.sample_outsider_id']) setting;
insert into public.companies(id,name,created_by) values(current_setting('app.sample_company_id')::uuid,'SAMPLE Drawing Factory',current_setting('app.sample_operator_id')::uuid);
insert into public.company_memberships(company_id,user_id) select current_setting('app.sample_company_id')::uuid,current_setting(setting)::uuid from unnest(array['app.sample_operator_id','app.sample_reader_id']) setting;
insert into public.user_company_roles(company_id,user_id,role) values(current_setting('app.sample_company_id')::uuid,current_setting('app.sample_operator_id')::uuid,'engineering'),(current_setting('app.sample_company_id')::uuid,current_setting('app.sample_reader_id')::uuid,'planning');
insert into public.items(company_id,sku,description,base_uom) values(current_setting('app.sample_company_id')::uuid,'SAMPLE-DRAWN','SAMPLE drawn item','pcs');
insert into public.drawings(id,company_id,item_id,drawing_number) select current_setting('app.sample_drawing_id')::uuid,company_id,id,'SAMPLE-DRAWING' from public.items where company_id=current_setting('app.sample_company_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.sample_operator_id'),true);
do $$
declare c uuid:=current_setting('app.sample_company_id')::uuid;drawing uuid:=current_setting('app.sample_drawing_id')::uuid;r uuid;doc uuid;payload jsonb;
begin
 r:=public.create_drawing_revision(c,drawing,'A','SAMPLE original issue','create-a');
 if public.create_drawing_revision(c,drawing,'A','SAMPLE original issue','create-a')<>r then raise exception 'SAMPLE_DRAWING_RETRY_CHANGED';end if;
 begin perform public.create_drawing_revision(c,drawing,'B','SAMPLE correction','create-a');raise exception 'SAMPLE_DRAWING_KEY_REUSED';exception when others then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise;end if;end;
 begin perform public.create_drawing_revision(c,gen_random_uuid(),'A','SAMPLE wrong tenant','wrong-drawing');raise exception 'SAMPLE_WRONG_DRAWING_ALLOWED';exception when others then if sqlerrm<>'DRAWING_NOT_FOUND' then raise;end if;end;
 begin perform public.approve_drawing_revision(c,r,'SAMPLE approve','approve-a');raise exception 'SAMPLE_FILELESS_APPROVAL';exception when others then if sqlerrm<>'DRAWING_FILE_REQUIRED' then raise;end if;end;
 payload:=jsonb_build_object('drawing_revision_id',r,'original_name','sample.pdf','mime_type','application/pdf','byte_size',32,'sha256',repeat('a',64));
 begin perform public.begin_drawing_document(c,jsonb_set(payload,'{byte_size}','5242881'),'too-large');raise exception 'SAMPLE_LARGE_DRAWING_ALLOWED';exception when others then if sqlerrm<>'INVALID_DOCUMENT_FILE' then raise;end if;end;
 doc:=public.begin_drawing_document(c,payload,'file-a');
 if public.begin_drawing_document(c,payload,'file-a')<>doc then raise exception 'SAMPLE_FILE_DRAFT_RETRY_CHANGED';end if;
 begin perform public.begin_drawing_document(c,payload,'duplicate-file');raise exception 'SAMPLE_DRAWING_REPLACEMENT_ALLOWED';exception when others then if sqlerrm<>'DRAWING_FILE_EXISTS' then raise;end if;end;
 begin perform public.confirm_drawing_document(c,doc,'confirm-a');raise exception 'SAMPLE_MISSING_DRAWING_CONFIRMED';exception when others then if sqlerrm<>'DOCUMENT_UPLOAD_INCOMPLETE' then raise;end if;end;
 begin update public.drawing_revisions set status='approved',approved_at=now(),approved_by=(select auth.uid()) where id=r;raise exception 'SAMPLE_DIRECT_APPROVAL_ALLOWED';exception when insufficient_privilege then null;end;
 begin insert into public.drawing_revisions(company_id,drawing_id,revision) values(c,drawing,'DIRECT');raise exception 'SAMPLE_DIRECT_REVISION_ALLOWED';exception when insufficient_privilege then null;end;
 perform set_config('app.sample_revision_id',r::text,true);perform set_config('app.sample_document_id',doc::text,true);
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_reader_id'),true);
 if jsonb_array_length(public.get_drawing_workspace(c)->'documents')<>0 then raise exception 'SAMPLE_PENDING_DRAWING_LEAK';end if;
 begin perform public.approve_drawing_revision(c,r,'SAMPLE reader','reader');raise exception 'SAMPLE_READER_APPROVAL_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_outsider_id'),true);
 if exists(select 1 from public.drawing_documents where company_id=c) then raise exception 'SAMPLE_DRAWING_TENANT_LEAK';end if;
 begin perform public.get_drawing_workspace(c);raise exception 'SAMPLE_DRAWING_WORKSPACE_LEAK';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
end $$;
reset role;
insert into storage.objects(bucket_id,name,owner_id,metadata,user_metadata)
 select 'factory-evidence',object_path,created_by::text,'{"size":32,"mimetype":"application/pdf"}'::jsonb,jsonb_build_object('sha256',repeat('b',64)) from public.drawing_documents where id=current_setting('app.sample_document_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.sample_operator_id'),true);
do $$ begin
 begin perform public.confirm_drawing_document(current_setting('app.sample_company_id')::uuid,current_setting('app.sample_document_id')::uuid,'confirm-a');raise exception 'SAMPLE_WRONG_HASH_CONFIRMED';exception when others then if sqlerrm<>'DOCUMENT_FILE_MISMATCH' then raise;end if;end;
end $$;
reset role;
update storage.objects set user_metadata=jsonb_build_object('sha256',repeat('a',64)) where bucket_id='factory-evidence' and name=(select object_path from public.drawing_documents where id=current_setting('app.sample_document_id')::uuid);
set local role authenticated;
do $$
declare c uuid:=current_setting('app.sample_company_id')::uuid;r uuid:=current_setting('app.sample_revision_id')::uuid;doc uuid:=current_setting('app.sample_document_id')::uuid;second uuid;changed integer;
begin
 if public.confirm_drawing_document(c,doc,'confirm-a')<>doc or public.confirm_drawing_document(c,doc,'confirm-a')<>doc then raise exception 'SAMPLE_CONFIRM_RETRY_CHANGED';end if;
 if public.approve_drawing_revision(c,r,'SAMPLE verified drawing','approve-a')<>r or public.approve_drawing_revision(c,r,'SAMPLE verified drawing','approve-a')<>r then raise exception 'SAMPLE_APPROVAL_RETRY_CHANGED';end if;
 if not exists(select 1 from public.drawing_revisions dr join public.drawing_documents d on d.drawing_revision_id=dr.id where dr.id=r and dr.status='approved' and dr.file_path=d.object_path and dr.checksum=d.sha256 and dr.approved_by=(select auth.uid())) then raise exception 'SAMPLE_DRAWING_PIN_MISSING';end if;
 begin perform public.begin_drawing_document(c,jsonb_build_object('drawing_revision_id',r),'replace-approved');raise exception 'SAMPLE_APPROVED_UPLOAD_ALLOWED';exception when others then if sqlerrm<>'APPROVED_REVISION_IMMUTABLE' then raise;end if;end;
 second:=public.create_drawing_revision(c,current_setting('app.sample_drawing_id')::uuid,'B','SAMPLE engineering correction','create-b');
 if second=r or (select status from public.drawing_revisions where id=r)<>'approved' then raise exception 'SAMPLE_HISTORY_REBOUND';end if;
 perform set_config('storage.allow_delete_query','true',true);
 delete from storage.objects where bucket_id='factory-evidence' and name=(select object_path from public.drawing_documents where id=doc);get diagnostics changed=row_count;
 if changed<>0 then raise exception 'SAMPLE_DRAWING_OBJECT_DELETED';end if;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_reader_id'),true);
 if jsonb_array_length(public.get_drawing_workspace(c)->'documents')<>1 or not exists(select 1 from storage.objects where bucket_id='factory-evidence' and name=(select object_path from public.drawing_documents where id=doc)) then raise exception 'SAMPLE_DRAWING_READER_DENIED';end if;
end $$;
reset role;
do $$ begin
 begin update public.drawing_revisions set revision='CHANGED' where id=current_setting('app.sample_revision_id')::uuid;raise exception 'SAMPLE_APPROVED_DRAWING_MUTABLE';exception when others then if sqlerrm<>'APPROVED_REVISION_IMMUTABLE' then raise;end if;end;
 begin delete from public.drawing_revisions where id=current_setting('app.sample_revision_id')::uuid;raise exception 'SAMPLE_APPROVED_DRAWING_DELETED';exception when others then if sqlerrm<>'APPROVED_REVISION_IMMUTABLE' then raise;end if;end;
 begin update public.drawings set drawing_number='CHANGED' where id=current_setting('app.sample_drawing_id')::uuid;raise exception 'SAMPLE_DRAWING_IDENTITY_CHANGED';exception when others then if sqlerrm<>'DRAWING_IDENTITY_IMMUTABLE' then raise;end if;end;
 begin update public.drawing_documents set sha256=repeat('b',64) where id=current_setting('app.sample_document_id')::uuid;raise exception 'SAMPLE_CONFIRMED_DRAWING_MUTABLE';exception when others then if sqlerrm<>'CONFIRMED_DOCUMENT_IMMUTABLE' then raise;end if;end;
end $$;
rollback;
