-- Protected administration for already approved Auth accounts. No email is sent.
alter table public.company_memberships add column revision integer not null default 1 check(revision>0);
create function public.get_company_members(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'members.manage') then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',coalesce(p.display_name,'Approved user'),'active',m.active,'revision',m.revision,
  'roles',coalesce((select jsonb_agg(role order by role) from public.user_company_roles where company_id=p_company_id and user_id=m.user_id),'[]'::jsonb)) order by m.created_at,m.user_id)
  from public.company_memberships m left join public.profiles p on p.user_id=m.user_id where m.company_id=p_company_id),'[]'::jsonb);
end $$;
create function public.set_company_member_access(p_company_id uuid,p_data jsonb,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_user uuid;v_member public.company_memberships%rowtype;v_roles public.app_role[];v_active boolean;v_before jsonb;
begin
 v_id:=private.begin_material_command(p_company_id,'members.manage','member.access',p_idempotency_key,p_data);if v_id is not null then return v_id;end if;
 v_user:=(p_data->>'user_id')::uuid;v_active:=(p_data->>'active')::boolean;
 if v_user is null or v_active is null or jsonb_typeof(p_data->'roles') is distinct from 'array' or jsonb_array_length(p_data->'roles') not between 1 and 15 then raise exception 'INVALID_REQUEST';end if;
 if p_data->>'reason' is null or char_length(trim(p_data->>'reason')) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
 select array_agg(distinct role::public.app_role order by role::public.app_role) into v_roles from jsonb_array_elements_text(p_data->'roles') role;
 if not exists(select 1 from auth.users where id=v_user and deleted_at is null) then raise exception 'APPROVED_ACCOUNT_NOT_FOUND';end if;
 -- Serialize all administrator changes, including concurrent removal of the last administrators.
 perform 1 from public.companies where id=p_company_id for update;
 select * into v_member from public.company_memberships where company_id=p_company_id and user_id=v_user for update;
 if coalesce(v_member.revision,0) is distinct from (p_data->>'expected_revision')::integer then raise exception 'REVISION_CONFLICT';end if;
 if not (v_active and 'admin'::public.app_role=any(v_roles)) and not exists(select 1 from public.company_memberships m join public.user_company_roles r on r.company_id=m.company_id and r.user_id=m.user_id where m.company_id=p_company_id and m.active and m.user_id<>v_user and r.role='admin') then raise exception 'LAST_ADMIN_REQUIRED';end if;
 select jsonb_build_object('active',v_member.active,'roles',coalesce((select jsonb_agg(role) from public.user_company_roles where company_id=p_company_id and user_id=v_user),'[]'::jsonb)) into v_before;
 insert into public.company_memberships(company_id,user_id,active) values(p_company_id,v_user,v_active)
  on conflict(company_id,user_id) do update set active=excluded.active,revision=public.company_memberships.revision+1;
 delete from public.user_company_roles where company_id=p_company_id and user_id=v_user;
 insert into public.user_company_roles(company_id,user_id,role) select p_company_id,v_user,unnest(v_roles);
 v_id:=private.finish_material_command(p_company_id,'member.access',p_idempotency_key,p_data,v_user,'company_member',trim(p_data->>'reason'));
 -- Keep permission changes reviewable without exposing Auth emails or secrets.
 insert into public.audit_log(company_id,actor_id,entity_type,entity_id,action,reason,metadata) values(p_company_id,(select auth.uid()),'company_member',v_user,'member.access.details',trim(p_data->>'reason'),jsonb_build_object('before',v_before,'after',jsonb_build_object('active',v_active,'roles',v_roles)));
 return v_id;
end $$;
revoke all on function public.get_company_members(uuid),public.set_company_member_access(uuid,jsonb,text) from public,anon;
grant execute on function public.get_company_members(uuid),public.set_company_member_access(uuid,jsonb,text) to authenticated;
create index audit_log_company_id_page_idx on public.audit_log(company_id,id desc);
create function public.get_company_audit_page(p_company_id uuid,p_search text default '',p_before_id bigint default null,p_from_date date default null,p_to_date date default null) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;v_more boolean;
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'audit.read') then raise exception 'FORBIDDEN';end if;
 if p_search is null or char_length(p_search)>160 or (p_from_date is not null and p_to_date is not null and p_from_date>p_to_date) then raise exception 'INVALID_REQUEST';end if;
 with page as(select a.* from public.audit_log a where company_id=p_company_id and (p_before_id is null or id<p_before_id)
  and (p_search='' or position(lower(p_search) in lower(action||' '||entity_type||' '||coalesce(reason,'')||' '||coalesce(entity_id::text,'')))>0)
  and (p_from_date is null or occurred_at>=p_from_date::timestamp at time zone 'Asia/Kolkata')
  and (p_to_date is null or occurred_at<(p_to_date+1)::timestamp at time zone 'Asia/Kolkata') order by id desc limit 51),
 visible as(select * from page order by id desc limit 50)
 select coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('id',id::text) order by id desc) from visible v),'[]'::jsonb),(select count(*)>50 from page) into v_rows,v_more;
 return jsonb_build_object('rows',v_rows,'has_more',v_more);
end $$;
revoke all on function public.get_company_audit_page(uuid,text,bigint,date,date) from public,anon;grant execute on function public.get_company_audit_page(uuid,text,bigint,date,date) to authenticated;
