-- ADR 0019 amendment: require immutable account ownership and ciphertext hash metadata at confirmation.
create or replace function public.confirm_solo_backup(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.solo_backups%rowtype;object storage.objects%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED';end if;
 select * into b from public.solo_backups where id=p_id and owner_id=(select auth.uid()) for update;
 if not found then raise exception 'BACKUP_NOT_FOUND';end if;
 select * into object from storage.objects where bucket_id='solo-backups' and name=b.object_path for share;
 if not found or object.metadata->>'size' !~ '^\d+$' or (object.metadata->>'size')::numeric is distinct from b.byte_size
  or object.metadata->>'mimetype' is distinct from 'application/octet-stream' or object.owner_id is distinct from b.owner_id::text
  or object.user_metadata->>'sha256' is distinct from b.ciphertext_sha256 then raise exception 'BACKUP_FILE_MISMATCH';end if;
 if b.status='pending' then update public.solo_backups set status='ready',confirmed_at=now() where id=b.id returning * into b;end if;
 return to_jsonb(b);
end $$;
create index solo_backups_owner_created on public.solo_backups(owner_id,created_at desc);
create index solo_cutovers_company on public.solo_cutovers(company_id);
