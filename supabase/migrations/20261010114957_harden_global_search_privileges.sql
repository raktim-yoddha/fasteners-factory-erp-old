revoke all on function public.search_company_records(uuid, text) from public, anon;
grant execute on function public.search_company_records(uuid, text) to authenticated;
