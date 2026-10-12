-- Exact scanner lookup reuses each record's existing company-scoped RLS.
create function public.lookup_scanned_record(p_company_id uuid,p_query text)
returns table(record_type text,record_id uuid,label text)
language plpgsql stable security invoker set search_path='' as $$
declare v_query text:=trim(p_query);
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 if p_company_id is null or v_query is null or char_length(v_query) not between 1 and 100 or v_query ~ '[[:cntrl:]]' then raise exception 'INVALID_SEARCH_QUERY';end if;
 return query select distinct c.record_type,c.record_id,c.label from (
  select 'Item'::text record_type,i.id record_id,i.sku||' · '||i.description label from public.items i where i.company_id=p_company_id and (lower(i.sku)=lower(v_query) or i.id::text=lower(v_query))
  union all select 'Lot',l.id,l.lot_code||' · '||l.qc_status from public.stock_lots l where l.company_id=p_company_id and (lower(l.lot_code)=lower(v_query) or l.id::text=lower(v_query))
  union all select 'Work order',w.id,w.number||' · '||w.status from public.work_orders w where w.company_id=p_company_id and (lower(w.number)=lower(v_query) or w.id::text=lower(v_query))
  union all select 'Job card',j.id,w.number||' / '||j.sequence::text||' · '||j.name||' · '||j.status from public.job_cards j join public.work_orders w on w.id=j.work_order_id and w.company_id=j.company_id where j.company_id=p_company_id and (j.id::text=lower(v_query) or lower(w.number||'/'||j.sequence::text)=lower(v_query))
  union all select 'Shipment',s.id,s.shipment_number||' · '||s.status from public.shipments s where s.company_id=p_company_id and (lower(s.shipment_number)=lower(v_query) or s.id::text=lower(v_query))
  union all select 'Shipment',s.id,p.package_code||' · '||s.shipment_number||' · '||s.status from public.shipment_packages p join public.shipment_lines l on l.id=p.shipment_line_id and l.company_id=p.company_id join public.shipments s on s.id=l.shipment_id and s.company_id=l.company_id where p.company_id=p_company_id and (lower(p.package_code)=lower(v_query) or p.id::text=lower(v_query))
 ) c order by c.record_type,c.label,c.record_id;
end $$;
revoke all on function public.lookup_scanned_record(uuid,text) from public,anon;
grant execute on function public.lookup_scanned_record(uuid,text) to authenticated;
