-- ADR 0016: feasibility blockers and bounded command ingress.
create or replace function public.record_feasibility(
  p_company_id uuid,
  p_rfq_id uuid,
  p_status text,
  p_drawing_revision_id uuid,
  p_bom_revision_id uuid,
  p_routing_revision_id uuid,
  p_conditions text,
  p_expected_rfq_revision integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feasibility_id uuid;
  v_rfq_status text;
  v_rfq_revision integer;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0001'; end if;
  if not (select private.has_company_permission(p_company_id, 'engineering.feasibility.manage')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_expected_rfq_revision is null or p_status is null or p_status not in ('feasible', 'conditional', 'not_feasible', 'info_required')
    or p_idempotency_key is null or char_length(trim(p_idempotency_key)) = 0 then
    raise exception 'INVALID_FEASIBILITY_REQUEST' using errcode = 'P0001';
  end if;
  if p_status <> 'feasible' and (p_conditions is null or char_length(trim(p_conditions)) = 0) then raise exception 'REASON_REQUIRED'; end if;
  if char_length(p_conditions) > 2000 then raise exception 'INVALID_FEASIBILITY_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key, 0));
  select result_id into v_feasibility_id from public.command_idempotency
  where company_id = p_company_id and command_name = 'record_feasibility' and idempotency_key = p_idempotency_key;
  if found then return v_feasibility_id; end if;

  select status, revision into v_rfq_status, v_rfq_revision from public.rfqs
  where id = p_rfq_id and company_id = p_company_id for update;
  if not found then raise exception 'RFQ_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_rfq_status not in ('new', 'awaiting_info', 'review_required') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if v_rfq_revision <> p_expected_rfq_revision then raise exception 'REVISION_CONFLICT' using errcode = 'P0001'; end if;
  if p_drawing_revision_id is not null and not exists (
    select 1 from public.drawing_revisions where id = p_drawing_revision_id and company_id = p_company_id and status = 'approved'
  ) then raise exception 'ENGINEERING_REVISION_NOT_APPROVED' using errcode = 'P0001'; end if;
  if p_bom_revision_id is not null and not exists (
    select 1 from public.bom_revisions where id = p_bom_revision_id and company_id = p_company_id and status = 'approved'
  ) then raise exception 'ENGINEERING_REVISION_NOT_APPROVED' using errcode = 'P0001'; end if;
  if p_routing_revision_id is not null and not exists (
    select 1 from public.routing_revisions where id = p_routing_revision_id and company_id = p_company_id and status = 'approved'
  ) then raise exception 'ENGINEERING_REVISION_NOT_APPROVED' using errcode = 'P0001'; end if;

  insert into public.feasibility_reviews (
    company_id, rfq_id, status, drawing_revision_id, bom_revision_id, routing_revision_id, conditions, reviewed_by, reviewed_at
  ) values (
    p_company_id, p_rfq_id, p_status, p_drawing_revision_id, p_bom_revision_id, p_routing_revision_id,
    nullif(trim(p_conditions), ''), (select auth.uid()), now()
  ) on conflict (rfq_id) do update set
    status = excluded.status,
    drawing_revision_id = excluded.drawing_revision_id,
    bom_revision_id = excluded.bom_revision_id,
    routing_revision_id = excluded.routing_revision_id,
    conditions = excluded.conditions,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    revision = public.feasibility_reviews.revision + 1
  returning id into v_feasibility_id;
  update public.rfqs set
    status = case p_status when 'feasible' then 'qualified' when 'conditional' then 'qualified'
      when 'info_required' then 'awaiting_info' else 'lost' end,
    revision = revision + 1,
    updated_at = now()
  where id = p_rfq_id and company_id = p_company_id;
  insert into public.command_idempotency (company_id, command_name, idempotency_key, result_id)
  values (p_company_id, 'record_feasibility', p_idempotency_key, v_feasibility_id);
  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, idempotency_key)
  values (p_company_id, (select auth.uid()), 'feasibility_review', v_feasibility_id, 'feasibility.recorded', p_idempotency_key);
  return v_feasibility_id;
end;
$$;
