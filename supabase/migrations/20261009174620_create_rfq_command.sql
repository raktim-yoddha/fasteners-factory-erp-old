-- TASK-0005: RFQs are created only through this tenant-scoped, idempotent command.
create function public.create_rfq(
  p_company_id uuid,
  p_rfq_number text,
  p_customer_id uuid,
  p_requirement_summary text,
  p_lines jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rfq_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;
  if not (select private.has_company_permission(p_company_id, 'sales.manage')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_rfq_number is null or char_length(trim(p_rfq_number)) = 0
    or p_requirement_summary is null or char_length(trim(p_requirement_summary)) = 0
    or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0
    or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'INVALID_RFQ_REQUEST' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_rfq_id
  from public.command_idempotency
  where company_id = p_company_id and command_name = 'create_rfq' and idempotency_key = p_idempotency_key;
  if found then
    return v_rfq_id;
  end if;

  if not exists (
    select 1 from public.customers
    where id = p_customer_id and company_id = p_company_id and active
  ) then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as line(item_id uuid, requested_description text, quantity numeric, uom text, required_by date)
    where line.requested_description is null or char_length(trim(line.requested_description)) = 0
      or line.quantity is null or line.quantity <= 0
      or line.uom not in ('pcs', 'kg', 'm', 'set')
  ) then
    raise exception 'INVALID_RFQ_LINE' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as line(item_id uuid, requested_description text, quantity numeric, uom text, required_by date)
    left join public.items item on item.id = line.item_id and item.company_id = p_company_id and item.active
    where line.item_id is not null and item.id is null
  ) then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.rfqs (company_id, rfq_number, customer_id, requirement_summary, created_by)
  values (p_company_id, upper(trim(p_rfq_number)), p_customer_id, trim(p_requirement_summary), (select auth.uid()))
  returning id into v_rfq_id;
  insert into public.rfq_lines (company_id, rfq_id, item_id, requested_description, quantity, uom, required_by)
  select
    p_company_id, v_rfq_id, line.item_id, trim(line.requested_description), line.quantity, line.uom, line.required_by
  from jsonb_to_recordset(p_lines) as line(item_id uuid, requested_description text, quantity numeric, uom text, required_by date);
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'create_rfq', p_idempotency_key, v_rfq_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key, metadata)
  values (
    p_company_id, (select auth.uid()), 'rfq', v_rfq_id, 'rfq.created', p_idempotency_key,
    jsonb_build_object('line_count', jsonb_array_length(p_lines))
  );
  return v_rfq_id;
end;
$$;

revoke all on function public.create_rfq(uuid, text, uuid, text, jsonb, text) from public;
grant execute on function public.create_rfq(uuid, text, uuid, text, jsonb, text) to authenticated;
