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
select current_setting('app.sample_company_id')::uuid,current_setting(setting)::uuid,case when setting='app.sample_operator_id' then 'admin'::public.app_role else 'stores'::public.app_role end from unnest(array['app.sample_operator_id','app.sample_reviewer_id']) setting;
select set_config('app.sample_planner_id',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(current_setting('app.sample_planner_id')::uuid,'authenticated','authenticated','sample+'||current_setting('app.sample_planner_id')||'@invalid.test',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"display_name":"SAMPLE Planner"}'::jsonb,now(),now());
insert into public.company_memberships(company_id,user_id) values(current_setting('app.sample_company_id')::uuid,current_setting('app.sample_planner_id')::uuid);
insert into public.user_company_roles(company_id,user_id,role) values(current_setting('app.sample_company_id')::uuid,current_setting('app.sample_planner_id')::uuid,'planning');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.sample_operator_id'),true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$ declare c uuid:=current_setting('app.sample_company_id')::uuid;i uuid;k uuid;w uuid;l uuid;lot uuid;begin
 insert into public.items(company_id,sku,description,base_uom) values(c,'SAMPLE-PAGE-PCS','SAMPLE count unit','pcs') returning id into i;
 insert into public.items(company_id,sku,description,base_uom) values(c,'SAMPLE-PAGE-KG','SAMPLE weight unit','kg') returning id into k;
 insert into public.warehouses(company_id,plant_id,code,name) select c,id,'SAMPLE-W','SAMPLE warehouse' from public.plants where company_id=c returning id into w;
 insert into public.stock_locations(company_id,warehouse_id,code,name) values(c,w,'SAMPLE-L','SAMPLE location') returning id into l;
 lot:=public.receive_finished_goods(c,i,l,'SAMPLE-PCS-LOT',0.000001,'pcs','pcs');
 perform public.receive_finished_goods(c,k,l,'SAMPLE-KG-LOT',999999999999.999999,'kg','kg');
 perform set_config('app.sample_lot',lot::text,true);
end $$;
reset role;
-- Trusted isolated fixtures exercise pagination and plant-midnight boundaries, never production data.
insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by,occurred_at)
 select l.company_id,l.id,l.item_id,l.location_id,'receipt',1,'pcs','SAMPLE report fixture',gen_random_uuid(),'SAMPLE-page-'||n,current_setting('app.sample_operator_id')::uuid,'2030-01-01T00:00:00Z'::timestamptz
 from public.stock_lots l cross join generate_series(1,51) n where l.id=current_setting('app.sample_lot')::uuid;
insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by,occurred_at)
 select l.company_id,l.id,l.item_id,l.location_id,'adjustment',e.quantity,'pcs','SAMPLE plant boundary',gen_random_uuid(),'SAMPLE-boundary-'||e.n,current_setting('app.sample_operator_id')::uuid,e.at
 from public.stock_lots l cross join (values
 (1,1::numeric,'2031-02-02T18:29:59Z'::timestamptz),(2,1.234567::numeric,'2031-02-02T18:30:00Z'::timestamptz),
 (3,-0.123456::numeric,'2031-02-03T18:29:59Z'::timestamptz),(4,1::numeric,'2031-02-03T18:30:00Z'::timestamptz)) e(n,quantity,at)
 where l.id=current_setting('app.sample_lot')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('app.sample_operator_id'),true);
do $$ declare c uuid:=current_setting('app.sample_company_id')::uuid;j jsonb;k jsonb;kind text;begin
 j:=public.get_factory_report(c,'movements');k:=public.get_factory_report(c,'movements',null,null,'',1);
 if (j->>'total')::integer<>57 or jsonb_array_length(j->'rows')<>50 or jsonb_array_length(k->'rows')<>7 then raise exception 'SAMPLE_REPORT_PAGINATION_WRONG';end if;
 if exists(select 1 from jsonb_array_elements(j->'rows') a join jsonb_array_elements(k->'rows') b on a->>'key'=b->>'key') then raise exception 'SAMPLE_REPORT_PAGE_OVERLAP';end if;
 if not exists(select 1 from jsonb_array_elements(k->'rows') r where r->>'quantity'='999999999999.999999' and r->>'uom'='kg') and not exists(select 1 from jsonb_array_elements(j->'rows') r where r->>'quantity'='999999999999.999999' and r->>'uom'='kg') then raise exception 'SAMPLE_REPORT_NUMERIC_ROUNDED';end if;
 j:=public.get_factory_report(c,'movements','2031-02-03','2031-02-03');
 if (j->>'total')::integer<>2 or not exists(select 1 from jsonb_array_elements(j->'rows') r where r->>'quantity'='-0.123456') then raise exception 'SAMPLE_REPORT_PLANT_DATE_BOUNDARY';end if;
 if (public.get_factory_report(c,'movements',null,null,'%')->>'total')::integer<>0 then raise exception 'SAMPLE_REPORT_SEARCH_WILDCARD';end if;
 if (public.get_factory_report(c,'movements',null,null,'SAMPLE-PAGE-KG')->>'total')::integer<>1 then raise exception 'SAMPLE_REPORT_ITEM_FILTER';end if;
 foreach kind in array array['backlog','shortages','wip','receipts','ncr','yield','vendor'] loop
  if (public.get_factory_report(c,kind)->>'total')::integer<>0 then raise exception 'SAMPLE_REPORT_EMPTY_KIND_WRONG';end if;
 end loop;
 begin perform public.get_factory_report(c,'invalid');raise exception 'SAMPLE_REPORT_BAD_KIND_ALLOWED';exception when others then if sqlerrm<>'INVALID_REPORT_FILTER' then raise;end if;end;
 begin perform public.get_factory_report(c,'movements','2031-02-04','2031-02-03');raise exception 'SAMPLE_REPORT_REVERSED_DATES';exception when others then if sqlerrm<>'INVALID_REPORT_FILTER' then raise;end if;end;
 begin perform public.get_factory_report(c,'movements',null,null,'',-1);raise exception 'SAMPLE_REPORT_NEGATIVE_PAGE';exception when others then if sqlerrm<>'INVALID_REPORT_FILTER' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_planner_id'),true);
 begin perform public.get_factory_report(c,'receipts');raise exception 'SAMPLE_REPORT_SOURCE_ROLE_BYPASS';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_outsider_id'),true);
 if exists(select 1 from public.factory_report_rows where company_id=c) then raise exception 'SAMPLE_REPORT_VIEW_TENANT_LEAK';end if;
 begin perform public.get_factory_report(c,'movements');raise exception 'SAMPLE_REPORT_TENANT_LEAK';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
end $$;
rollback;
