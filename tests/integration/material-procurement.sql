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
declare
  c uuid:=current_setting('app.sample_company_id')::uuid; operator_id uuid:=current_setting('app.sample_operator_id')::uuid;
  supplier_id uuid; item_id uuid; warehouse_id uuid; location_id uuid; req_id uuid; po_id uuid; receipt_id uuid; v_lot_id uuid;
  count_id uuid; result_id uuid;
begin
  insert into public.suppliers(company_id,code,name) values(c,'SAMPLE-SUP','SAMPLE Supplier') returning id into supplier_id;
  insert into public.items(company_id,sku,description,base_uom) values(c,'SAMPLE-STEEL','SAMPLE Steel','kg') returning id into item_id;
  insert into public.warehouses(company_id,plant_id,code,name) select c,id,'SAMPLE-WH','SAMPLE Warehouse' from public.plants where company_id=c returning id into warehouse_id;
  insert into public.stock_locations(company_id,warehouse_id,code,name) values(c,warehouse_id,'SAMPLE-LOC','SAMPLE Location') returning id into location_id;
  req_id:=public.request_material(c,'SAMPLE-PR',item_id,10,'kg','SAMPLE demand',current_date+7,null,'request');
  begin
    update public.items set base_uom='pcs' where id=item_id;
    raise exception 'SAMPLE_PURCHASE_UNIT_DRIFT_ALLOWED';
  exception when others then if sqlerrm<>'UOM_IN_USE' then raise; end if; end;
  if req_id<>public.request_material(c,'SAMPLE-PR',item_id,10,'kg','SAMPLE demand',current_date+7,null,'request') then raise exception 'SAMPLE_REQUEST_NOT_IDEMPOTENT'; end if;
  begin
    perform public.request_material(c,'SAMPLE-PR',item_id,11,'kg','SAMPLE demand',current_date+7,null,'request');
    raise exception 'SAMPLE_CHANGED_RETRY_ACCEPTED';
  exception when others then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
  begin
    perform public.request_material(c,'SAMPLE-WRONG-UNIT',item_id,10,'pcs','SAMPLE demand',current_date+7,null,'wrong-unit');
    raise exception 'SAMPLE_MATERIAL_CONVERSION_ALLOWED';
  exception when others then if sqlerrm<>'UOM_MISMATCH' then raise; end if; end;
  po_id:=public.create_purchase_order(c,req_id,supplier_id,'SAMPLE-PO',20.1234,'INR',current_date+7,1,'po');
  begin
    perform public.receive_purchase_order(c,po_id,'SAMPLE-PRE-APPROVAL','SAMPLE-LOT-PRE','SAMPLE-HEAT','SAMPLE-CERT',location_id,6,'kg',1,'before-approval');
    raise exception 'SAMPLE_UNAPPROVED_PO_RECEIVED';
  exception when others then if sqlerrm<>'INVALID_TRANSITION' then raise; end if; end;
  perform public.approve_purchase_order(c,po_id,1,'approve');
  receipt_id:=public.receive_purchase_order(c,po_id,'SAMPLE-GRN','SAMPLE-LOT','SAMPLE-HEAT','SAMPLE-CERT',location_id,6,'kg',2,'receive');
  if receipt_id<>public.receive_purchase_order(c,po_id,'SAMPLE-GRN','SAMPLE-LOT','SAMPLE-HEAT','SAMPLE-CERT',location_id,6,'kg',2,'receive') then raise exception 'SAMPLE_RECEIPT_NOT_IDEMPOTENT'; end if;
  select lot_id into v_lot_id from public.goods_receipts where id=receipt_id;
  if not exists(select 1 from public.stock_positions where lot_id=v_lot_id and company_id=c and on_hand=6 and reserved=0 and available_to_promise=0 and qc_status='hold') then raise exception 'SAMPLE_RECEIPT_NOT_HELD'; end if;
  if not exists(select 1 from public.purchase_orders where id=po_id and status='partially_received' and revision=3) then raise exception 'SAMPLE_PARTIAL_RECEIPT_STATE_WRONG'; end if;
  begin
    perform public.receive_purchase_order(c,po_id,'SAMPLE-EXCESS','SAMPLE-EXCESS','SAMPLE-HEAT','',location_id,5,'kg',3,'excess');
    raise exception 'SAMPLE_PO_OVER_RECEIPT_ALLOWED';
  exception when others then if sqlerrm<>'PURCHASE_QUANTITY_EXCEEDED' then raise; end if; end;
  result_id:=public.return_goods_receipt(c,receipt_id,2,'SAMPLE damaged delivery',1,'return');
  if result_id<>public.return_goods_receipt(c,receipt_id,2,'SAMPLE damaged delivery',1,'return') then raise exception 'SAMPLE_RETURN_NOT_IDEMPOTENT'; end if;
  begin
    perform public.return_goods_receipt(c,receipt_id,5,'SAMPLE excessive return',2,'negative-stock');
    raise exception 'SAMPLE_NEGATIVE_RETURN_ALLOWED';
  exception when others then if sqlerrm<>'INSUFFICIENT_AVAILABLE_STOCK' then raise; end if; end;
  if (public.get_factory_report(c,'receipts')->'rows'->0->>'quantity')::numeric is distinct from 6 then raise exception 'SAMPLE_REPORT_NET_RECEIPT_QUANTITY';end if;
  count_id:=public.propose_stock_count(c,v_lot_id,5,'SAMPLE physical count',2,'count');
  begin
    perform public.review_stock_count(c,count_id,false,'SAMPLE self review','self-review');
    raise exception 'SAMPLE_SELF_COUNT_APPROVAL_ALLOWED';
  exception when others then if sqlerrm<>'SECOND_REVIEWER_REQUIRED' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',current_setting('app.sample_reviewer_id'),true);
  perform public.review_stock_count(c,count_id,false,'SAMPLE second review','review');
  if not exists(select 1 from public.stock_positions p where p.lot_id=v_lot_id and p.on_hand=5) then raise exception 'SAMPLE_COUNT_VARIANCE_NOT_POSTED'; end if;
  perform public.review_stock_count(c,count_id,true,'SAMPLE correction reversal','reverse');
  if not exists(select 1 from public.stock_positions p where p.lot_id=v_lot_id and p.on_hand=4) then raise exception 'SAMPLE_COUNT_REVERSAL_WRONG'; end if;
  perform public.reject_stock_lot(c,v_lot_id,'SAMPLE QC rejection',4,'reject');
  if not exists(select 1 from public.stock_lots where id=v_lot_id and qc_status='rejected') then raise exception 'SAMPLE_REJECTION_NOT_RECORDED'; end if;
  if not exists(select 1 from public.search_company_records(c,'SAMPLE-PO') where record_id=po_id) then raise exception 'SAMPLE_PURCHASE_SEARCH_MISSING'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('app.sample_outsider_id'),true);
  if exists(select 1 from public.purchase_orders where company_id=c) or exists(select 1 from public.goods_receipts where company_id=c) or exists(select 1 from public.search_company_records(c,'SAMPLE')) then raise exception 'SAMPLE_PURCHASE_TENANT_LEAK'; end if;
  begin
    perform public.approve_purchase_order(c,po_id,1,'outsider');
    raise exception 'SAMPLE_UNAUTHORIZED_PURCHASE_COMMAND_ALLOWED';
  exception when others then if sqlerrm<>'FORBIDDEN' then raise; end if; end;
end $$;
rollback;
