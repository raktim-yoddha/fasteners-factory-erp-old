create function private.enforce_quotation_line_engineering_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.bom_revision_id is not null and not exists (
    select 1
    from public.bom_revisions revision
    join public.boms bom on bom.id = revision.bom_id and bom.company_id = revision.company_id
    where revision.id = new.bom_revision_id
      and revision.company_id = new.company_id
      and bom.output_item_id = new.item_id
  ) then
    raise exception 'ENGINEERING_REVISION_ITEM_MISMATCH';
  end if;
  if new.routing_revision_id is not null and not exists (
    select 1
    from public.routing_revisions revision
    join public.routings routing on routing.id = revision.routing_id and routing.company_id = revision.company_id
    where revision.id = new.routing_revision_id
      and revision.company_id = new.company_id
      and routing.output_item_id = new.item_id
  ) then
    raise exception 'ENGINEERING_REVISION_ITEM_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_quotation_line_engineering_item() from public;
create trigger enforce_quotation_line_engineering_item
  before insert or update of item_id, bom_revision_id, routing_revision_id on public.quotation_lines
  for each row execute function private.enforce_quotation_line_engineering_item();
