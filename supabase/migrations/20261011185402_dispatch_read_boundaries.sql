-- ADR 0017: expose only operational fields to dispatch and return readers.
drop policy customer_return_source_orders on public.sales_orders;
drop policy customer_return_source_lines on public.sales_order_lines;
create or replace function public.get_customer_return_workspace(p_company_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'customer_returns.read') then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object(
  'shipments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'shipment_number',shipment_number,'shipment_revision',shipment_revision,'sales_order_number',sales_order_number,'customer_name',customer_name,'item_id',item_id,'sku',sku,'source_lot_id',source_lot_id,'source_lot_code',source_lot_code,'shipped_quantity',shipped_quantity::text,'returned_quantity',returned_quantity::text,'returnable_quantity',returnable_quantity::text,'uom',uom) order by dispatched_at desc,id) from public.shipment_return_positions where company_id=p_company_id),'[]'::jsonb),
  'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'shipment_line_id',r.shipment_line_id,'lot_id',r.lot_id,'lot_code',l.lot_code,'return_number',r.return_number,'quantity',r.quantity::text,'uom',r.uom,'reference',r.reference,'reason',r.reason,'qc_status',l.qc_status,'created_at',r.created_at) order by r.created_at desc,r.id) from public.customer_return_receipts r join public.stock_lots l on l.id=r.lot_id where r.company_id=p_company_id),'[]'::jsonb)
 );
end $$;
revoke all on function public.get_customer_return_workspace(uuid) from public,anon;
grant execute on function public.get_customer_return_workspace(uuid) to authenticated;
create or replace function public.get_packing_workspace(p_company_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'dispatch.read') then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object(
 'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'shipment_id',s.id,'shipment_number',s.shipment_number,'shipment_revision',s.revision,'status',s.status,'lot_id',t.id,'lot_code',t.lot_code,'sku',i.sku,'quantity',l.quantity::text,'uom',sl.uom,'packaged_quantity',coalesce(p.quantity,0)::text,'remaining_quantity',(l.quantity-coalesce(p.quantity,0))::text) order by s.created_at desc,l.id)
  from public.shipment_lines l join public.shipments s on s.id=l.shipment_id join public.stock_lots t on t.id=l.lot_id join public.items i on i.id=t.item_id
  join public.stock_reservations r on r.id=l.reservation_id join public.sales_order_lines sl on sl.id=r.sales_order_line_id
  left join lateral(select sum(quantity) quantity from public.shipment_packages where shipment_line_id=l.id) p on true where l.company_id=p_company_id),'[]'::jsonb),
 'packages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'shipment_line_id',shipment_line_id,'package_code',package_code,'quantity',quantity::text,'uom',uom,'created_at',created_at) order by created_at,id) from public.shipment_packages where company_id=p_company_id),'[]'::jsonb)
 );
end $$;
revoke all on function public.get_packing_workspace(uuid) from public,anon;
grant execute on function public.get_packing_workspace(uuid) to authenticated;
create function public.get_dispatch_order_options(p_company_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if not private.has_company_permission(p_company_id,'dispatch.read') then raise exception 'FORBIDDEN';end if;
 return jsonb_build_object(
 'salesOrders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'sales_order_number',sales_order_number,'status',status,'revision',revision) order by created_at desc,id) from public.sales_orders where company_id=p_company_id and status in ('open','partially_shipped')),'[]'::jsonb),
 'salesOrderLines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'sales_order_id',l.sales_order_id,'item_id',l.item_id,'ordered_quantity',l.ordered_quantity::text,'uom',l.uom) order by l.id) from public.sales_order_lines l join public.sales_orders o on o.id=l.sales_order_id where l.company_id=p_company_id and o.status in ('open','partially_shipped')),'[]'::jsonb)
 );
end $$;
revoke all on function public.get_dispatch_order_options(uuid) from public,anon;
grant execute on function public.get_dispatch_order_options(uuid) to authenticated;
