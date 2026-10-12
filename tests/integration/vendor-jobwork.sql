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

do $$
declare c uuid:=current_setting('app.sample_company_id')::uuid;item uuid;supplier uuid;loc uuid;wh uuid;lot uuid;plan uuid;order_id uuid;event_id uuid;returned_lot uuid;payload jsonb;other uuid;j jsonb;
begin
 insert into public.items(company_id,sku,description,base_uom) values(c,'SAMPLE-JOBWORK','SAMPLE wire','kg') returning id into item;
 insert into public.suppliers(company_id,code,name) values(c,'SAMPLE-VENDOR','SAMPLE processor') returning id into supplier;
 insert into public.warehouses(company_id,plant_id,code,name) select c,id,'SAMPLE-W','SAMPLE warehouse' from public.plants where company_id=c returning id into wh;
 insert into public.stock_locations(company_id,warehouse_id,code,name) values(c,wh,'SAMPLE-L','SAMPLE location') returning id into loc;
 lot:=public.receive_finished_goods(c,item,loc,'SAMPLE-VENDOR-SOURCE',10,'kg','receive');
 payload:=jsonb_build_object('lot_id',lot,'supplier_id',supplier,'number','SAMPLE-VENDOR-ORDER','process','SAMPLE processor operation','due_date',current_date+7,'quantity','6','uom','kg');
 order_id:=public.vendor_jobwork_command(c,'create',payload,'create');
 if public.vendor_jobwork_command(c,'create',payload,'create')<>order_id then raise exception 'SAMPLE_VENDOR_CREATE_RETRY';end if;
 begin perform public.vendor_jobwork_command(c,'create',payload||'{"quantity":"7"}','create');raise exception 'SAMPLE_VENDOR_CHANGED_RETRY_ALLOWED';exception when others then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise;end if;end;
 payload:=jsonb_build_object('order_id',order_id,'revision',1,'lot_revision',1,'quantity','4','uom','kg','reference','SAMPLE outward','reason','SAMPLE custody transfer');
 begin perform public.vendor_jobwork_command(c,'send',payload,'held-send');raise exception 'SAMPLE_HELD_VENDOR_SEND_ALLOWED';exception when others then if sqlerrm<>'LOT_QC_HOLD' then raise;end if;end;
 plan:=public.quality_command(c,'create_plan',jsonb_build_object('item_id',item,'label','SAMPLE incoming','version','A','sample_size',1,'characteristics','[{"key":"condition","label":"SAMPLE condition","type":"attribute","expected":"PASS"}]'::jsonb),'plan');
 perform public.quality_command(c,'approve_plan',jsonb_build_object('plan_id',plan),'approve');
 perform public.quality_command(c,'inspect',jsonb_build_object('lot_id',lot,'plan_id',plan,'kind','incoming','revision',1,'readings','[{"key":"condition","values":["PASS"]}]'::jsonb,'reason','SAMPLE incoming'),'inspect');
 perform public.release_stock_lot(c,lot,1,'release');
 payload:=jsonb_set(payload,'{lot_revision}','2');
 begin perform public.vendor_jobwork_command(c,'send',jsonb_set(payload,'{quantity}','"7"'),'over-send');raise exception 'SAMPLE_VENDOR_OVER_SEND';exception when others then if sqlerrm<>'VENDOR_ORDER_QUANTITY_EXCEEDED' then raise;end if;end;
 begin perform public.vendor_jobwork_command(c,'send',jsonb_set(payload,'{revision}','null'),'null-rev');raise exception 'SAMPLE_VENDOR_NULL_REVISION';exception when others then if sqlerrm<>'REVISION_CONFLICT' then raise;end if;end;
 event_id:=public.vendor_jobwork_command(c,'send',payload,'send');
 if public.vendor_jobwork_command(c,'send',payload,'send')<>event_id then raise exception 'SAMPLE_VENDOR_SEND_RETRY';end if;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_planner_id'),true);
 begin perform public.vendor_jobwork_command(c,'send',jsonb_build_object('order_id',order_id,'revision',2,'lot_revision',3,'quantity','1','uom','kg','reference','SAMPLE','reason','SAMPLE'),'planner-send');raise exception 'SAMPLE_PLANNER_STOCK_ISSUE_BYPASS';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin perform public.vendor_jobwork_command(c,'receive',jsonb_build_object('order_id',order_id,'revision',2,'quantity','1','uom','kg','reference','SAMPLE','reason','SAMPLE','location_id',loc,'lot_code','SAMPLE-PLANNER-RECEIPT'),'planner-receive');raise exception 'SAMPLE_PLANNER_STOCK_RECEIVE_BYPASS';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_operator_id'),true);
 if not exists(select 1 from public.stock_positions where lot_id=lot and on_hand=6) or not exists(select 1 from public.vendor_order_positions where id=order_id and sent_quantity=4 and at_vendor_quantity=4 and remaining_to_send=2) then raise exception 'SAMPLE_VENDOR_CUSTODY_BALANCE_WRONG';end if;
 begin perform public.vendor_jobwork_command(c,'close',jsonb_build_object('order_id',order_id,'revision',2,'reason','SAMPLE premature close'),'close-pending');raise exception 'SAMPLE_VENDOR_UNACCOUNTED_CLOSE';exception when others then if sqlerrm<>'VENDOR_CUSTODY_PENDING' then raise;end if;end;
 payload:=jsonb_build_object('order_id',order_id,'revision',2,'quantity','3','uom','kg','reference','SAMPLE inward','reason','SAMPLE partial return','location_id',loc,'lot_code','SAMPLE-VENDOR-RETURN','certificate_reference','SAMPLE processor certificate reference');
 begin perform public.vendor_jobwork_command(c,'receive',jsonb_set(payload,'{quantity}','"5"'),'over-return');raise exception 'SAMPLE_VENDOR_OVER_RETURN';exception when others then if sqlerrm<>'INSUFFICIENT_VENDOR_CUSTODY' then raise;end if;end;
 begin perform public.vendor_jobwork_command(c,'receive',payload||'{"uom":"pcs"}','wrong-unit');raise exception 'SAMPLE_VENDOR_UNIT_CONVERSION';exception when others then if sqlerrm<>'UOM_MISMATCH' then raise;end if;end;
 event_id:=public.vendor_jobwork_command(c,'receive',payload,'return');
 if public.vendor_jobwork_command(c,'receive',payload,'return')<>event_id then raise exception 'SAMPLE_VENDOR_RETURN_RETRY';end if;
 select output_lot_id into returned_lot from public.vendor_custody_events where id=event_id;
 if not exists(select 1 from public.stock_positions where lot_id=returned_lot and on_hand=3 and qc_status='hold') or not exists(select 1 from public.lot_genealogy where child_lot_id=returned_lot and parent_lot_id=lot and vendor_receipt_id=event_id and quantity=3 and uom='kg') then raise exception 'SAMPLE_VENDOR_RETURN_HISTORY_MISSING';end if;
 begin perform public.release_stock_lot(c,returned_lot,1,'bypass');raise exception 'SAMPLE_VENDOR_PARENT_QC_INHERITED';exception when others then if sqlerrm<>'INSPECTION_REQUIRED' then raise;end if;end;
 begin perform public.receive_finished_goods(c,item,loc,'SAMPLE-VENDOR-RETURN',1,'kg','topup');raise exception 'SAMPLE_VENDOR_MANUAL_TOPUP';exception when others then if sqlerrm<>'MANAGED_LOT_RECEIPT' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_reviewer_id'),true);
 begin perform public.vendor_jobwork_command(c,'loss',jsonb_build_object('order_id',order_id,'revision',3,'quantity','1','uom','kg','reference','SAMPLE unauthorized review','reason','SAMPLE'),'stores-loss');raise exception 'SAMPLE_STORES_LOSS_REVIEW_BYPASS';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_operator_id'),true);
 perform public.vendor_jobwork_command(c,'loss',jsonb_build_object('order_id',order_id,'revision',3,'quantity','1','uom','kg','reference','SAMPLE confirmed loss','reason','SAMPLE reviewed physical shortage'),'loss');
 if (public.get_factory_report(c,'vendor')->>'total')::integer<>0 then raise exception 'SAMPLE_VENDOR_REPORT_CLOSED_CUSTODY';end if;
 if not exists(select 1 from public.vendor_order_positions where id=order_id and at_vendor_quantity=0 and returned_quantity=3 and loss_quantity=1 and sent_quantity=4) then raise exception 'SAMPLE_VENDOR_RECONCILIATION_WRONG';end if;
 if (select sum(on_hand) from public.stock_positions where item_id=item)<>9 then raise exception 'SAMPLE_VENDOR_LOSS_DOUBLE_DEBIT';end if;
 begin perform public.vendor_jobwork_command(c,'close',jsonb_build_object('order_id',order_id,'revision',4,'reason','SAMPLE incomplete order'),'close-unsent');raise exception 'SAMPLE_VENDOR_UNSENT_SILENTLY_CANCELLED';exception when others then if sqlerrm<>'VENDOR_UNSENT_BALANCE' then raise;end if;end;
 perform public.vendor_jobwork_command(c,'close',jsonb_build_object('order_id',order_id,'revision',4,'reason','SAMPLE explicitly cancel unsent balance','cancel_unsent',true),'close');
 if not exists(select 1 from public.vendor_order_positions where id=order_id and status='closed' and cancelled_unsent_quantity=2 and at_vendor_quantity=0) then raise exception 'SAMPLE_VENDOR_SHORT_CLOSE_LOST_PLAN';end if;
 begin perform public.vendor_jobwork_command(c,'loss',jsonb_build_object('order_id',order_id,'revision',5,'quantity','1','uom','kg','reference','SAMPLE','reason','SAMPLE'),'closed-write');raise exception 'SAMPLE_VENDOR_CLOSED_WRITE';exception when others then if sqlerrm<>'INVALID_TRANSITION' then raise;end if;end;
 other:=public.vendor_jobwork_command(c,'create',jsonb_build_object('lot_id',lot,'supplier_id',supplier,'number','SAMPLE-CANCEL-VENDOR','process','SAMPLE processing','due_date',current_date+7,'quantity','1','uom','kg'),'cancel-create');
 payload:=jsonb_build_object('order_id',other,'revision',1,'reason','SAMPLE cancelled before handing over');
 perform public.vendor_jobwork_command(c,'cancel',payload,'cancel');
 if public.vendor_jobwork_command(c,'cancel',payload,'cancel')<>other or not exists(select 1 from public.vendor_order_positions where id=other and status='cancelled' and sent_quantity=0 and cancelled_unsent_quantity=1) then raise exception 'SAMPLE_VENDOR_CANCELLATION_LOST_HISTORY';end if;
 begin update public.vendor_orders set quantity=99 where id=other;raise exception 'SAMPLE_VENDOR_CLIENT_EDIT_ALLOWED';exception when insufficient_privilege then null;end;
 j:=public.get_vendor_workspace(c);if jsonb_array_length(j->'orders')<>2 or jsonb_array_length(j->'events')<>3 then raise exception 'SAMPLE_VENDOR_READ_INVALID';end if;
 perform set_config('request.jwt.claim.sub',current_setting('app.sample_outsider_id'),true);
 if jsonb_array_length(public.get_vendor_workspace(c)->'orders')<>0 or exists(select 1 from public.vendor_order_positions where company_id=c) then raise exception 'SAMPLE_VENDOR_TENANT_LEAK';end if;
 begin perform public.vendor_jobwork_command(c,'create',payload,'outsider');raise exception 'SAMPLE_VENDOR_PERMISSION_BYPASS';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
end $$;
reset role;
do $$ begin
 begin update public.vendor_custody_events set reference='SAMPLE forged' where company_id=current_setting('app.sample_company_id')::uuid;raise exception 'SAMPLE_VENDOR_EVENT_MUTABLE';exception when others then if sqlerrm<>'APPEND_ONLY_HISTORY' then raise;end if;end;
end $$;
rollback;
