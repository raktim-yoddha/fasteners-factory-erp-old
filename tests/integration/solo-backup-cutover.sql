begin;
select set_config('app.sample_owner',gen_random_uuid()::text,true);
select set_config('app.sample_outsider',gen_random_uuid()::text,true);
select set_config('app.sample_company',gen_random_uuid()::text,true);
select set_config('app.sample_backup',gen_random_uuid()::text,true);
select set_config('app.sample_workspace',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select current_setting(setting)::uuid,'authenticated','authenticated','sample+'||current_setting(setting)||'@invalid.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"display_name":"SAMPLE Owner"}'::jsonb,now(),now() from unnest(array['app.sample_owner','app.sample_outsider']) setting;
insert into public.companies(id,name,created_by) values(current_setting('app.sample_company')::uuid,'SAMPLE Solo Cutover',current_setting('app.sample_owner')::uuid);
insert into public.plants(company_id,name) values(current_setting('app.sample_company')::uuid,'SAMPLE Plant');
insert into public.company_memberships(company_id,user_id) values(current_setting('app.sample_company')::uuid,current_setting('app.sample_owner')::uuid);
insert into public.user_company_roles(company_id,user_id,role) values(current_setting('app.sample_company')::uuid,current_setting('app.sample_owner')::uuid,'admin');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.sample_owner'),true);
select public.begin_solo_backup(current_setting('app.sample_backup')::uuid,current_setting('app.sample_workspace')::uuid,repeat('a',64),repeat('b',64),100);
do $$ begin
 begin perform public.confirm_solo_backup(current_setting('app.sample_backup')::uuid);raise exception 'SAMPLE_MISSING_BACKUP_CONFIRMED';exception when others then if sqlerrm<>'BACKUP_FILE_MISMATCH' then raise;end if;end;
 begin perform public.begin_solo_backup(current_setting('app.sample_backup')::uuid,current_setting('app.sample_workspace')::uuid,repeat('c',64),repeat('b',64),100);raise exception 'SAMPLE_CHANGED_BACKUP_ACCEPTED';exception when others then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_outsider'),true);
 if exists(select 1 from public.solo_backups) then raise exception 'SAMPLE_ACCOUNT_BACKUP_LEAK';end if;
 begin perform public.confirm_solo_backup(current_setting('app.sample_backup')::uuid);raise exception 'SAMPLE_OUTSIDER_CONFIRMED';exception when others then if sqlerrm<>'BACKUP_NOT_FOUND' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_owner'),true);
end $$;
reset role;
insert into storage.objects(bucket_id,name,owner_id,metadata,user_metadata)
select 'solo-backups',object_path,owner_id::text,'{"size":100,"mimetype":"application/octet-stream"}'::jsonb,jsonb_build_object('sha256',repeat('a',64)) from public.solo_backups where id=current_setting('app.sample_backup')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.sample_owner'),true);
select public.confirm_solo_backup(current_setting('app.sample_backup')::uuid);
do $$
declare c uuid:=current_setting('app.sample_company')::uuid;w uuid:=current_setting('app.sample_workspace')::uuid;b uuid:=current_setting('app.sample_backup')::uuid;move uuid:=gen_random_uuid();aborted uuid:=gen_random_uuid();manifest jsonb;masters jsonb:='{}'; t text;plant uuid:=gen_random_uuid();item uuid:=gen_random_uuid();warehouse uuid:=gen_random_uuid();location uuid:=gen_random_uuid();receipt jsonb;
begin
 foreach t in array array['plants','customers','suppliers','items','warehouses','stock_locations','work_centres','drawings','drawing_revisions','boms','bom_revisions','bom_lines','routings','routing_revisions','routing_operations','engineering_packages','inspection_plans','item_specification_versions','item_unit_conversions','customer_item_references','equipment_assets','inspection_plan_gauges'] loop masters:=masters||jsonb_build_object(t,'[]'::jsonb);end loop;
 masters:=masters||jsonb_build_object('plants',jsonb_build_array(jsonb_build_object('id',plant,'name','SAMPLE Plant','timezone','Asia/Kolkata')),
 'items',jsonb_build_array(jsonb_build_object('id',item,'sku','SAMPLE-SOLO','description','SAMPLE Solo Wire','base_uom','kg','active',true)),
 'warehouses',jsonb_build_array(jsonb_build_object('id',warehouse,'plant_id',plant,'code','SAMPLE-W','name','SAMPLE Warehouse','active',true)),
 'stock_locations',jsonb_build_array(jsonb_build_object('id',location,'warehouse_id',warehouse,'code','SAMPLE-L','name','SAMPLE Bin','active',true)));
 manifest:=jsonb_build_object('masters',masters,'openings',jsonb_build_array(jsonb_build_object('item_id',item,'location_id',location,'lot_code','SAMPLE-OPENING','quantity','0.000001','uom','kg')));
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_outsider'),true);
 begin perform public.commit_solo_cutover(move,c,w,b,repeat('b',64),manifest,'SAMPLE denied outsider');raise exception 'SAMPLE_OUTSIDER_MOVED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_owner'),true);
 begin perform public.commit_solo_cutover(move,c,w,b,repeat('c',64),manifest,'SAMPLE wrong snapshot');raise exception 'SAMPLE_WRONG_ARCHIVE_MOVED';exception when others then if sqlerrm<>'VERIFIED_SOLO_ARCHIVE_REQUIRED' then raise;end if;end;
 begin perform public.commit_solo_cutover(move,c,w,b,repeat('b',64),jsonb_set(manifest,'{openings,0,quantity}','"-1"'),'SAMPLE invalid opening');raise exception 'SAMPLE_NEGATIVE_OPENING_MOVED';exception when others then if sqlerrm<>'INVALID_QUANTITY' then raise;end if;end;
 if exists(select 1 from public.items where company_id=c) then raise exception 'SAMPLE_FAILED_MOVE_LEFT_MASTERS';end if;
 receipt:=public.commit_solo_cutover(move,c,w,b,repeat('b',64),manifest,'SAMPLE reviewed opening balances');
 if receipt->>'status'<>'committed' or (receipt->>'opening_count')::integer<>1 then raise exception 'SAMPLE_RECEIPT_MISSING';end if;
 if not exists(select 1 from public.stock_lots l join public.stock_positions p on p.lot_id=l.id where l.company_id=c and l.qc_status='hold' and p.on_hand=0.000001 and p.available_to_promise=0) then raise exception 'SAMPLE_OPENING_NOT_HELD_EXACT';end if;
 if exists(select 1 from public.items where id=item) or exists(select 1 from public.stock_locations where id=location) then raise exception 'SAMPLE_SOURCE_IDS_REUSED';end if;
 if public.commit_solo_cutover(move,c,w,b,repeat('b',64),manifest,'SAMPLE reviewed opening balances')->>'id'<>move::text then raise exception 'SAMPLE_MOVE_RETRY_DUPLICATED';end if;
 begin perform public.commit_solo_cutover(move,c,w,b,repeat('b',64),manifest,'SAMPLE changed request');raise exception 'SAMPLE_CHANGED_MOVE_ACCEPTED';exception when others then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise;end if;end;
 if public.abort_solo_cutover(move,c,w,repeat('b',64),'SAMPLE late cancellation')->>'status'<>'committed' then raise exception 'SAMPLE_COMMITTED_MOVE_ABORTED';end if;
 perform public.abort_solo_cutover(aborted,c,gen_random_uuid(),repeat('b',64),'SAMPLE cancel before commit');
 if not exists(select 1 from public.solo_cutovers where id=aborted and status='aborted') then raise exception 'SAMPLE_ABORT_RECEIPT_MISSING';end if;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_outsider'),true);
 if exists(select 1 from public.solo_cutovers) or exists(select 1 from storage.objects where bucket_id='solo-backups') then raise exception 'SAMPLE_ARCHIVE_RECEIPT_LEAK';end if;
end $$;
rollback;
