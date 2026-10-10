-- Run only through a privileged hosted test connection against an empty disposable project or branch.
-- Every change is rolled back. The inner commands run as an authenticated SAMPLE operator.
begin;

select set_config('app.sample_operator_id', gen_random_uuid()::text, true);
select set_config('app.sample_unauthorized_id', gen_random_uuid()::text, true);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  current_setting('app.sample_operator_id')::uuid, 'authenticated', 'authenticated', concat('sample.operator+', current_setting('app.sample_operator_id'), '@invalid.test'),
  now(), '{"provider":"email","providers":["email"]}', '{"display_name":"SAMPLE Operator"}', now(), now()
);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  current_setting('app.sample_unauthorized_id')::uuid, 'authenticated', 'authenticated', concat('sample.unauthorized+', current_setting('app.sample_unauthorized_id'), '@invalid.test'),
  now(), '{"provider":"email","providers":["email"]}', '{"display_name":"SAMPLE Unauthorized"}', now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.sample_operator_id'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  v_operator_id uuid := current_setting('app.sample_operator_id')::uuid;
  v_unauthorized_id uuid := current_setting('app.sample_unauthorized_id')::uuid;
  v_company_id uuid;
  v_plant_id uuid;
  v_customer_id uuid;
  v_item_id uuid;
  v_component_item_id uuid;
  v_bom_id uuid;
  v_bom_revision_id uuid;
  v_bom_line_id uuid;
  v_routing_id uuid;
  v_routing_revision_id uuid;
  v_routing_operation_id uuid;
  v_warehouse_id uuid;
  v_location_id uuid;
  v_rfq_id uuid;
  v_quotation_id uuid;
  v_sales_order_id uuid;
  v_sales_order_line_id uuid;
  v_sales_order_revision integer;
  v_lot_id uuid;
  v_reservation_id uuid;
  v_repeat_reservation_id uuid;
  v_shipment_id uuid;
  v_repeat_shipment_id uuid;
  v_on_hand numeric;
  v_shipment_ledger_entries integer;
  v_stock_status text;
  v_packing_dispatch_status text;
begin
  select public.bootstrap_initial_company('SAMPLE Factory', 'SAMPLE Plant') into v_company_id;
  select id into v_plant_id from public.plants where company_id = v_company_id;
  insert into public.customers (company_id, code, name) values (v_company_id, 'SAMPLE-CUST', 'SAMPLE Customer') returning id into v_customer_id;
  insert into public.suppliers (company_id, code, name) values (v_company_id, 'SAMPLE-SUP', 'SAMPLE Supplier');
  insert into public.items (company_id, sku, description, base_uom) values (v_company_id, 'SAMPLE-M8', 'SAMPLE M8 fastener', 'pcs') returning id into v_item_id;
  insert into public.items (company_id, sku, description, base_uom) values (v_company_id, 'SAMPLE-M6', 'SAMPLE M6 component', 'pcs') returning id into v_component_item_id;
  insert into public.drawings (company_id, item_id, drawing_number) values (v_company_id, v_item_id, 'SAMPLE-DRW-001');
  insert into public.work_centres (company_id, plant_id, code, name) values (v_company_id, v_plant_id, 'SAMPLE-WC', 'SAMPLE Work Centre');
  insert into public.warehouses (company_id, plant_id, code, name) values (v_company_id, v_plant_id, 'SAMPLE-WH', 'SAMPLE Warehouse') returning id into v_warehouse_id;
  insert into public.stock_locations (company_id, warehouse_id, code, name) values (v_company_id, v_warehouse_id, 'SAMPLE-LOC', 'SAMPLE Location') returning id into v_location_id;
  if not exists (
    select 1 from public.search_company_records(v_company_id, 'SAMPLE-CUST')
    where record_type = 'Customer' and label = 'SAMPLE-CUST — SAMPLE Customer'
  ) then raise exception 'SAMPLE_GLOBAL_SEARCH_MISSING_RESULT'; end if;

  perform set_config('request.jwt.claim.sub', v_unauthorized_id::text, true);
  begin
    insert into public.suppliers (company_id, code, name) values (v_company_id, 'SAMPLE-DENIED-SUP', 'SAMPLE Denied Supplier');
    raise exception 'SAMPLE_UNAUTHORIZED_MASTER_DATA_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.search_company_records(v_company_id, 'SAMPLE-CUST')) then
    raise exception 'SAMPLE_GLOBAL_SEARCH_UNAUTHORIZED_RESULT';
  end if;
  perform set_config('request.jwt.claim.sub', v_operator_id::text, true);

  insert into public.boms (company_id, output_item_id, name) values (v_company_id, v_item_id, 'SAMPLE M8 BOM') returning id into v_bom_id;
  insert into public.bom_revisions (company_id, bom_id, revision) values (v_company_id, v_bom_id, 'A') returning id into v_bom_revision_id;
  insert into public.bom_lines (company_id, bom_revision_id, component_item_id, quantity, uom) values (v_company_id, v_bom_revision_id, v_component_item_id, 1, 'pcs') returning id into v_bom_line_id;
  insert into public.routings (company_id, output_item_id, name) values (v_company_id, v_item_id, 'SAMPLE M8 Routing') returning id into v_routing_id;
  insert into public.routing_revisions (company_id, routing_id, revision) values (v_company_id, v_routing_id, 'A') returning id into v_routing_revision_id;
  insert into public.routing_operations (company_id, routing_revision_id, sequence, work_centre_id, operation_name, setup_minutes, run_minutes_per_unit)
  select v_company_id, v_routing_revision_id, 10, id, 'SAMPLE Operation', 5, 0.5 from public.work_centres where company_id = v_company_id returning id into v_routing_operation_id;
  update public.bom_revisions set status = 'approved', approved_at = now(), approved_by = v_operator_id where id = v_bom_revision_id;
  update public.routing_revisions set status = 'approved', approved_at = now(), approved_by = v_operator_id where id = v_routing_revision_id;
  begin
    update public.bom_revisions set revision = 'B' where id = v_bom_revision_id;
    raise exception 'SAMPLE_APPROVED_BOM_REVISION_MUTABLE';
  exception when others then
    if sqlerrm <> 'APPROVED_REVISION_IMMUTABLE' then raise; end if;
  end;
  begin
    update public.routing_revisions set revision = 'B' where id = v_routing_revision_id;
    raise exception 'SAMPLE_APPROVED_ROUTING_REVISION_MUTABLE';
  exception when others then
    if sqlerrm <> 'APPROVED_REVISION_IMMUTABLE' then raise; end if;
  end;
  update public.bom_lines set quantity = 2 where id = v_bom_line_id;
  if found then raise exception 'SAMPLE_APPROVED_BOM_LINE_MUTABLE'; end if;
  update public.routing_operations set operation_name = 'SAMPLE Changed Operation' where id = v_routing_operation_id;
  if found then raise exception 'SAMPLE_APPROVED_ROUTING_OPERATION_MUTABLE'; end if;

  select public.create_rfq(v_company_id, 'SAMPLE-RFQ-001', v_customer_id, 'SAMPLE M8 fastener enquiry',
    '[{"item_id":null,"requested_description":"SAMPLE M8 fastener","quantity":10,"uom":"pcs","required_by":null}]'::jsonb, 'sample-rfq-001') into v_rfq_id;
  perform public.record_feasibility(v_company_id, v_rfq_id, 'feasible', null, v_bom_revision_id, v_routing_revision_id, 'SAMPLE', 1, 'sample-feasibility-001');
  select public.create_quotation(v_company_id, v_rfq_id, 'SAMPLE-Q-001', 'INR', current_date + 30,
    jsonb_build_array(jsonb_build_object('item_id', v_item_id, 'quantity', 10, 'uom', 'pcs', 'unit_price', 25, 'bom_revision_id', v_bom_revision_id, 'routing_revision_id', v_routing_revision_id)),
    'sample-quotation-001') into v_quotation_id;
  perform set_config('request.jwt.claim.sub', v_unauthorized_id::text, true);
  begin
    perform public.approve_quotation(v_company_id, v_quotation_id, 1, 'sample-denied-approval-001');
    raise exception 'SAMPLE_UNAUTHORIZED_APPROVAL_ALLOWED';
  exception when others then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', v_operator_id::text, true);
  perform public.approve_quotation(v_company_id, v_quotation_id, 1, 'sample-approval-001');
  select public.accept_quotation_create_sales_order(v_company_id, v_quotation_id, 'SAMPLE-SO-001', 'SAMPLE-PO-001', current_date + 14, 2, 'sample-sales-order-001') into v_sales_order_id;
  select id into v_sales_order_line_id from public.sales_order_lines where sales_order_id = v_sales_order_id;
  if not exists (select 1 from public.sales_order_lines where id = v_sales_order_line_id and bom_revision_id = v_bom_revision_id and routing_revision_id = v_routing_revision_id) then
    raise exception 'SAMPLE_ENGINEERING_REVISIONS_NOT_PINNED';
  end if;
  select stock_status into v_stock_status from public.get_order_command_center(v_company_id) where sales_order_id = v_sales_order_id;
  if v_stock_status <> 'awaiting reservation' then raise exception 'SAMPLE_COMMAND_CENTER_INITIAL_STATUS_UNEXPECTED'; end if;

  select public.receive_finished_goods(v_company_id, v_item_id, v_location_id, 'SAMPLE-LOT-001', 10, 'pcs', 'sample-receipt-001') into v_lot_id;
  perform public.release_stock_lot(v_company_id, v_lot_id, 1, 'sample-release-001');
  select public.reserve_finished_goods(v_company_id, v_sales_order_line_id, v_lot_id, 10, 1, 'sample-reservation-001') into v_reservation_id;
  select public.reserve_finished_goods(v_company_id, v_sales_order_line_id, v_lot_id, 10, 1, 'sample-reservation-001') into v_repeat_reservation_id;
  if v_repeat_reservation_id <> v_reservation_id then raise exception 'SAMPLE_RESERVATION_NOT_IDEMPOTENT'; end if;
  select revision into v_sales_order_revision from public.sales_orders where id = v_sales_order_id;
  begin
    perform public.reserve_finished_goods(v_company_id, v_sales_order_line_id, v_lot_id, 1, v_sales_order_revision, 'sample-oversell-001');
    raise exception 'SAMPLE_OVERSELL_ALLOWED';
  exception when others then
    if sqlerrm <> 'INSUFFICIENT_AVAILABLE_STOCK' then raise; end if;
  end;
  select stock_status into v_stock_status from public.get_order_command_center(v_company_id) where sales_order_id = v_sales_order_id;
  if v_stock_status <> 'reserved' then raise exception 'SAMPLE_COMMAND_CENTER_RESERVATION_STATUS_UNEXPECTED'; end if;
  select public.prepare_packing_shipment(v_company_id, v_sales_order_id, 'SAMPLE-PACK-001', 'SAMPLE-SHIP-001',
    jsonb_build_array(jsonb_build_object('reservation_id', v_reservation_id, 'quantity', 10)), 2, 'sample-packing-001') into v_shipment_id;
  perform public.dispatch_shipment(v_company_id, v_shipment_id, 1, 'sample-dispatch-001');
  select public.dispatch_shipment(v_company_id, v_shipment_id, 1, 'sample-dispatch-001') into v_repeat_shipment_id;
  if v_repeat_shipment_id <> v_shipment_id then raise exception 'SAMPLE_DISPATCH_NOT_IDEMPOTENT'; end if;

  if not exists (select 1 from public.shipments where id = v_shipment_id and status = 'dispatched') then
    raise exception 'SAMPLE_DISPATCH_NOT_COMPLETED';
  end if;
  select coalesce(sum(quantity_delta), 0) into v_on_hand from public.stock_ledger_entries where lot_id = v_lot_id;
  if v_on_hand <> 0 then
    raise exception 'SAMPLE_LEDGER_BALANCE_UNEXPECTED';
  end if;
  select count(*) into v_shipment_ledger_entries from public.stock_ledger_entries
  where company_id = v_company_id and movement_type = 'shipment';
  if v_shipment_ledger_entries <> 1 then raise exception 'SAMPLE_DISPATCH_LEDGER_DUPLICATED'; end if;
  select stock_status, packing_dispatch_status into v_stock_status, v_packing_dispatch_status
  from public.get_order_command_center(v_company_id) where sales_order_id = v_sales_order_id;
  if v_stock_status <> 'fulfilled' or v_packing_dispatch_status <> 'fulfilled' then
    raise exception 'SAMPLE_COMMAND_CENTER_DISPATCH_STATUS_UNEXPECTED';
  end if;
  perform set_config('request.jwt.claim.sub', v_unauthorized_id::text, true);
  begin
    perform public.get_order_command_center(v_company_id);
    raise exception 'SAMPLE_COMMAND_CENTER_UNAUTHORIZED_READ_ALLOWED';
  exception when others then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
end;
$$;

rollback;
