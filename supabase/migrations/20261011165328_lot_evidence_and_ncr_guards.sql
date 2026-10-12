-- Evidence paths are immutable, including pending bytes; retries resume the same file.
-- No client delete permission avoids a delete/confirmation race.
drop policy factory_evidence_pending_delete on storage.objects;

create or replace function public.confirm_lot_document(p_company_id uuid,p_document_id uuid,p_idempotency_key text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_doc public.lot_documents%rowtype;v_object storage.objects%rowtype;v_request jsonb:=jsonb_build_array(p_document_id);
begin
 v_id:=private.begin_material_command(p_company_id,'documents.manage','confirm_lot_document',p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 select * into v_doc from public.lot_documents where id=p_document_id and company_id=p_company_id for update;
 if not found then raise exception 'DOCUMENT_NOT_FOUND';end if;
 if v_doc.status<>'ready' then
  select * into v_object from storage.objects where bucket_id='factory-evidence' and name=v_doc.object_path for update;
  if not found then raise exception 'DOCUMENT_UPLOAD_INCOMPLETE';end if;
  if coalesce(v_object.metadata->>'size','')!~'^\d+$' or (v_object.metadata->>'size')::numeric<>v_doc.byte_size or v_object.metadata->>'mimetype' is distinct from v_doc.mime_type or v_object.owner_id is distinct from v_doc.created_by::text or v_object.user_metadata->>'sha256' is distinct from v_doc.sha256 then raise exception 'DOCUMENT_FILE_MISMATCH';end if;
  update public.lot_documents set status='ready',confirmed_at=now() where id=v_doc.id;
 end if;
 return private.finish_material_command(p_company_id,'confirm_lot_document',p_idempotency_key,v_request,v_doc.id,'lot_document');
end $$;

create or replace function public.quality_command(p_company_id uuid,p_action text,p_data jsonb,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_permission text; v_id uuid; v_request jsonb:=jsonb_build_array(p_action,p_data); v_plan public.inspection_plans%rowtype;
 v_lot public.stock_lots%rowtype; v_job public.job_cards%rowtype; v_ncr public.ncrs%rowtype; v_wo public.work_orders%rowtype;
 v_context public.lot_trace_context%rowtype; v_pkg public.engineering_packages%rowtype; v_receipt public.goods_receipts%rowtype;
 v_row jsonb; v_reading jsonb; v_value jsonb; v_keys text[]:=array[]::text[]; v_key text; v_pass boolean:=true;
 v_min numeric; v_max numeric; v_num numeric; v_qty numeric; v_balance numeric; v_reserved numeric; v_uom text; v_item uuid; v_parent uuid;
begin
 v_permission:=case when p_action in ('create_plan','approve_plan') then 'quality.manage' when p_action='inspect' then 'quality.inspect'
 when p_action in ('create_ncr','resolve_ncr') then 'quality.review' else null end;
 if v_permission is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'INVALID_REQUEST'; end if;
 v_id:=private.begin_material_command(p_company_id,v_permission,'quality.'||p_action,p_idempotency_key,v_request); if v_id is not null then return v_id; end if;
 if p_action='create_plan' then
  if not exists(select 1 from public.items where id=(p_data->>'item_id')::uuid and company_id=p_company_id and active) then raise exception 'ITEM_NOT_FOUND'; end if;
  if jsonb_typeof(p_data->'characteristics') is distinct from 'array' or jsonb_array_length(p_data->'characteristics') not between 1 and 50 then raise exception 'INSPECTION_PLAN_INVALID'; end if;
  for v_row in select value from jsonb_array_elements(p_data->'characteristics') loop
   v_key:=v_row->>'key';
   if v_key is null or v_key !~ '^[a-zA-Z0-9_-]{1,40}$' or v_key=any(v_keys) or char_length(trim(coalesce(v_row->>'label',''))) not between 1 and 160 then raise exception 'INSPECTION_PLAN_INVALID'; end if;
   v_keys:=array_append(v_keys,v_key);
   if v_row->>'type'='numeric' then
    if (v_row->>'min') is null or (v_row->>'max') is null or (v_row->>'min') !~ '^-?\d{1,12}(\.\d{1,6})?$' or (v_row->>'max') !~ '^-?\d{1,12}(\.\d{1,6})?$'
     or char_length(trim(coalesce(v_row->>'uom',''))) not between 1 and 32 then raise exception 'INSPECTION_PLAN_INVALID'; end if;
    if (v_row->>'min')::numeric > (v_row->>'max')::numeric then raise exception 'INSPECTION_PLAN_INVALID'; end if;
   elsif v_row->>'type'='attribute' then
    if char_length(trim(coalesce(v_row->>'expected',''))) not between 1 and 160 then raise exception 'INSPECTION_PLAN_INVALID'; end if;
   else raise exception 'INSPECTION_PLAN_INVALID'; end if;
  end loop;
  insert into public.inspection_plans(company_id,item_id,label,version,sample_size,characteristics,created_by)
   values(p_company_id,(p_data->>'item_id')::uuid,trim(p_data->>'label'),trim(p_data->>'version'),(p_data->>'sample_size')::integer,p_data->'characteristics',(select auth.uid())) returning id into v_id;
 elsif p_action='approve_plan' then
  select * into v_plan from public.inspection_plans where id=(p_data->>'plan_id')::uuid and company_id=p_company_id for update;
  if not found or v_plan.status<>'draft' then raise exception 'INVALID_TRANSITION'; end if;
  update public.inspection_plans set status='approved',approved_by=(select auth.uid()),approved_at=now() where id=v_plan.id; v_id:=v_plan.id;
 elsif p_action='inspect' then
  select * into v_plan from public.inspection_plans where id=(p_data->>'plan_id')::uuid and company_id=p_company_id and status='approved';
  if not found then raise exception 'INSPECTION_PLAN_NOT_APPROVED'; end if;
  if (p_data->>'lot_id') is not null then
   select * into v_lot from public.stock_lots where id=(p_data->>'lot_id')::uuid and company_id=p_company_id for update;
   if not found then raise exception 'LOT_NOT_FOUND'; end if;
   if v_lot.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
   v_item:=v_lot.item_id;
   if p_data->>'kind' not in ('incoming','final') or v_lot.qc_status='released' then raise exception 'INVALID_TRANSITION'; end if;
   if (p_data->>'kind'='final') <> coalesce((select requires_final from public.lot_trace_context where lot_id=v_lot.id),false) then raise exception 'INSPECTION_CONTEXT_MISMATCH'; end if;
  else
   select w.* into v_wo from public.work_orders w join public.job_cards j on j.work_order_id=w.id where j.id=(p_data->>'job_card_id')::uuid and w.company_id=p_company_id for no key update of w;
   select * into v_job from public.job_cards where id=(p_data->>'job_card_id')::uuid and company_id=p_company_id for update;
   if not found or v_job.status<>'in_progress' or p_data->>'kind'<>'in_process' then raise exception 'INVALID_TRANSITION'; end if;
   if v_job.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if; v_item:=v_wo.item_id;
  end if;
  if v_plan.item_id<>v_item then raise exception 'INSPECTION_CONTEXT_MISMATCH'; end if;
  if (p_data->>'supersedes_id') is not null and not exists(select 1 from public.inspections where id=(p_data->>'supersedes_id')::uuid and company_id=p_company_id and lot_id is not distinct from v_lot.id and job_card_id is not distinct from v_job.id) then raise exception 'INSPECTION_CONTEXT_MISMATCH'; end if;
  if jsonb_typeof(p_data->'readings') is distinct from 'array' or jsonb_array_length(p_data->'readings')<>jsonb_array_length(v_plan.characteristics) then raise exception 'MEASUREMENTS_REQUIRED'; end if;
  for v_row in select value from jsonb_array_elements(v_plan.characteristics) loop
   if (select count(*) from jsonb_array_elements(p_data->'readings') r where r->>'key'=v_row->>'key')<>1 then raise exception 'MEASUREMENTS_REQUIRED'; end if;
   select r into v_reading from jsonb_array_elements(p_data->'readings') r where r->>'key'=v_row->>'key';
   if jsonb_typeof(v_reading->'values') is distinct from 'array' or jsonb_array_length(v_reading->'values')<>v_plan.sample_size then raise exception 'SAMPLE_COUNT_MISMATCH'; end if;
   if v_row->>'type'='numeric' and (v_reading->>'uom') is distinct from v_row->>'uom' then raise exception 'UOM_MISMATCH'; end if;
   for v_value in select value from jsonb_array_elements(v_reading->'values') loop
    v_key:=v_value#>>'{}';
    if v_row->>'type'='numeric' then
     if v_key is null or v_key !~ '^-?\d{1,12}(\.\d{1,6})?$' then raise exception 'INVALID_MEASUREMENT'; end if;
     v_num:=v_key::numeric; v_min:=(v_row->>'min')::numeric; v_max:=(v_row->>'max')::numeric;
     if v_num<v_min or v_num>v_max then v_pass:=false; end if;
    else
     if char_length(trim(coalesce(v_key,''))) not between 1 and 160 then raise exception 'MEASUREMENTS_REQUIRED'; end if;
     if lower(trim(v_key))<>lower(trim(v_row->>'expected')) then v_pass:=false; end if;
    end if;
   end loop;
  end loop;
  insert into public.inspections(company_id,plan_id,lot_id,job_card_id,lot_revision,job_revision,kind,readings,result,reason,inspector_id,supersedes_id)
   values(p_company_id,v_plan.id,v_lot.id,v_job.id,v_lot.revision,v_job.revision,p_data->>'kind',p_data->'readings',case when v_pass then 'passed' else 'failed' end,trim(p_data->>'reason'),(select auth.uid()),(p_data->>'supersedes_id')::uuid) returning id into v_id;
 elsif p_action='create_ncr' then
  select * into v_lot from public.stock_lots where id=(p_data->>'lot_id')::uuid and company_id=p_company_id for update;
  if not found then raise exception 'LOT_NOT_FOUND'; end if;
  if v_lot.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
  v_qty:=private.factory_quantity(p_data,'quantity');
  select coalesce(sum(quantity_delta),0) into v_balance from public.stock_ledger_entries where lot_id=v_lot.id;
  if v_qty>v_balance then raise exception 'INSUFFICIENT_ON_HAND_STOCK'; end if;
  if exists(select 1 from public.ncrs where lot_id=v_lot.id and status<>'resolved') then raise exception 'NCR_ALREADY_OPEN'; end if;
  select base_uom into v_uom from public.items where id=v_lot.item_id;
  insert into public.ncrs(company_id,lot_id,inspection_id,quantity,uom,reason) values(p_company_id,v_lot.id,(select id from public.inspections where lot_id=v_lot.id order by recorded_sequence desc limit 1),v_qty,v_uom,trim(p_data->>'reason')) returning id into v_id;
  update public.stock_lots set qc_status='hold',revision=revision+1,updated_at=now() where id=v_lot.id;
 elsif p_action='resolve_ncr' then
  select * into v_ncr from public.ncrs where id=(p_data->>'ncr_id')::uuid and company_id=p_company_id;
  if not found then raise exception 'NCR_NOT_FOUND'; end if;
  perform 1 from public.work_orders w where w.id in(select unnest(work_order_ids) from public.lot_trace_context where lot_id=v_ncr.lot_id) order by w.id for no key update of w;
  select * into v_lot from public.stock_lots where id=v_ncr.lot_id and company_id=p_company_id for update;
  select * into v_ncr from public.ncrs where id=(p_data->>'ncr_id')::uuid and company_id=p_company_id for update;
  if not found or v_ncr.status<>'open' then raise exception 'INVALID_TRANSITION'; end if;
  if v_ncr.revision is distinct from (p_data->>'revision')::integer then raise exception 'REVISION_CONFLICT'; end if;
  if char_length(trim(coalesce(p_data->>'reason',''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
  if p_data->>'disposition'='scrap' then
   select coalesce(sum(quantity_delta),0) into v_balance from public.stock_ledger_entries where lot_id=v_lot.id;
   select coalesce(sum(quantity-consumed_quantity),0) into v_reserved from public.stock_reservations where lot_id=v_lot.id and status='active';
   if v_ncr.quantity>v_balance-v_reserved then raise exception 'INSUFFICIENT_AVAILABLE_STOCK'; end if;
   insert into public.stock_ledger_entries(company_id,lot_id,item_id,location_id,movement_type,quantity_delta,uom,source_type,source_id,idempotency_key,created_by,reason)
    values(p_company_id,v_lot.id,v_lot.item_id,v_lot.location_id,'issue',-v_ncr.quantity,v_ncr.uom,'ncr_scrap',v_ncr.id,p_idempotency_key,(select auth.uid()),trim(p_data->>'reason'));
   update public.stock_lots set qc_status=case when v_balance=v_ncr.quantity then 'rejected' else 'hold' end,revision=revision+1,updated_at=now() where id=v_lot.id;
  elsif p_data->>'disposition'='supplier_return' then
   if not exists(select 1 from public.goods_receipts where lot_id=v_lot.id) then raise exception 'RECEIPT_NOT_FOUND'; end if;
  elsif p_data->>'disposition'='rework' then
   select * into v_pkg from public.engineering_packages where id=(p_data->>'package_id')::uuid and company_id=p_company_id and item_id=v_lot.item_id and status='approved';
   if not found or not exists(select 1 from public.bom_lines where bom_revision_id=v_pkg.bom_revision_id and component_item_id=v_lot.item_id) then raise exception 'REWORK_PACKAGE_REQUIRED'; end if;
   select * into v_context from public.lot_trace_context where lot_id=v_lot.id;
   select * into v_wo from public.work_orders where id=case when cardinality(v_context.work_order_ids)=1 then v_context.work_order_ids[1] end;
   insert into public.work_orders(company_id,number,sales_order_line_id,item_id,quantity,uom,bom_revision_id,routing_revision_id,drawing_revision_id,start_date,due_date,created_by,parent_work_order_id,source_ncr_id)
    values(p_company_id,upper(trim(p_data->>'number')),v_context.sales_order_line_id,v_lot.item_id,v_ncr.quantity,v_ncr.uom,v_pkg.bom_revision_id,v_pkg.routing_revision_id,v_context.drawing_revision_id,(p_data->>'start_date')::date,(p_data->>'due_date')::date,(select auth.uid()),v_wo.id,v_ncr.id) returning id into v_parent;
   insert into public.work_order_requirements(company_id,work_order_id,item_id,required_quantity,uom)
    select p_company_id,v_parent,l.component_item_id,ceil(l.quantity*v_ncr.quantity/b.output_basis_quantity*(1+l.scrap_allowance_pct/100)*1000000)/1000000,l.uom from public.bom_lines l join public.bom_revisions b on b.id=l.bom_revision_id where l.bom_revision_id=v_pkg.bom_revision_id;
   if not exists(select 1 from public.work_order_requirements where work_order_id=v_parent and item_id=v_lot.item_id and required_quantity=v_ncr.quantity) then raise exception 'REWORK_PACKAGE_REQUIRED'; end if;
  elsif p_data->>'disposition'='reinspect' then
   update public.stock_lots set qc_status='hold',revision=revision+1,updated_at=now() where id=v_lot.id;
  else raise exception 'INVALID_TRANSITION'; end if;
  update public.ncrs set disposition=p_data->>'disposition',review_reason=trim(p_data->>'reason'),reviewed_by=(select auth.uid()),
   status=case p_data->>'disposition' when 'supplier_return' then 'awaiting_return' when 'rework' then 'awaiting_rework' else 'resolved' end,revision=revision+1 where id=v_ncr.id; v_id:=v_ncr.id;
 end if;
 return private.finish_material_command(p_company_id,'quality.'||p_action,p_idempotency_key,v_request,v_id,
  case when p_action like '%plan' then 'inspection_plan' when p_action='inspect' then 'inspection' else 'ncr' end,p_data->>'reason');
end $$;
