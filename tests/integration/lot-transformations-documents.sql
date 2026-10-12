-- Executable regression assertions. Isolated SAMPLE tenants and identities always roll back.
begin;
select set_config('app.sample_operator_id',gen_random_uuid()::text,true);
select set_config('app.sample_reviewer_id',gen_random_uuid()::text,true);
select set_config('app.sample_outsider_id',gen_random_uuid()::text,true);
select set_config('app.sample_company_id',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select current_setting(setting)::uuid,'authenticated','authenticated','sample+'||current_setting(setting)||'@invalid.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"display_name":"SAMPLE Operator"}'::jsonb,now(),now()
from unnest(array['app.sample_operator_id','app.sample_reviewer_id','app.sample_outsider_id']) setting;
insert into public.companies(id,name,created_by) values(current_setting('app.sample_company_id')::uuid,'SAMPLE Procurement Test',current_setting('app.sample_operator_id')::uuid);
insert into public.plants(company_id,name) values(current_setting('app.sample_company_id')::uuid,'SAMPLE Plant');
insert into public.company_memberships(company_id,user_id)
select current_setting('app.sample_company_id')::uuid,current_setting(setting)::uuid from unnest(array['app.sample_operator_id','app.sample_reviewer_id']) setting;
insert into public.user_company_roles(company_id,user_id,role)
select current_setting('app.sample_company_id')::uuid,current_setting(setting)::uuid,'admin' from unnest(array['app.sample_operator_id','app.sample_reviewer_id']) setting;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.sample_operator_id'),true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare c uuid:=current_setting('app.sample_company_id')::uuid;
 item uuid; loc uuid; wh uuid; plan uuid; lot uuid; child uuid; other uuid; merged uuid; doc uuid; payload jsonb; balance numeric;
begin
 insert into public.items(company_id,sku,description,base_uom) values(c,'SAMPLE-WIRE','SAMPLE wire','kg') returning id into item;
 insert into public.warehouses(company_id,plant_id,code,name) select c,id,'SAMPLE-W','SAMPLE Warehouse' from public.plants where company_id=c returning id into wh;
 insert into public.stock_locations(company_id,warehouse_id,code,name) values(c,wh,'SAMPLE-L','SAMPLE location') returning id into loc;
 plan:=public.quality_command(c,'create_plan',jsonb_build_object('item_id',item,'label','SAMPLE incoming','version','A','sample_size',1,'characteristics','[{"key":"condition","label":"SAMPLE condition","type":"attribute","expected":"PASS"}]'::jsonb),'plan');
 perform public.quality_command(c,'approve_plan',jsonb_build_object('plan_id',plan),'approve-plan');
 lot:=public.receive_finished_goods(c,item,loc,'SAMPLE-PARENT',10,'kg','receipt');
 payload:=jsonb_build_object('sources',jsonb_build_array(jsonb_build_object('lot_id',lot,'revision',1,'quantity','3.125001')),'uom','kg','location_id',loc,'lot_code','SAMPLE-SPLIT','reason','SAMPLE separation');
 begin perform public.transform_stock_lot(c,'split',payload,'held');raise exception 'SAMPLE_HELD_SPLIT_ALLOWED';exception when others then if sqlerrm<>'LOT_QC_HOLD' then raise;end if;end;
 perform public.quality_command(c,'inspect',jsonb_build_object('lot_id',lot,'plan_id',plan,'kind','incoming','revision',1,'readings','[{"key":"condition","values":["PASS"]}]'::jsonb,'reason','SAMPLE inspected'),'inspect');
 perform public.release_stock_lot(c,lot,1,'release');
 begin perform public.transform_stock_lot(c,'split',payload,'stale');raise exception 'SAMPLE_STALE_SPLIT_ALLOWED';exception when others then if sqlerrm<>'REVISION_CONFLICT' then raise;end if;end;
 payload:=jsonb_set(payload,'{sources,0,revision}','2');
 begin perform public.transform_stock_lot(c,'split',jsonb_set(payload,'{sources,0,quantity}','"11"'),'overdraw');raise exception 'SAMPLE_OVERDRAW_ALLOWED';exception when others then if sqlerrm<>'INSUFFICIENT_AVAILABLE_STOCK' then raise;end if;end;
 begin perform public.transform_stock_lot(c,'split',jsonb_set(payload,'{uom}','"pcs"'),'wrong-unit');raise exception 'SAMPLE_UNIT_CONVERSION_ALLOWED';exception when others then if sqlerrm<>'UOM_MISMATCH' then raise;end if;end;
 begin perform public.transform_stock_lot(c,'split',jsonb_set(payload,'{sources,0,revision}','null'),'null-revision');raise exception 'SAMPLE_NULL_REVISION_ALLOWED';exception when others then if sqlerrm<>'REVISION_CONFLICT' then raise;end if;end;
 child:=public.transform_stock_lot(c,'split',payload,'split');
 if public.transform_stock_lot(c,'split',payload,'split')<>child then raise exception 'SAMPLE_SPLIT_RETRY_CHANGED';end if;
 begin perform public.transform_stock_lot(c,'split',payload||'{"reason":"SAMPLE changed"}','split');raise exception 'SAMPLE_CHANGED_RETRY_ALLOWED';exception when others then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise;end if;end;
 if not exists(select 1 from public.stock_positions where lot_id=lot and on_hand=6.874999) or not exists(select 1 from public.stock_positions where lot_id=child and on_hand=3.125001 and qc_status='hold') then raise exception 'SAMPLE_SPLIT_BALANCE_WRONG';end if;
 if not exists(select 1 from public.lot_genealogy where child_lot_id=child and parent_lot_id=lot and quantity=3.125001 and uom='kg') then raise exception 'SAMPLE_SPLIT_PROVENANCE_MISSING';end if;
 if exists(select 1 from public.stock_ledger_entries where source_type='lot_split' group by source_id having sum(quantity_delta)<>0) then raise exception 'SAMPLE_TRANSFORMATION_CREATED_STOCK';end if;
 begin perform public.release_stock_lot(c,child,1,'child-bypass');raise exception 'SAMPLE_PARENT_QC_INHERITED';exception when others then if sqlerrm<>'INSPECTION_REQUIRED' then raise;end if;end;
 begin perform public.receive_finished_goods(c,item,loc,'SAMPLE-SPLIT',1,'kg','child-topup');raise exception 'SAMPLE_DERIVED_TOPUP_ALLOWED';exception when others then if sqlerrm<>'MANAGED_LOT_RECEIPT' then raise;end if;end;
 perform public.quality_command(c,'inspect',jsonb_build_object('lot_id',child,'plan_id',plan,'kind','incoming','revision',1,'readings','[{"key":"condition","values":["PASS"]}]'::jsonb,'reason','SAMPLE child inspected'),'inspect-child');
 perform public.release_stock_lot(c,child,1,'release-child');
 payload:=jsonb_set(payload,'{sources,0,revision}','3');payload:=jsonb_set(payload,'{sources,0,quantity}','"2"');payload:=jsonb_set(payload,'{lot_code}','"SAMPLE-SPLIT-2"');
 other:=public.transform_stock_lot(c,'split',payload,'split-2');
 perform public.quality_command(c,'inspect',jsonb_build_object('lot_id',other,'plan_id',plan,'kind','incoming','revision',1,'readings','[{"key":"condition","values":["PASS"]}]'::jsonb,'reason','SAMPLE child inspected'),'inspect-other');
 perform public.release_stock_lot(c,other,1,'release-other');
 payload:=jsonb_build_object('sources',jsonb_build_array(jsonb_build_object('lot_id',child,'revision',2,'quantity','1.000001'),jsonb_build_object('lot_id',other,'revision',2,'quantity','2')),'uom','kg','location_id',loc,'lot_code','SAMPLE-MERGED','reason','SAMPLE consolidation');
 begin perform public.transform_stock_lot(c,'merge',jsonb_set(payload,'{sources,1,lot_id}',to_jsonb(child)),'duplicate');raise exception 'SAMPLE_DUPLICATE_SOURCE_ALLOWED';exception when others then if sqlerrm<>'DUPLICATE_LOT_SOURCE' then raise;end if;end;
 merged:=public.transform_stock_lot(c,'merge',payload,'merge');
 if (select count(*) from public.lot_genealogy where child_lot_id=merged)<>2 then raise exception 'SAMPLE_MERGE_BRANCH_LOST';end if;
 if not exists(select 1 from public.stock_positions where lot_id=merged and on_hand=3.000001 and qc_status='hold') then raise exception 'SAMPLE_MERGE_BALANCE_WRONG';end if;
 select sum(on_hand) into balance from public.stock_positions where item_id=item;
 if balance<>10 then raise exception 'SAMPLE_CHAIN_STOCK_NOT_CONSERVED';end if;
 if exists(select 1 from public.lot_trace_context where lot_id=merged and (requires_final or jsonb_array_length(signatures)<>1)) then raise exception 'SAMPLE_RAW_CONTEXT_CHANGED';end if;
 perform public.quality_command(c,'create_ncr',jsonb_build_object('lot_id',merged,'revision',1,'quantity','1','reason','SAMPLE contained'),'ncr');
 perform public.quality_command(c,'resolve_ncr',jsonb_build_object('ncr_id',(select id from public.ncrs where lot_id=merged),'revision',1,'disposition','scrap','reason','SAMPLE rejected quantity'),'scrap');
 if (select on_hand from public.stock_positions where lot_id=merged)<>2.000001 then raise exception 'SAMPLE_DERIVED_NCR_SCRAP_WRONG';end if;
 payload:=jsonb_build_object('lot_id',lot,'label','SAMPLE certificate','kind','certificate','original_name','sample.pdf','mime_type','application/pdf','byte_size',32,'sha256',repeat('a',64));
 doc:=public.begin_lot_document(c,payload,'document');
 if public.begin_lot_document(c,payload,'document')<>doc then raise exception 'SAMPLE_DOCUMENT_RETRY_CHANGED';end if;
 begin perform public.confirm_lot_document(c,doc,'confirm');raise exception 'SAMPLE_ABSENT_FILE_CONFIRMED';exception when others then if sqlerrm<>'DOCUMENT_UPLOAD_INCOMPLETE' then raise;end if;end;
 if (select status from public.lot_documents where id=doc)<>'pending' then raise exception 'SAMPLE_UPLOAD_SUCCESS_PREMATURE';end if;
 perform set_config('app.sample_document_id',doc::text,true);
 perform set_config('app.sample_lot_id',lot::text,true);
 perform set_config('app.sample_other_lot_id',other::text,true);
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_outsider_id'),true);
 if exists(select 1 from public.lot_documents where company_id=c) or exists(select 1 from public.lot_transformations where company_id=c) or exists(select 1 from public.lot_trace_context where company_id=c) then raise exception 'SAMPLE_TENANT_LEAK';end if;
 begin perform public.begin_lot_document(c,payload,'outsider');raise exception 'SAMPLE_OUTSIDER_DOCUMENT_ALLOWED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
end $$;
-- Only metadata is simulated here; real bytes and Storage API policies are covered by browser E2E.
reset role;
insert into storage.objects(bucket_id,name,owner_id,metadata,user_metadata)
 select 'factory-evidence',object_path,created_by::text,'{"size":31,"mimetype":"application/pdf"}'::jsonb,jsonb_build_object('sha256',sha256) from public.lot_documents where id=current_setting('app.sample_document_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.sample_operator_id'),true);
do $$ begin
 begin perform public.confirm_lot_document(current_setting('app.sample_company_id')::uuid,current_setting('app.sample_document_id')::uuid,'confirm');raise exception 'SAMPLE_WRONG_FILE_SIZE_CONFIRMED';exception when others then if sqlerrm<>'DOCUMENT_FILE_MISMATCH' then raise;end if;end;
end $$;
reset role;
update storage.objects set metadata='{"size":32,"mimetype":"application/pdf"}' where name=(select object_path from public.lot_documents where id=current_setting('app.sample_document_id')::uuid) and bucket_id='factory-evidence';
set local role authenticated;
do $$
declare c uuid:=current_setting('app.sample_company_id')::uuid;doc uuid:=current_setting('app.sample_document_id')::uuid;new_doc uuid;payload jsonb;rows_changed integer;
begin
 if public.confirm_lot_document(c,doc,'confirm')<>doc or public.confirm_lot_document(c,doc,'confirm')<>doc then raise exception 'SAMPLE_DOCUMENT_CONFIRM_RETRY_CHANGED';end if;
 if (select status from public.lot_documents where id=doc)<>'ready' then raise exception 'SAMPLE_DOCUMENT_NOT_READY';end if;
 perform set_config('storage.allow_delete_query','true',true);
 delete from storage.objects where name=(select object_path from public.lot_documents where id=doc) and bucket_id='factory-evidence';get diagnostics rows_changed=row_count;
 if rows_changed<>0 then raise exception 'SAMPLE_READY_OBJECT_DELETED';end if;
 begin update public.lot_documents set label='SAMPLE forged' where id=doc;raise exception 'SAMPLE_DOCUMENT_EDIT_ALLOWED';exception when insufficient_privilege then null;end;
 payload:=jsonb_build_object('lot_id',current_setting('app.sample_lot_id')::uuid,'label','SAMPLE correction','kind','certificate','original_name','correction.pdf','mime_type','application/pdf','byte_size',32,'sha256',repeat('b',64),'supersedes_id',doc);
 new_doc:=public.begin_lot_document(c,payload,'correction');
 if (select supersedes_id from public.lot_documents where id=new_doc)<>doc or (select status from public.lot_documents where id=doc)<>'ready' then raise exception 'SAMPLE_CORRECTION_LOST_HISTORY';end if;
 begin perform public.begin_lot_document(c,jsonb_set(payload,'{lot_id}',to_jsonb(current_setting('app.sample_other_lot_id'))),'cross-lot');raise exception 'SAMPLE_CROSS_LOT_CORRECTION_ALLOWED';exception when others then if sqlerrm<>'DOCUMENT_CONTEXT_MISMATCH' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_outsider_id'),true);
 if exists(select 1 from storage.objects where name=(c::text||'/'||doc::text)) then raise exception 'SAMPLE_STORAGE_TENANT_LEAK';end if;
end $$;
reset role;
do $$ begin
 begin update public.lot_documents set label='SAMPLE changed' where id=current_setting('app.sample_document_id')::uuid;raise exception 'SAMPLE_READY_DOCUMENT_MUTABLE';exception when others then if sqlerrm<>'CONFIRMED_DOCUMENT_IMMUTABLE' then raise;end if;end;
 begin update public.lot_genealogy set quantity=quantity+1 where company_id=current_setting('app.sample_company_id')::uuid;raise exception 'SAMPLE_GENEALOGY_MUTABLE';exception when others then if sqlerrm<>'APPEND_ONLY_HISTORY' then raise;end if;end;
 begin update public.lot_transformations set reason='SAMPLE changed' where company_id=current_setting('app.sample_company_id')::uuid;raise exception 'SAMPLE_TRANSFORMATION_MUTABLE';exception when others then if sqlerrm<>'APPEND_ONLY_HISTORY' then raise;end if;end;
end $$;
rollback;
