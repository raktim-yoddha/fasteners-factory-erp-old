insert into public.permission_definitions(code,description) values
 ('equipment.read','Read tools, gauges, readiness evidence and shift capacity.'),('equipment.manage','Register equipment and record holds.'),
 ('equipment.calibrate','Record gauge calibration evidence.'),('equipment.maintain','Record maintenance evidence.') on conflict do nothing;
insert into public.role_permissions(role,permission_code) select role,'equipment.read' from public.role_permissions where permission_code='production.read' on conflict do nothing;
insert into public.role_permissions(role,permission_code) values ('admin','equipment.manage'),('engineering','equipment.manage'),('production_supervisor','equipment.manage'),('admin','equipment.calibrate'),('quality','equipment.calibrate'),('admin','equipment.maintain'),('production_supervisor','equipment.maintain'),('engineering','equipment.maintain') on conflict do nothing;
create table public.equipment_assets (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,code text not null check(code ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'),
 name text not null check(char_length(trim(name)) between 1 and 160),kind text not null check(kind in ('machine','tool','gauge')),
 work_centre_id uuid,requires_maintenance boolean not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(id,company_id),unique(company_id,code),foreign key(company_id) references public.companies(id),foreign key(work_centre_id,company_id) references public.work_centres(id,company_id)
);
create table public.equipment_events (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,asset_id uuid not null,
 kind text not null check(kind in ('calibration','maintenance','hold','clear_hold')),checked_on date not null,
 next_due date,passed boolean,reference text not null check(char_length(trim(reference)) between 1 and 500),reason text not null check(char_length(trim(reason)) between 1 and 2000),
 recorded_sequence bigint generated always as identity,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(asset_id,company_id) references public.equipment_assets(id,company_id),
 check((kind in ('hold','clear_hold') and next_due is null and passed is null) or (kind in ('calibration','maintenance') and next_due is not null and next_due>=checked_on and passed is not null))
);
create index equipment_event_history_idx on public.equipment_events(company_id,asset_id,kind,checked_on desc,recorded_sequence desc);
create table public.job_equipment_assignments (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,job_card_id uuid not null,asset_id uuid not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(id,company_id),foreign key(job_card_id,company_id) references public.job_cards(id,company_id),foreign key(asset_id,company_id) references public.equipment_assets(id,company_id)
);
create table public.job_equipment_releases (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,assignment_id uuid not null unique,reason text not null check(char_length(trim(reason)) between 1 and 2000),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(assignment_id,company_id) references public.job_equipment_assignments(id,company_id)
);
create table public.inspection_plan_gauges (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,plan_id uuid not null,asset_id uuid not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(plan_id,asset_id),
 foreign key(plan_id,company_id) references public.inspection_plans(id,company_id),foreign key(asset_id,company_id) references public.equipment_assets(id,company_id)
);
create table public.capacity_shifts (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,work_centre_id uuid not null,label text not null check(char_length(trim(label)) between 1 and 120),
 starts_at timestamptz not null,ends_at timestamptz not null,break_minutes integer not null check(break_minutes>=0),
 status text not null default 'active' check(status in ('active','cancelled')),cancelled_at timestamptz,cancelled_by uuid references auth.users(id),cancellation_reason text,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(id,company_id),
 foreign key(work_centre_id,company_id) references public.work_centres(id,company_id),
 check(ends_at>starts_at and ends_at-starts_at<=interval '24 hours' and extract(epoch from ends_at-starts_at)/60>break_minutes),
 check((status='active' and cancelled_at is null and cancelled_by is null and cancellation_reason is null) or (status='cancelled' and cancelled_at is not null and cancelled_by is not null and char_length(trim(cancellation_reason)) between 1 and 2000))
);
create index capacity_shifts_centre_dates_idx on public.capacity_shifts(company_id,work_centre_id,starts_at,ends_at);
create table public.capacity_allocations (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,shift_id uuid not null,job_card_id uuid not null,minutes numeric(12,2) not null check(minutes>0 and minutes<>'NaN'::numeric),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(id,company_id),
 foreign key(shift_id,company_id) references public.capacity_shifts(id,company_id),foreign key(job_card_id,company_id) references public.job_cards(id,company_id)
);
create table public.capacity_releases (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,allocation_id uuid not null unique,reason text not null check(char_length(trim(reason)) between 1 and 2000),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(allocation_id,company_id) references public.capacity_allocations(id,company_id)
);
do $$ declare t text;begin
 foreach t in array array['equipment_assets','equipment_events','job_equipment_assignments','job_equipment_releases','inspection_plan_gauges','capacity_shifts','capacity_allocations','capacity_releases'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
  execute format('create policy permitted_equipment on public.%I for select to authenticated using ((select private.has_company_permission(company_id,''equipment.read'')))',t);
  if t<>'capacity_shifts' then execute format('create trigger immutable_equipment_history before update or delete on public.%I for each row execute function private.reject_lot_history_change()',t);end if;
 end loop;
end $$;
create function private.guard_capacity_shift() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'CAPACITY_IMMUTABLE';end if;
 if old.status<>'active' or new.status<>'cancelled' or (to_jsonb(new)-array['status','cancelled_at','cancelled_by','cancellation_reason']) is distinct from (to_jsonb(old)-array['status','cancelled_at','cancelled_by','cancellation_reason']) then raise exception 'CAPACITY_IMMUTABLE';end if;return new;
end $$;
revoke all on function private.guard_capacity_shift() from public,anon,authenticated;
create trigger immutable_capacity_shift before update or delete on public.capacity_shifts for each row execute function private.guard_capacity_shift();
create function private.asset_block_reason(p_company_id uuid,p_asset_id uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare v_asset public.equipment_assets%rowtype;v_event public.equipment_events%rowtype;v_today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 select * into v_asset from public.equipment_assets where id=p_asset_id and company_id=p_company_id;
 if not found then return 'Equipment is unavailable.';end if;
 select * into v_event from public.equipment_events where asset_id=v_asset.id and kind in ('hold','clear_hold') order by recorded_sequence desc limit 1;
 if found and v_event.kind='hold' then return 'Equipment held: '||v_event.reason;end if;
 if v_asset.kind='gauge' then
  select * into v_event from public.equipment_events where asset_id=v_asset.id and kind='calibration' order by checked_on desc,recorded_sequence desc limit 1;
  if not found then return 'Calibration evidence is missing.';end if;
  if not v_event.passed then return 'Latest calibration failed.';end if;
  if v_event.next_due<v_today then return 'Calibration expired on '||v_event.next_due::text||'.';end if;
 end if;
 if v_asset.requires_maintenance then
  select * into v_event from public.equipment_events where asset_id=v_asset.id and kind='maintenance' order by checked_on desc,recorded_sequence desc limit 1;
  if not found then return 'Maintenance evidence is missing.';end if;
  if not v_event.passed then return 'Latest maintenance check failed.';end if;
  if v_event.next_due<v_today then return 'Maintenance was due on '||v_event.next_due::text||'.';end if;
 end if;return null;
end $$;
revoke all on function private.asset_block_reason(uuid,uuid) from public,anon,authenticated;
create function public.equipment_command(p_company_id uuid,p_action text,p_data jsonb,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_permission text;v_asset public.equipment_assets%rowtype;v_job public.job_cards%rowtype;v_shift public.capacity_shifts%rowtype;v_centre uuid;v_plan public.inspection_plans%rowtype;v_link record;
 v_from timestamptz;v_to timestamptz;v_minutes numeric;v_used numeric;v_request jsonb:=jsonb_build_array(p_action,p_data);v_reason text:=trim(p_data->>'reason');
begin
 v_permission:=case when p_action in ('create_asset','hold','clear_hold') then 'equipment.manage' when p_action='calibration' then 'equipment.calibrate' when p_action='maintenance' then 'equipment.maintain' when p_action='link_gauge_plan' then 'quality.manage' when p_action in ('assign_job_asset','release_job_asset','create_shift','cancel_shift','allocate','release_allocation') then 'planning.manage' end;
 if v_permission is null then raise exception 'UNKNOWN_COMMAND';end if;
 v_id:=private.begin_material_command(p_company_id,v_permission,'equipment.'||p_action,p_idempotency_key,v_request);if v_id is not null then return v_id;end if;
 if jsonb_typeof(p_data) is distinct from 'object' or v_reason is null or char_length(v_reason) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 if p_action='create_asset' then
  insert into public.equipment_assets(company_id,code,name,kind,work_centre_id,requires_maintenance,created_by) values(p_company_id,upper(trim(p_data->>'code')),trim(p_data->>'name'),p_data->>'kind',(p_data->>'work_centre_id')::uuid,(p_data->>'requires_maintenance')::boolean,(select auth.uid())) returning id into v_id;
 elsif p_action in ('calibration','maintenance','hold','clear_hold','assign_job_asset','link_gauge_plan') then
  -- Lock the operational parent before equipment, as the job/inspection commands do.
  if p_action='assign_job_asset' then
   select * into v_job from public.job_cards where id=(p_data->>'job_card_id')::uuid and company_id=p_company_id for update;
   if not found or v_job.status<>'pending' then raise exception 'INVALID_TRANSITION';end if;
  elsif p_action='link_gauge_plan' then
   select * into v_plan from public.inspection_plans where id=(p_data->>'plan_id')::uuid and company_id=p_company_id for update;
   if not found or v_plan.status<>'draft' then raise exception 'INVALID_TRANSITION';end if;
  end if;
  select * into v_asset from public.equipment_assets where id=(p_data->>'asset_id')::uuid and company_id=p_company_id for update;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND';end if;
  if p_action='calibration' and v_asset.kind<>'gauge' then raise exception 'GAUGE_REQUIRED';end if;
  if p_action in ('calibration','maintenance','hold','clear_hold') then
   if p_action in ('calibration','maintenance') and ((p_data->>'checked_on')::date is null or (p_data->>'checked_on')::date>(now() at time zone 'Asia/Kolkata')::date) then raise exception 'INVALID_DATE_RANGE';end if;
   insert into public.equipment_events(company_id,asset_id,kind,checked_on,next_due,passed,reference,reason,created_by)
    values(p_company_id,v_asset.id,p_action,case when p_action in ('hold','clear_hold') then (now() at time zone 'Asia/Kolkata')::date else (p_data->>'checked_on')::date end,
     case when p_action in ('calibration','maintenance') then (p_data->>'next_due')::date end,case when p_action in ('calibration','maintenance') then (p_data->>'passed')::boolean end,coalesce(nullif(trim(p_data->>'reference'),''),v_reason),v_reason,(select auth.uid())) returning id into v_id;
  elsif p_action='assign_job_asset' then
   if v_asset.work_centre_id is not null and v_asset.work_centre_id<>v_job.work_centre_id then raise exception 'EQUIPMENT_CONTEXT_MISMATCH';end if;
   if exists(select 1 from public.job_equipment_assignments a where a.job_card_id=v_job.id and a.asset_id=v_asset.id and not exists(select 1 from public.job_equipment_releases r where r.assignment_id=a.id)) then raise exception 'EQUIPMENT_ALREADY_ASSIGNED';end if;
   insert into public.job_equipment_assignments(company_id,job_card_id,asset_id,created_by) values(p_company_id,v_job.id,v_asset.id,(select auth.uid())) returning id into v_id;
  else
   if v_asset.kind<>'gauge' then raise exception 'GAUGE_REQUIRED';end if;
   insert into public.inspection_plan_gauges(company_id,plan_id,asset_id,created_by) values(p_company_id,v_plan.id,v_asset.id,(select auth.uid())) returning id into v_id;
  end if;
 elsif p_action='release_job_asset' then
  select a.* into v_link from public.job_equipment_assignments a join public.job_cards j on j.id=a.job_card_id where a.id=(p_data->>'assignment_id')::uuid and a.company_id=p_company_id and j.status='pending' for update of j;
  if not found then raise exception 'INVALID_TRANSITION';end if;
  insert into public.job_equipment_releases(company_id,assignment_id,reason,created_by) values(p_company_id,v_link.id,v_reason,(select auth.uid())) returning id into v_id;
 elsif p_action='create_shift' then
  select id into v_centre from public.work_centres where id=(p_data->>'work_centre_id')::uuid and company_id=p_company_id for update;
  if not found then raise exception 'WORK_CENTRE_NOT_FOUND';end if;
  v_from:=((p_data->>'from_date')||' '||(p_data->>'from_time'))::timestamp at time zone 'Asia/Kolkata';v_to:=((p_data->>'to_date')||' '||(p_data->>'to_time'))::timestamp at time zone 'Asia/Kolkata';
  if v_from is null or v_to is null or v_to<=v_from or v_to-v_from>interval '24 hours' then raise exception 'INVALID_DATE_RANGE';end if;
  if exists(select 1 from public.capacity_shifts where work_centre_id=v_centre and company_id=p_company_id and status='active' and starts_at<v_to and ends_at>v_from) then raise exception 'CAPACITY_SHIFT_OVERLAP';end if;
  insert into public.capacity_shifts(company_id,work_centre_id,label,starts_at,ends_at,break_minutes,created_by) values(p_company_id,v_centre,trim(p_data->>'label'),v_from,v_to,(p_data->>'break_minutes')::integer,(select auth.uid())) returning id into v_id;
 elsif p_action in ('allocate','cancel_shift') then
  select * into v_shift from public.capacity_shifts where id=(p_data->>'shift_id')::uuid and company_id=p_company_id for update;
  if not found or v_shift.status<>'active' then raise exception 'INVALID_TRANSITION';end if;
  select coalesce(sum(a.minutes),0) into v_used from public.capacity_allocations a where a.shift_id=v_shift.id and not exists(select 1 from public.capacity_releases r where r.allocation_id=a.id);
  if p_action='cancel_shift' then
   if v_used>0 then raise exception 'CAPACITY_ALLOCATIONS_EXIST';end if;
   update public.capacity_shifts set status='cancelled',cancelled_at=now(),cancelled_by=(select auth.uid()),cancellation_reason=v_reason where id=v_shift.id;v_id:=v_shift.id;
  else
   select * into v_job from public.job_cards where id=(p_data->>'job_card_id')::uuid and company_id=p_company_id for update;
   if not found or v_job.status<>'pending' then raise exception 'INVALID_TRANSITION';end if;
   if v_job.work_centre_id<>v_shift.work_centre_id then raise exception 'EQUIPMENT_CONTEXT_MISMATCH';end if;
   v_minutes:=private.factory_quantity(p_data,'minutes');
   if v_minutes<>trunc(v_minutes,2) then raise exception 'INVALID_QUANTITY';end if;
   if v_minutes+v_used>extract(epoch from v_shift.ends_at-v_shift.starts_at)/60-v_shift.break_minutes then raise exception 'CAPACITY_EXCEEDED';end if;
   insert into public.capacity_allocations(company_id,shift_id,job_card_id,minutes,created_by) values(p_company_id,v_shift.id,v_job.id,v_minutes,(select auth.uid())) returning id into v_id;
  end if;
 else
  select a.* into v_link from public.capacity_allocations a where a.id=(p_data->>'allocation_id')::uuid and a.company_id=p_company_id;
  if not found then raise exception 'INVALID_TRANSITION';end if;
  perform 1 from public.capacity_shifts where id=v_link.shift_id for update;
  select * into v_job from public.job_cards where id=v_link.job_card_id and company_id=p_company_id for update;
  if not found or v_job.status<>'pending' then raise exception 'INVALID_TRANSITION';end if;
  insert into public.capacity_releases(company_id,allocation_id,reason,created_by) values(p_company_id,v_link.id,v_reason,(select auth.uid())) returning id into v_id;
 end if;
 return private.finish_material_command(p_company_id,'equipment.'||p_action,p_idempotency_key,v_request,v_id,'equipment',v_reason);
end $$;
revoke all on function public.equipment_command(uuid,text,jsonb,text) from public,anon;grant execute on function public.equipment_command(uuid,text,jsonb,text) to authenticated;
create function private.guard_job_equipment() returns trigger language plpgsql security definer set search_path='' as $$
declare v_reason text;v_asset uuid;
begin
 if new.status='in_progress' and old.status='pending' then
  for v_asset in select a.asset_id from public.job_equipment_assignments a where a.job_card_id=new.id and not exists(select 1 from public.job_equipment_releases r where r.assignment_id=a.id) order by a.asset_id loop
   perform 1 from public.equipment_assets where id=v_asset for share;
   v_reason:=private.asset_block_reason(new.company_id,v_asset);if v_reason is not null then raise exception 'EQUIPMENT_NOT_READY: %',v_reason;end if;
  end loop;
 end if;return new;
end $$;
create function private.guard_inspection_gauges() returns trigger language plpgsql security definer set search_path='' as $$
declare v_reason text;v_asset uuid;
begin
 for v_asset in select asset_id from public.inspection_plan_gauges where plan_id=new.plan_id order by asset_id loop
  perform 1 from public.equipment_assets where id=v_asset for share;
  v_reason:=private.asset_block_reason(new.company_id,v_asset);if v_reason is not null then raise exception 'EQUIPMENT_NOT_READY: %',v_reason;end if;
 end loop;return new;
end $$;
revoke all on function private.guard_job_equipment(),private.guard_inspection_gauges() from public,anon,authenticated;
create trigger job_equipment_readiness before update on public.job_cards for each row execute function private.guard_job_equipment();
create trigger inspection_gauge_readiness before insert on public.inspections for each row execute function private.guard_inspection_gauges();
create function public.get_equipment_workspace(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'equipment.read') then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object(
 'assets',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('blocked_reason',private.asset_block_reason(p_company_id,a.id)) order by code) from public.equipment_assets a where company_id=p_company_id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('recorded_sequence',recorded_sequence::text) order by recorded_sequence desc) from public.equipment_events e where company_id=p_company_id),'[]'::jsonb),
 'centres',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name) order by code) from public.work_centres where company_id=p_company_id),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'work_number',w.number,'name',j.name,'sequence',j.sequence,'work_centre_id',j.work_centre_id,'status',j.status) order by w.number,j.sequence) from public.job_cards j join public.work_orders w on w.id=j.work_order_id where j.company_id=p_company_id and j.status in ('pending','in_progress')),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a)) from public.job_equipment_assignments a where company_id=p_company_id and not exists(select 1 from public.job_equipment_releases r where r.assignment_id=a.id)),'[]'::jsonb),
 'plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'version',version,'status',status)) from public.inspection_plans where company_id=p_company_id),'[]'::jsonb),
 'plan_gauges',coalesce((select jsonb_agg(to_jsonb(g)) from public.inspection_plan_gauges g where company_id=p_company_id),'[]'::jsonb),
 'shifts',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('available_minutes',(extract(epoch from ends_at-starts_at)/60-break_minutes)::text,'allocated_minutes',coalesce((select sum(a.minutes) from public.capacity_allocations a where a.shift_id=s.id and not exists(select 1 from public.capacity_releases r where r.allocation_id=a.id)),0)::text) order by starts_at,id) from public.capacity_shifts s where company_id=p_company_id),'[]'::jsonb),
 'allocations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('minutes',minutes::text)) from public.capacity_allocations a where company_id=p_company_id and not exists(select 1 from public.capacity_releases r where r.allocation_id=a.id)),'[]'::jsonb));
end $$;
revoke all on function public.get_equipment_workspace(uuid) from public,anon;grant execute on function public.get_equipment_workspace(uuid) to authenticated;
