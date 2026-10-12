begin;
select set_config('app.sample_actor',gen_random_uuid()::text,true);
select set_config('app.sample_outsider',gen_random_uuid()::text,true);
select set_config('app.sample_company',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select current_setting(setting)::uuid,'authenticated','authenticated','sample+'||current_setting(setting)||'@invalid.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"display_name":"SAMPLE Operator"}'::jsonb,now(),now()
from unnest(array['app.sample_actor','app.sample_outsider']) setting;
insert into public.companies(id,name,created_by) values(current_setting('app.sample_company')::uuid,'SAMPLE Record Paging Factory',current_setting('app.sample_actor')::uuid);
insert into public.plants(company_id,name) values(current_setting('app.sample_company')::uuid,'SAMPLE Plant');
insert into public.company_memberships(company_id,user_id) values(current_setting('app.sample_company')::uuid,current_setting('app.sample_actor')::uuid);
insert into public.user_company_roles(company_id,user_id,role) values(current_setting('app.sample_company')::uuid,current_setting('app.sample_actor')::uuid,'admin');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.sample_actor'),true);
do $$
declare c uuid:=current_setting('app.sample_company')::uuid;item uuid;wh uuid;loc uuid;lot uuid;page1 jsonb;page2 jsonb;cursor jsonb;all_ids uuid[];n integer;
begin
 insert into public.items(company_id,sku,description,base_uom) values(c,'SAMPLE-PAGE','SAMPLE record paging item','pcs') returning id into item;
 insert into public.warehouses(company_id,plant_id,code,name) select c,id,'SAMPLE-WH','SAMPLE warehouse' from public.plants where company_id=c returning id into wh;
 insert into public.stock_locations(company_id,warehouse_id,code,name) values(c,wh,'SAMPLE-LOC','SAMPLE location') returning id into loc;
 for n in 1..25 loop lot:=public.receive_finished_goods(c,item,loc,'SAMPLE-LOT-'||n::text,1,'pcs','receipt-'||n::text);end loop;
 page1:=public.get_record_links_page(c,'item',item);
 if jsonb_array_length(page1->'rows')<>20 or not (page1->>'has_more')::boolean then raise exception 'SAMPLE_LINK_PAGE_SIZE';end if;
 cursor:=page1->'rows'->19;
 page2:=public.get_record_links_page(c,'item',item,cursor->>'kind',(cursor->>'id')::uuid);
 if jsonb_array_length(page2->'rows')<>5 or (page2->>'has_more')::boolean then raise exception 'SAMPLE_LINK_END_PAGE';end if;
 select array_agg((r->>'id')::uuid) into all_ids from jsonb_array_elements((page1->'rows')||(page2->'rows')) r;
 if (select count(distinct i) from unnest(all_ids) i)<>25 then raise exception 'SAMPLE_LINK_MISSING_OR_DUPLICATED';end if;
 if not exists(select 1 from jsonb_array_elements(public.get_record_links_page(c,'lot',lot)->'rows') r where r->>'id'=item::text and r->>'kind'='item') then raise exception 'SAMPLE_PARENT_LINK_LOST';end if;
 if jsonb_array_length(public.get_record_links_page(gen_random_uuid(),'item',item)->'rows')<>0 then raise exception 'SAMPLE_LINK_TENANT_LEAK';end if;
 begin perform public.get_record_links_page(c,'item',item,'lot',null);raise exception 'SAMPLE_INVALID_CURSOR_ALLOWED';exception when others then if sqlerrm<>'INVALID_CURSOR' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_outsider'),true);
 if jsonb_array_length(public.get_record_links_page(c,'item',item)->'rows')<>0 then raise exception 'SAMPLE_LINK_PERMISSION_LEAK';end if;
end $$;
rollback;
