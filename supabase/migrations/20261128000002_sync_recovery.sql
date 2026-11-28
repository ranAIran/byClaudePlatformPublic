-- Phase B, part 2: a server clock for sync, and recovery with the paper key.

-- Devices pull "what changed since my last pull" by the server's own time, so a phone whose clock
-- is wrong can never hide a change from the other devices.
alter table public.records add column if not exists synced_at timestamptz not null default now();
create or replace function public.touch_synced() returns trigger language plpgsql as $$
begin new.synced_at := clock_timestamp(); return new; end $$;
drop trigger if exists records_synced on public.records;
create trigger records_synced before insert or update on public.records for each row execute function public.touch_synced();
create index if not exists records_synced_at on public.records (vault_id, synced_at);

-- Recovery: the data key is also stored locked with a key derived from the paper recovery key.
-- recovery_check is a hash of a second value derived from the same paper key: whoever can produce
-- it knows the paper key, and may register a new owner device without any other device.
alter table public.vaults add column if not exists recovery_check text;

-- Anyone signed in may fetch the locked copy: it opens only with the paper key (128 random bits).
create or replace function public.recovery_blob()
returns table (vault_id uuid, recovery_wrapped_key text) language sql stable security definer set search_path = public as $$
  select id, recovery_wrapped_key from vaults order by created_at limit 1;
$$;

create or replace function public.recover_device(proof text, device_name text, device_kind text, device_public_key text, device_wrapped_key text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v uuid; chk text;
begin
  select id, recovery_check into v, chk from vaults order by created_at limit 1;
  if v is null or chk is null or encode(digest(proof, 'sha256'), 'hex') <> chk then
    raise exception 'recovery key does not match';
  end if;
  insert into devices (id, vault_id, name, kind, role, public_key, wrapped_key, approved_at, approved_by)
  values (auth.uid(), v, device_name, device_kind, 'member', device_public_key, device_wrapped_key, now(), auth.uid())
  on conflict (id) do update set public_key = excluded.public_key, wrapped_key = excluded.wrapped_key, approved_at = now(), revoked_at = null;
  return v;
end $$;

revoke all on function public.recovery_blob(), public.recover_device(text, text, text, text, text) from anon, public;
grant execute on function public.recovery_blob(), public.recover_device(text, text, text, text, text) to authenticated;
