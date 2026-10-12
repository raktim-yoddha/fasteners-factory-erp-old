-- ADR 0017: explicit package contents retain the packed lot and original quantity.
create table public.shipment_packages (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 shipment_line_id uuid not null,package_code text not null check(package_code ~ '^[A-Z0-9][A-Z0-9/-]{2,63}$'),
 quantity numeric(18,6) not null check(quantity>0 and quantity<>'NaN'::numeric),
 uom text not null check(uom in ('pcs','kg','m','set')),
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 unique(company_id,package_code),foreign key(shipment_line_id,company_id) references public.shipment_lines(id,company_id)
);
create index shipment_packages_line_idx on public.shipment_packages(shipment_line_id);
create index shipment_packages_company_idx on public.shipment_packages(company_id);
create trigger immutable_shipment_packages before update or delete on public.shipment_packages
 for each row execute function private.reject_lot_history_change();
alter table public.shipment_packages enable row level security;
revoke all on public.shipment_packages from public,anon,authenticated;
grant select on public.shipment_packages to authenticated;
create policy permitted_shipment_packages on public.shipment_packages for select to authenticated
 using((select private.has_company_permission(company_id,'dispatch.read')));

create function public.add_shipment_package(p_company_id uuid,p_data jsonb,p_idempotency_key text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_ship public.shipments%rowtype;v_line public.shipment_lines%rowtype;v_qty numeric;v_used numeric;v_uom text;
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
 v_id:=private.begin_material_command(p_company_id,'dispatch.manage','shipment.package',p_idempotency_key,p_data);
 if v_id is not null then return v_id;end if;
 select s.* into v_ship from public.shipments s join public.shipment_lines l on l.shipment_id=s.id
  where l.id=(p_data->>'shipment_line_id')::uuid and l.company_id=p_company_id for update of s;
 if not found then raise exception 'SHIPMENT_LINE_NOT_FOUND';end if;
 if v_ship.status<>'draft' then raise exception 'INVALID_TRANSITION';end if;
 if v_ship.revision is distinct from (p_data->>'shipment_revision')::integer then raise exception 'REVISION_CONFLICT';end if;
 select l.* into v_line from public.shipment_lines l where l.id=(p_data->>'shipment_line_id')::uuid and l.company_id=p_company_id;
 select sl.uom into v_uom from public.stock_reservations r join public.sales_order_lines sl on sl.id=r.sales_order_line_id where r.id=v_line.reservation_id;
 if v_uom is distinct from p_data->>'uom' then raise exception 'UOM_MISMATCH';end if;
 v_qty:=private.factory_quantity(p_data,'quantity');
 select coalesce(sum(quantity),0) into v_used from public.shipment_packages where shipment_line_id=v_line.id;
 if v_qty>v_line.quantity-v_used then raise exception 'PACKAGE_QUANTITY_EXCEEDED';end if;
 insert into public.shipment_packages(company_id,shipment_line_id,package_code,quantity,uom,created_by)
  values(p_company_id,v_line.id,upper(trim(p_data->>'package_code')),v_qty,v_uom,(select auth.uid())) returning id into v_id;
 update public.shipments set revision=revision+1 where id=v_ship.id;
 return private.finish_material_command(p_company_id,'shipment.package',p_idempotency_key,p_data,v_id,'shipment_package');
end $$;
revoke all on function public.add_shipment_package(uuid,jsonb,text) from public,anon;
grant execute on function public.add_shipment_package(uuid,jsonb,text) to authenticated;

create function private.require_complete_packages() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='dispatched' and old.status='draft' and exists(
  select 1 from public.shipment_packages p join public.shipment_lines l on l.id=p.shipment_line_id where l.shipment_id=new.id
 ) and exists(
  select 1 from public.shipment_lines l where l.shipment_id=new.id and l.quantity<>
  coalesce((select sum(quantity) from public.shipment_packages p where p.shipment_line_id=l.id),0)
 ) then raise exception 'PACKAGES_INCOMPLETE';end if;
 return new;
end $$;
revoke all on function private.require_complete_packages() from public,anon,authenticated;
create trigger complete_packages_before_dispatch before update of status on public.shipments
 for each row execute function private.require_complete_packages();

create function public.get_packing_workspace(p_company_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'shipment_id',s.id,'shipment_number',s.shipment_number,'shipment_revision',s.revision,'status',s.status,'lot_id',t.id,'lot_code',t.lot_code,'sku',i.sku,'quantity',l.quantity::text,'uom',sl.uom,'packaged_quantity',coalesce(p.quantity,0)::text,'remaining_quantity',(l.quantity-coalesce(p.quantity,0))::text) order by s.created_at desc,l.id)
  from public.shipment_lines l join public.shipments s on s.id=l.shipment_id join public.stock_lots t on t.id=l.lot_id join public.items i on i.id=t.item_id
  join public.stock_reservations r on r.id=l.reservation_id join public.sales_order_lines sl on sl.id=r.sales_order_line_id
  left join lateral(select sum(quantity) quantity from public.shipment_packages where shipment_line_id=l.id) p on true where l.company_id=p_company_id),'[]'::jsonb),
 'packages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'shipment_line_id',shipment_line_id,'package_code',package_code,'quantity',quantity::text,'uom',uom,'created_at',created_at) order by created_at,id) from public.shipment_packages where company_id=p_company_id),'[]'::jsonb)
 );$$;
revoke all on function public.get_packing_workspace(uuid) from public,anon;
grant execute on function public.get_packing_workspace(uuid) to authenticated;
