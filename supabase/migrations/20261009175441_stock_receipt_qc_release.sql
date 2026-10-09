-- TASK-0006: new finished goods enter QC hold and need a separate quality release.
alter table public.stock_lots add column revision integer not null default 1 check (revision > 0);
alter table public.stock_lots add column updated_at timestamptz not null default now();

create function public.receive_finished_goods(
  p_company_id uuid,
  p_item_id uuid,
  p_location_id uuid,
  p_lot_code text,
  p_quantity numeric,
  p_uom text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_id uuid;
  v_lot_item_id uuid;
  v_lot_location_id uuid;
  v_lot_qc_status text;
  v_base_uom text;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0001'; end if;
  if not (select private.has_company_permission(p_company_id, 'stock.receive')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_quantity is null or p_quantity <= 0 or p_lot_code is null or char_length(trim(p_lot_code)) = 0
    or p_uom not in ('pcs', 'kg', 'm', 'set') or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_RECEIPT_REQUEST' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_lot_id from public.command_idempotency
  where company_id = p_company_id and command_name = 'receive_finished_goods' and idempotency_key = p_idempotency_key;
  if found then return v_lot_id; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':lot:' || upper(trim(p_lot_code)), 0));

  select base_uom into v_base_uom from public.items
  where id = p_item_id and company_id = p_company_id and active;
  if not found then raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_base_uom <> p_uom then raise exception 'UOM_MISMATCH' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.stock_locations where id = p_location_id and company_id = p_company_id and active) then
    raise exception 'STOCK_LOCATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  select id, item_id, location_id, qc_status into v_lot_id, v_lot_item_id, v_lot_location_id, v_lot_qc_status
  from public.stock_lots where company_id = p_company_id and lot_code = upper(trim(p_lot_code)) for update;
  if not found then
    insert into public.stock_lots (company_id, item_id, location_id, lot_code, qc_status)
    values (p_company_id, p_item_id, p_location_id, upper(trim(p_lot_code)), 'hold') returning id into v_lot_id;
  elsif v_lot_item_id <> p_item_id or v_lot_location_id <> p_location_id then
    raise exception 'LOT_SCOPE_MISMATCH' using errcode = 'P0001';
  elsif v_lot_qc_status = 'rejected' then
    raise exception 'LOT_QC_HOLD' using errcode = 'P0001';
  end if;
  insert into public.stock_ledger_entries (
    company_id, lot_id, item_id, location_id, movement_type, quantity_delta, uom, source_type, source_id, idempotency_key, created_by
  ) values (
    p_company_id, v_lot_id, p_item_id, p_location_id, 'production_receipt', p_quantity, p_uom,
    'finished_goods_receipt', v_lot_id, p_idempotency_key, (select auth.uid())
  );
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'receive_finished_goods', p_idempotency_key, v_lot_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key, metadata)
  values (p_company_id, (select auth.uid()), 'stock_lot', v_lot_id, 'stock.received', p_idempotency_key,
    jsonb_build_object('quantity', p_quantity, 'uom', p_uom, 'qc_status', 'hold'));
  return v_lot_id;
end;
$$;

create function public.release_stock_lot(
  p_company_id uuid,
  p_lot_id uuid,
  p_expected_revision integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qc_status text;
  v_revision integer;
  v_result_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0001'; end if;
  if not (select private.has_company_permission(p_company_id, 'quality.release')) then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if p_expected_revision is null or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_QC_RELEASE_REQUEST' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_result_id from public.command_idempotency
  where company_id = p_company_id and command_name = 'release_stock_lot' and idempotency_key = p_idempotency_key;
  if found then return v_result_id; end if;
  select qc_status, revision into v_qc_status, v_revision from public.stock_lots
  where id = p_lot_id and company_id = p_company_id for update;
  if not found then raise exception 'LOT_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_qc_status <> 'hold' then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  if v_revision <> p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode = 'P0001'; end if;
  update public.stock_lots set qc_status = 'released', revision = revision + 1, updated_at = now()
  where id = p_lot_id and company_id = p_company_id;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'release_stock_lot', p_idempotency_key, p_lot_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key)
  values (p_company_id, (select auth.uid()), 'stock_lot', p_lot_id, 'stock.qc_released', p_idempotency_key);
  return p_lot_id;
end;
$$;

revoke all on function public.receive_finished_goods(uuid, uuid, uuid, text, numeric, text, text) from public;
revoke all on function public.release_stock_lot(uuid, uuid, integer, text) from public;
grant execute on function public.receive_finished_goods(uuid, uuid, uuid, text, numeric, text, text) to authenticated;
grant execute on function public.release_stock_lot(uuid, uuid, integer, text) to authenticated;

insert into public.permission_definitions (code, description) values
  ('stock.receive', 'Record finished-goods receipt into a QC-hold lot.'),
  ('quality.release', 'Release a held stock lot for reservation.')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code) values
  ('admin', 'stock.receive'), ('admin', 'quality.release'),
  ('stores', 'stock.receive'), ('quality', 'quality.release')
on conflict do nothing;
