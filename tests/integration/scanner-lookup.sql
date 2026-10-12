begin;
select set_config('app.sample_actor',gen_random_uuid()::text,true);
select set_config('app.sample_outsider',gen_random_uuid()::text,true);
select set_config('app.sample_company',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select current_setting(setting)::uuid,'authenticated','authenticated','sample+'||current_setting(setting)||'@invalid.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"display_name":"SAMPLE Operator"}'::jsonb,now(),now()
from unnest(array['app.sample_actor','app.sample_outsider']) setting;
insert into public.companies(id,name,created_by) values(current_setting('app.sample_company')::uuid,'SAMPLE Scanner Factory',current_setting('app.sample_actor')::uuid);
insert into public.plants(company_id,name) values(current_setting('app.sample_company')::uuid,'SAMPLE Plant');
insert into public.company_memberships(company_id,user_id) values(current_setting('app.sample_company')::uuid,current_setting('app.sample_actor')::uuid);
insert into public.user_company_roles(company_id,user_id,role) values(current_setting('app.sample_company')::uuid,current_setting('app.sample_actor')::uuid,'admin');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.sample_actor'),true);
do $$
declare c uuid:=current_setting('app.sample_company')::uuid;item uuid;wh uuid;loc uuid;lot uuid;
begin
 insert into public.items(company_id,sku,description,base_uom) values(c,'SAMPLE-EXACT','SAMPLE scanner item','pcs') returning id into item;
 insert into public.warehouses(company_id,plant_id,code,name) select c,id,'SAMPLE-WH','SAMPLE warehouse' from public.plants where company_id=c returning id into wh;
 insert into public.stock_locations(company_id,warehouse_id,code,name) values(c,wh,'SAMPLE-LOC','SAMPLE location') returning id into loc;
 lot:=public.receive_finished_goods(c,item,loc,'SAMPLE-EXACT',1,'pcs','receipt');
 if (select count(*) from public.lookup_scanned_record(c,'sample-exact'))<>2 then raise exception 'SAMPLE_AMBIGUITY_HIDDEN';end if;
 if exists(select 1 from public.lookup_scanned_record(c,'SAMPLE-EX')) then raise exception 'SAMPLE_PARTIAL_SCAN_MATCH';end if;
 if not exists(select 1 from public.lookup_scanned_record(c,lot::text) where record_type='Lot' and record_id=lot and label like '%hold') then raise exception 'SAMPLE_LOT_UUID_SCAN_FAILED';end if;
 if exists(select 1 from public.lookup_scanned_record(gen_random_uuid(),'SAMPLE-EXACT')) then raise exception 'SAMPLE_SCANNER_TENANT_LEAK';end if;
 begin perform public.lookup_scanned_record(c,E'SAMPLE-EXACT\nSAMPLE-OTHER');raise exception 'SAMPLE_MULTILINE_SCAN_ALLOWED';exception when others then if sqlerrm<>'INVALID_SEARCH_QUERY' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_outsider'),true);
 if exists(select 1 from public.lookup_scanned_record(c,'SAMPLE-EXACT')) then raise exception 'SAMPLE_SCANNER_PERMISSION_LEAK';end if;
end $$;
rollback;
