-- Final-QC closure covers surviving split/merge output descendants as well as direct output.
create or replace function public.production_command(p_company_id uuid,p_action text,p_data jsonb,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_permission text; v_request jsonb:=jsonb_build_array(p_action,p_data); v_qty numeric; v_other numeric;
 v_item public.items%rowtype; v_pkg public.engineering_packages%rowtype; v_wo public.work_orders%rowtype;
 v_job public.job_cards%rowtype; v_lot public.stock_lots%rowtype; v_issue public.material_issues%rowtype;
 v_line public.sales_order_lines%rowtype; v_bom uuid; v_route uuid; v_header uuid; v_uom text; v_row jsonb; v_good numeric; v_scrap numeric;
begin
 v_permission:=case when p_action in ('create_package','approve_package') then 'master_data.manage'
 when p_action in ('create_work_order','release_work_order','close_work_order') then 'planning.manage'
 when p_action in ('issue_material','return_material','consume_material') then 'stock.issue'
 when p_action in ('start_job','complete_job','record_output') then 'production.execute' else null end;
 if v_permission is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'INVALID_REQUEST'; end if;
 v_id:=private.begin_material_command(p_company_id,v_permission,'production.'||p_action,p_idempotency_key,v_request);
 if v_id is not null then return v_id; end if;
 if p_action='create_package' then
  select * into v_item from public.items where id=(p_data->>'item_id')::uuid and company_id=p_company_id and active;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  v_qty:=private.factory_quantity(p_data,'basis_quantity');
  if jsonb_typeof(p_data->'components') is distinct from 'array' or jsonb_array_length(p_data->'components') not between 1 and 100
   or jsonb_typeof(p_data->'operations') is distinct from 'array' or jsonb_array_length(p_data->'operations') not between 1 and 50 then raise exception 'ENGINEERING_INCOMPLETE'; end if;
  insert into public.boms(company_id,output_item_id,name) values(p_company_id,v_item.id,v_item.sku||' BOM') on conflict(company_id,output_item_id) do update set output_item_id=excluded.output_item_id returning id into v_header;
  insert into public.bom_revisions(company_id,bom_id,revision,output_basis_quantity,output_basis_uom) values(p_company_id,v_header,trim(p_data->>'revision_label'),v_qty,v_item.base_uom) returning id into v_bom;
  for v_row in select value from jsonb_array_elements(p_data->'components') loop
   select base_uom into v_uom from public.items where id=(v_row->>'item_id')::uuid and company_id=p_company_id and active;
   if not found or v_uom is distinct from v_row->>'uom' then raise exception 'UOM_MISMATCH'; end if;
   if coalesce(v_row->>'scrap_allowance_pct','') !~ '^\d{1,3}(\.\d{1,4})?$' or (v_row->>'scrap_allowance_pct')::numeric>100 then raise exception 'INVALID_SCRAP_ALLOWANCE';end if;
   insert into public.bom_lines(company_id,bom_revision_id,component_item_id,quantity,uom,scrap_allowance_pct)
   values(p_company_id,v_bom,(v_row->>'item_id')::uuid,private.factory_quantity(v_row,'quantity'),v_uom,private.factory_quantity(v_row,'scrap_allowance_pct',true));
  end loop;
  insert into public.routings(company_id,output_item_id,name) values(p_company_id,v_item.id,v_item.sku||' route') on conflict(company_id,output_item_id) do update set output_item_id=excluded.output_item_id returning id into v_header;
  insert into public.routing_revisions(company_id,routing_id,revision) values(p_company_id,v_header,trim(p_data->>'revision_label')) returning id into v_route;
  for v_row in select value from jsonb_array_elements(p_data->'operations') loop
   if not exists(select 1 from public.work_centres where id=(v_row->>'work_centre_id')::uuid and company_id=p_company_id and active) then raise exception 'WORK_CENTRE_UNAVAILABLE'; end if;
   insert into public.routing_operations(company_id,routing_revision_id,sequence,work_centre_id,operation_name)
   values(p_company_id,v_route,(v_row->>'sequence')::integer,(v_row->>'work_centre_id')::uuid,trim(v_row->>'name'));
  end loop;
  insert into public.engineering_packages(company_id,item_id,label,bom_revision_id,routing_revision_id) values(p_company_id,v_item.id,trim(p_data->>'revision_label'),v_bom,v_route) returning id into v_id;
 elsif p_action='approve_package' then
  select * into v_pkg from public.engineering_packages where id=(p_data->>'package_id')::uuid and company_id=p_company_id for update;
  if not found or v_pkg.status<>'draft' then raise exception 'INVALID_TRANSITION'; end if;
  perform 1 from public.items where id=v_pkg.item_id or id in(select component_item_id from public.bom_lines where bom_revision_id=v_pkg.bom_revision_id) order by id for update;
  perform 1 from public.bom_revisions where id=v_pkg.bom_revision_id for update;
  perform 1 from public.routing_revisions where id=v_pkg.routing_revision_id for update;
  perform 1 from public.boms b join public.bom_revisions r on r.bom_id=b.id where r.id=v_pkg.bom_revision_id for update of b;
  perform 1 from public.routings r join public.routing_revisions v on v.routing_id=r.id where v.id=v_pkg.routing_revision_id for update of r;
  if not exists(select 1 from public.bom_revisions r join public.boms b on b.id=r.bom_id join public.items i on i.id=b.output_item_id where r.id=v_pkg.bom_revision_id and b.output_item_id=v_pkg.item_id and r.status='draft' and r.output_basis_quantity>0 and r.output_basis_quantity<>'NaN'::numeric and r.output_basis_uom=i.base_uom and i.active)
   or not exists(select 1 from public.routing_revisions v join public.routings r on r.id=v.routing_id where v.id=v_pkg.routing_revision_id and r.output_item_id=v_pkg.item_id and v.status='draft')
   or not exists(select 1 from public.bom_lines where bom_revision_id=v_pkg.bom_revision_id)
   or exists(select 1 from public.bom_lines l join public.items i on i.id=l.component_item_id where l.bom_revision_id=v_pkg.bom_revision_id and (not i.active or l.uom<>i.base_uom or l.quantity='NaN'::numeric or l.scrap_allowance_pct='NaN'::numeric))
   or not exists(select 1 from public.routing_operations where routing_revision_id=v_pkg.routing_revision_id)
   or exists(select 1 from public.routing_operations o join public.work_centres w on w.id=o.work_centre_id where o.routing_revision_id=v_pkg.routing_revision_id and not w.active) then raise exception 'ENGINEERING_INCOMPLETE'; end if;
  update public.bom_revisions set status='approved',approved_by=(select auth.uid()),approved_at=now() where id=v_pkg.bom_revision_id;
  update public.routing_revisions set status='approved',approved_by=(select auth.uid()),approved_at=now() where id=v_pkg.routing_revision_id;
  update public.engineering_packages set status='approved' where id=v_pkg.id; v_id:=v_pkg.id;
 elsif p_action='create_work_order' then
  perform 1 from public.sales_orders o join public.sales_order_lines l on l.sales_order_id=o.id where l.id=(p_data->>'sales_order_line_id')::uuid and l.company_id=p_company_id for update of o;
  select * into v_line from public.sales_order_lines where id=(p_data->>'sales_order_line_id')::uuid and company_id=p_company_id for update;
  if not found or not exists(select 1 from public.sales_orders where id=v_line.sales_order_id and status in ('open','partially_shipped')) then raise exception 'DEMAND_NOT_AVAILABLE'; end if;
  select * into v_pkg from public.engineering_packages where id=(p_data->>'package_id')::uuid and company_id=p_company_id and item_id=v_line.item_id and status='approved';
  if not found then raise exception 'ENGINEERING_REVISION_NOT_APPROVED'; end if;
  if (v_line.bom_revision_id is not null and v_line.bom_revision_id<>v_pkg.bom_revision_id) or (v_line.routing_revision_id is not null and v_line.routing_revision_id<>v_pkg.routing_revision_id) then raise exception 'ENGINEERING_PIN_MISMATCH'; end if;
  v_qty:=private.factory_quantity(p_data,'quantity');
  select planned_quantity into v_other from public.production_demand_commitments where sales_order_line_id=v_line.id;
  select v_other+coalesce(sum(case when r.status='active' then r.quantity else r.consumed_quantity end),0) into v_other from public.stock_reservations r where r.sales_order_line_id=v_line.id and not exists(select 1 from public.production_outputs o join public.work_orders w on w.id=o.work_order_id where o.lot_id=r.lot_id and w.sales_order_line_id=v_line.id);
  if v_other+v_qty > v_line.ordered_quantity then raise exception 'ORDER_QUANTITY_EXCEEDED'; end if;
  insert into public.work_orders(company_id,number,sales_order_line_id,item_id,quantity,uom,bom_revision_id,routing_revision_id,drawing_revision_id,start_date,due_date,created_by)
   values(p_company_id,upper(trim(p_data->>'number')),v_line.id,v_line.item_id,v_qty,v_line.uom,v_pkg.bom_revision_id,v_pkg.routing_revision_id,v_line.drawing_revision_id,(p_data->>'start_date')::date,(p_data->>'due_date')::date,(select auth.uid())) returning id into v_id;
  insert into public.work_order_requirements(company_id,work_order_id,item_id,required_quantity,uom)
   select p_company_id,v_id,l.component_item_id,ceil(l.quantity*v_qty/b.output_basis_quantity*(1+l.scrap_allowance_pct/100)*1000000)/1000000,l.uom
   from public.bom_lines l join public.bom_revisions b on b.id=l.bom_revision_id where l.bom_revision_id=v_pkg.bom_revision_id and b.output_basis_uom=v_line.uom;
  if not found then raise exception 'ENGINEERING_INCOMPLETE'; end if;
 elsif p_action in ('release_work_order','close_work_order') then
  select * into v_wo from public.work_orders where id=(p_data->>'work_order_id')::uuid and company_id=p_company_id for no key update;
  if not found then raise exception 'WORK_ORDER_NOT_FOUND'; end if;
  if v_wo.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
  if p_action='release_work_order' then
   if v_wo.status<>'draft' then raise exception 'INVALID_TRANSITION'; end if;
   if exists(select 1 from public.routing_operations o join public.work_centres w on w.id=o.work_centre_id where o.routing_revision_id=v_wo.routing_revision_id and not w.active) then raise exception 'WORK_CENTRE_UNAVAILABLE'; end if;
   if exists(select 1 from public.production_material_positions where work_order_id=v_wo.id and available_quantity < required_quantity) and v_wo.source_ncr_id is null then raise exception 'MATERIAL_SHORTAGE'; end if;
   insert into public.job_cards(company_id,work_order_id,sequence,name,work_centre_id,planned_quantity,uom)
    select p_company_id,v_wo.id,sequence,operation_name,work_centre_id,v_wo.quantity,v_wo.uom from public.routing_operations where routing_revision_id=v_wo.routing_revision_id;
   if not found then raise exception 'ENGINEERING_INCOMPLETE'; end if;
   update public.work_orders set status='released',revision=revision+1 where id=v_wo.id;
  else
   if v_wo.status not in ('released','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
   perform 1 from public.stock_lots l join public.lot_trace_context t on t.lot_id=l.id where v_wo.id=any(t.work_order_ids) order by l.id for update of l;
   if not exists(select 1 from public.job_cards where work_order_id=v_wo.id) or exists(select 1 from public.job_cards where work_order_id=v_wo.id and status<>'completed') then raise exception 'OPERATIONS_PENDING'; end if;
   if exists(select 1 from public.production_material_positions where work_order_id=v_wo.id and (consumed_quantity < required_quantity or wip_quantity<>0)) then raise exception 'MATERIAL_UNACCOUNTED'; end if;
   select coalesce(sum(quantity),0) into v_qty from public.production_outputs where work_order_id=v_wo.id;
   select coalesce(sum(scrap_quantity),0) into v_other from public.job_cards where work_order_id=v_wo.id;
   if v_qty+v_other<>v_wo.quantity then raise exception 'OUTPUT_UNACCOUNTED'; end if;
   if exists(select 1 from public.lot_trace_context t join public.stock_lots l on l.id=t.lot_id where v_wo.id=any(t.work_order_ids) and l.qc_status<>'released' and not (exists(select 1 from public.ncrs n where n.lot_id=l.id and n.status='resolved' and n.disposition in ('scrap','rework')) and coalesce((select sum(quantity_delta) from public.stock_ledger_entries where lot_id=l.id),0)=0)) then raise exception 'QUALITY_PENDING'; end if;
   update public.work_orders set status='closed',revision=revision+1 where id=v_wo.id;
   if v_wo.source_ncr_id is not null then update public.ncrs set status='resolved',revision=revision+1 where id=v_wo.source_ncr_id and status='awaiting_rework'; end if;
  end if; v_id:=v_wo.id;
 elsif p_action in ('start_job','complete_job') then
  select w.* into v_wo from public.work_orders w join public.job_cards j on j.work_order_id=w.id where j.id=(p_data->>'job_card_id')::uuid and w.company_id=p_company_id for no key update of w;
  select * into v_job from public.job_cards where id=(p_data->>'job_card_id')::uuid and company_id=p_company_id for update;
  if not found or v_wo.status not in ('released','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
  if v_job.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
  if exists(select 1 from public.job_cards where work_order_id=v_wo.id and sequence<v_job.sequence and status<>'completed') then raise exception 'PREDECESSOR_PENDING'; end if;
  if p_action='start_job' then
   if v_job.status<>'pending' then raise exception 'INVALID_TRANSITION'; end if;
   if not exists(select 1 from public.work_centres where id=v_job.work_centre_id and company_id=p_company_id and active) then raise exception 'WORK_CENTRE_UNAVAILABLE'; end if;
   select good_quantity into v_qty from public.job_cards where work_order_id=v_wo.id and sequence<v_job.sequence order by sequence desc limit 1;
   if v_qty=0 and not exists(select 1 from public.job_cards where work_order_id=v_wo.id and sequence>v_job.sequence)
    and exists(select 1 from public.production_material_positions where work_order_id=v_wo.id and consumed_quantity<required_quantity) then raise exception 'MATERIAL_UNACCOUNTED'; end if;
   update public.job_cards set planned_quantity=coalesce(v_qty,v_wo.quantity),status=case when v_qty=0 then 'completed' else 'in_progress' end,
    started_at=now(),completed_at=case when v_qty=0 then now() else null end,revision=revision+1 where id=v_job.id;
  else
   if v_job.status<>'in_progress' then raise exception 'INVALID_TRANSITION'; end if;
   if not exists(select 1 from public.job_cards where work_order_id=v_wo.id and sequence>v_job.sequence)
    and exists(select 1 from public.production_material_positions where work_order_id=v_wo.id and consumed_quantity<required_quantity) then raise exception 'MATERIAL_UNACCOUNTED'; end if;
   v_good:=private.factory_quantity(p_data,'good_quantity',true); v_scrap:=private.factory_quantity(p_data,'scrap_quantity',true);
   if v_good+v_scrap<=0 or v_job.good_quantity+v_job.scrap_quantity+v_good+v_scrap>v_job.planned_quantity then raise exception 'OPERATION_QUANTITY_EXCEEDED'; end if;
   if char_length(trim(coalesce(p_data->>'reason',''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
   if (select result from public.inspections where job_card_id=v_job.id order by recorded_sequence desc limit 1)='failed' then raise exception 'QUALITY_PENDING'; end if;
   update public.job_cards set good_quantity=good_quantity+v_good,scrap_quantity=scrap_quantity+v_scrap,
    status=case when good_quantity+scrap_quantity+v_good+v_scrap=planned_quantity then 'completed' else 'in_progress' end,
    completed_at=case when good_quantity+scrap_quantity+v_good+v_scrap=planned_quantity then now() else null end,revision=revision+1 where id=v_job.id;
  end if;
  update public.work_orders set status='in_progress',revision=revision+1 where id=v_wo.id; v_id:=v_job.id;
 elsif p_action='issue_material' then
  select * into v_wo from public.work_orders where id=(p_data->>'work_order_id')::uuid and company_id=p_company_id for no key update;
  if not found or v_wo.status not in ('released','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
  if not exists(select 1 from public.job_cards where id=(p_data->>'job_card_id')::uuid and work_order_id=v_wo.id and company_id=p_company_id and status<>'completed') then raise exception 'JOB_CARD_NOT_FOUND'; end if;
  select * into v_lot from public.stock_lots where id=(p_data->>'lot_id')::uuid and company_id=p_company_id for update;
  if not found then raise exception 'LOT_NOT_FOUND'; end if;
  if v_lot.revision is distinct from (p_data->>'lot_revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
  if v_lot.qc_status<>'released' and not exists(select 1 from public.ncrs where id=v_wo.source_ncr_id and lot_id=v_lot.id and status='awaiting_rework') then raise exception 'LOT_QC_HOLD'; end if;
  select uom,required_quantity into v_uom,v_other from public.work_order_requirements where work_order_id=v_wo.id and item_id=v_lot.item_id;
  if not found or v_uom is distinct from p_data->>'uom' then raise exception 'UOM_MISMATCH'; end if;
  v_qty:=private.factory_quantity(p_data,'quantity');
  if (select coalesce(sum(quantity_delta),0) from public.stock_ledger_entries where lot_id=v_lot.id)-(select coalesce(sum(quantity-consumed_quantity),0) from public.stock_reservations where lot_id=v_lot.id and status='active') < v_qty then raise exception 'INSUFFICIENT_AVAILABLE_STOCK'; end if;
  if v_qty+(select coalesce(sum(i.quantity-coalesce((select sum(e.quantity) from public.material_events e where e.issue_id=i.id and kind='return'),0)),0) from public.material_issues i where work_order_id=v_wo.id and item_id=v_lot.item_id)>v_other then raise exception 'MATERIAL_REQUIREMENT_EXCEEDED'; end if;
  insert into public.material_issues(company_id,work_order_id,job_card_id,lot_id,item_id,quantity,uom) values(p_company_id,v_wo.id,(p_data->>'job_card_id')::uuid,v_lot.id,v_lot.item_id,v_qty,v_uom) returning id into v_id;
  insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by)
   values(p_company_id,v_lot.id,v_lot.item_id,v_lot.location_id,'issue',-v_qty,v_uom,'material_issue',v_id,p_idempotency_key,(select auth.uid()));
  update public.stock_lots set revision=revision+1,updated_at=now() where id=v_lot.id;
 elsif p_action in ('return_material','consume_material') then
  select w.* into v_wo from public.work_orders w join public.material_issues i on i.work_order_id=w.id where i.id=(p_data->>'issue_id')::uuid and w.company_id=p_company_id for no key update of w;
  select * into v_issue from public.material_issues where id=(p_data->>'issue_id')::uuid and company_id=p_company_id for update;
  if not found or v_wo.status not in ('released','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
  v_qty:=private.factory_quantity(p_data,'quantity');
  if v_qty > v_issue.quantity-coalesce((select sum(quantity) from public.material_events where issue_id=v_issue.id),0) then raise exception 'ISSUE_QUANTITY_EXCEEDED'; end if;
  insert into public.material_events(company_id,issue_id,kind,quantity,reason) values(p_company_id,v_issue.id,case when p_action='return_material' then 'return' else 'consume' end,v_qty,trim(p_data->>'reason')) returning id into v_id;
  if p_action='return_material' then
   select * into v_lot from public.stock_lots where id=v_issue.lot_id and company_id=p_company_id for update;
   if v_lot.revision is distinct from (p_data->>'lot_revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
   insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by,reason)
    values(p_company_id,v_lot.id,v_lot.item_id,v_lot.location_id,'reversal',v_qty,v_issue.uom,'material_return',v_id,p_idempotency_key,(select auth.uid()),trim(p_data->>'reason'));
   -- Unused return re-enters QC hold so changed custody never silently inherits old inspection approval.
   update public.stock_lots set qc_status='hold',revision=revision+1,updated_at=now() where id=v_lot.id;
  end if;
 elsif p_action='record_output' then
  select * into v_wo from public.work_orders where id=(p_data->>'work_order_id')::uuid and company_id=p_company_id for no key update;
  if not found or v_wo.status not in ('released','in_progress') then raise exception 'INVALID_TRANSITION'; end if;
  v_qty:=private.factory_quantity(p_data,'quantity');
  if v_wo.uom is distinct from p_data->>'uom' then raise exception 'UOM_MISMATCH'; end if;
  if exists(select 1 from public.job_cards where work_order_id=v_wo.id and status<>'completed') then raise exception 'OPERATIONS_PENDING'; end if;
  if exists(select 1 from public.production_material_positions where work_order_id=v_wo.id and consumed_quantity<required_quantity) then raise exception 'MATERIAL_UNACCOUNTED'; end if;
  select good_quantity into v_other from public.job_cards where work_order_id=v_wo.id order by sequence desc limit 1;
  if v_other is null or v_qty+coalesce((select sum(quantity) from public.production_outputs where work_order_id=v_wo.id),0)>v_other then raise exception 'OUTPUT_QUANTITY_EXCEEDED'; end if;
  insert into public.stock_lots(company_id,item_id,location_id,lot_code,qc_status) values(p_company_id,v_wo.item_id,(p_data->>'location_id')::uuid,upper(trim(p_data->>'lot_code')),'hold') returning * into v_lot;
  insert into public.production_outputs(company_id,work_order_id,lot_id,quantity,uom) values(p_company_id,v_wo.id,v_lot.id,v_qty,v_wo.uom) returning id into v_id;
  insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by)
   values(p_company_id,v_lot.id,v_lot.item_id,v_lot.location_id,'production_receipt',v_qty,v_wo.uom,'production_output',v_id,p_idempotency_key,(select auth.uid()));
  insert into public.lot_genealogy(company_id,parent_lot_id,child_lot_id,work_order_id,source_issue_id)
   select p_company_id,i.lot_id,v_lot.id,v_wo.id,i.id from public.material_issues i where i.work_order_id=v_wo.id and exists(select 1 from public.material_events e where e.issue_id=i.id and kind='consume');
 end if;
 return private.finish_material_command(p_company_id,'production.'||p_action,p_idempotency_key,v_request,v_id,case when p_action in ('start_job','complete_job') then 'job_card' when p_action like '%material' then 'material_event' when p_action='record_output' then 'production_output' when p_action like '%package' then 'engineering_package' else 'work_order' end,p_data->>'reason');
end $$;
