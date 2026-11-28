-- Life Archipelago · phase B server schema (R53 pairing, R54 sync). See life/docs/DATA-PLAN.md.
-- The server only ever holds ciphertext. What it can see: ids, kinds, time tags and which device.
-- One user for now: the first vault that is created is the only one allowed (single owner).
-- Every device (phone, web, the Claude agent) signs in anonymously and is let in only after an
-- approved device of the owner approves it. Auto-grant is off in this project, so grants are explicit.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.vaults (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,                       -- auth uid of the first device
  recovery_wrapped_key text,                 -- data key locked with the paper recovery key (ciphertext)
  key_version int not null default 1,        -- bumped when a device is revoked and the key is rotated
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key,                       -- = auth.uid() of that device
  vault_id uuid not null references public.vaults(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('phone', 'web', 'agent')),
  role text not null check (role in ('owner', 'member', 'agent')),
  can_write boolean not null default true,
  public_key text not null,                  -- the device's public key (to wrap the data key for it)
  wrapped_key text,                          -- data key locked for this device (ciphertext)
  key_version int not null default 1,
  expires_at timestamptz,                    -- the agent gets 24 h; phones and computers none
  approved_at timestamptz,
  approved_by uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pairing_requests (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  device_uid uuid not null default auth.uid(),
  name text not null,
  kind text not null check (kind in ('phone', 'web', 'agent')),
  public_key text not null,
  code text not null check (length(code) between 4 and 12),  -- shown on the new device, checked by the owner
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);

-- The latest encrypted version of each record (nodes, profile entries, suggestions).
create table if not exists public.records (
  vault_id uuid not null references public.vaults(id) on delete cascade,
  kind text not null,
  id text not null,
  updated_at timestamptz not null,
  device text not null,
  deleted boolean not null default false,
  key_version int not null default 1,
  iv text not null,
  ciphertext text not null,
  primary key (vault_id, kind, id)
);

-- The action log (R51), append-only. Each device numbers its own entries.
create table if not exists public.journal (
  vault_id uuid not null references public.vaults(id) on delete cascade,
  device text not null,
  seq bigint not null,
  at timestamptz not null,
  op text not null,
  record_id text,
  by_who text not null,
  key_version int not null default 1,
  iv text not null,
  ciphertext text not null,
  received_at timestamptz not null default now(),
  primary key (vault_id, device, seq)
);

-- Raw inputs (R51), append-only.
create table if not exists public.inputs (
  vault_id uuid not null references public.vaults(id) on delete cascade,
  device text not null,
  seq bigint not null,
  at timestamptz not null,
  key_version int not null default 1,
  iv text not null,
  ciphertext text not null,
  received_at timestamptz not null default now(),
  primary key (vault_id, device, seq)
);

create index if not exists records_updated on public.records (vault_id, updated_at);
create index if not exists journal_received on public.journal (vault_id, received_at);
create index if not exists inputs_received on public.inputs (vault_id, received_at);

-- ---------- helpers (security definer: they see past RLS, but only answer yes/no or one id) ----------
create or replace function public.is_member(v uuid, need_write boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from devices d
    where d.id = auth.uid() and d.vault_id = v
      and d.approved_at is not null and d.revoked_at is null
      and (d.expires_at is null or d.expires_at > now())
      and (not need_write or d.can_write)
  );
$$;

-- Only the owner's phone or computer may approve, revoke or change keys; never the agent.
create or replace function public.can_manage(v uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from devices d
    where d.id = auth.uid() and d.vault_id = v and d.role in ('owner', 'member')
      and d.approved_at is not null and d.revoked_at is null
  );
$$;

-- Single owner: the vault id a new device should ask to join, and whether a vault exists yet.
create or replace function public.the_vault()
returns uuid language sql stable security definer set search_path = public as $$
  select id from vaults order by created_at limit 1;
$$;

-- ---------- row-level security ----------
alter table public.vaults enable row level security;
alter table public.devices enable row level security;
alter table public.pairing_requests enable row level security;
alter table public.records enable row level security;
alter table public.journal enable row level security;
alter table public.inputs enable row level security;

-- vaults: the first signed-in device may create the only vault; members read it; managers update it.
drop policy if exists vault_create on public.vaults;
create policy vault_create on public.vaults for insert to authenticated
  with check (owner = auth.uid() and public.the_vault() is null);
drop policy if exists vault_read on public.vaults;
create policy vault_read on public.vaults for select to authenticated
  using (public.is_member(id) or owner = auth.uid());
drop policy if exists vault_update on public.vaults;
create policy vault_update on public.vaults for update to authenticated
  using (public.can_manage(id)) with check (public.can_manage(id));

-- devices: the owner's first device registers itself; afterwards only managers add, approve or revoke.
drop policy if exists device_bootstrap on public.devices;
create policy device_bootstrap on public.devices for insert to authenticated
  with check (
    id = auth.uid() and role = 'owner'
    and exists (select 1 from public.vaults v where v.id = vault_id and v.owner = auth.uid())
    and not exists (select 1 from public.devices d where d.vault_id = devices.vault_id)
  );
drop policy if exists device_add on public.devices;
create policy device_add on public.devices for insert to authenticated
  with check (public.can_manage(vault_id) and role in ('member', 'agent'));
drop policy if exists device_read on public.devices;
create policy device_read on public.devices for select to authenticated
  using (id = auth.uid() or public.is_member(vault_id));
drop policy if exists device_manage on public.devices;
create policy device_manage on public.devices for update to authenticated
  using (public.can_manage(vault_id)) with check (public.can_manage(vault_id));

-- pairing: a new device asks; it sees only its own request; managers see and answer all.
drop policy if exists pair_ask on public.pairing_requests;
create policy pair_ask on public.pairing_requests for insert to authenticated
  with check (device_uid = auth.uid() and status = 'pending' and vault_id = public.the_vault());
drop policy if exists pair_read on public.pairing_requests;
create policy pair_read on public.pairing_requests for select to authenticated
  using (device_uid = auth.uid() or public.can_manage(vault_id));
drop policy if exists pair_answer on public.pairing_requests;
create policy pair_answer on public.pairing_requests for update to authenticated
  using (public.can_manage(vault_id)) with check (public.can_manage(vault_id));

-- data: members read; members with write access write. The log and inputs are never edited.
drop policy if exists rec_read on public.records;
create policy rec_read on public.records for select to authenticated using (public.is_member(vault_id));
drop policy if exists rec_insert on public.records;
create policy rec_insert on public.records for insert to authenticated with check (public.is_member(vault_id, true));
drop policy if exists rec_update on public.records;
create policy rec_update on public.records for update to authenticated using (public.is_member(vault_id, true)) with check (public.is_member(vault_id, true));
drop policy if exists rec_delete on public.records;
create policy rec_delete on public.records for delete to authenticated using (public.can_manage(vault_id));

drop policy if exists jr_read on public.journal;
create policy jr_read on public.journal for select to authenticated using (public.is_member(vault_id));
drop policy if exists jr_insert on public.journal;
create policy jr_insert on public.journal for insert to authenticated with check (public.is_member(vault_id, true));
drop policy if exists jr_delete on public.journal;
create policy jr_delete on public.journal for delete to authenticated using (public.can_manage(vault_id));

drop policy if exists in_read on public.inputs;
create policy in_read on public.inputs for select to authenticated using (public.is_member(vault_id));
drop policy if exists in_insert on public.inputs;
create policy in_insert on public.inputs for insert to authenticated with check (public.is_member(vault_id, true));
drop policy if exists in_delete on public.inputs;
create policy in_delete on public.inputs for delete to authenticated using (public.can_manage(vault_id));

-- ---------- grants (auto-grant is off): signed-in devices only, nothing for the anon role ----------
revoke all on public.vaults, public.devices, public.pairing_requests, public.records, public.journal, public.inputs from anon;
grant select, insert, update on public.vaults to authenticated;
grant select, insert, update on public.devices to authenticated;
grant select, insert, update on public.pairing_requests to authenticated;
grant select, insert, update, delete on public.records to authenticated;
grant select, insert, delete on public.journal to authenticated;
grant select, insert, delete on public.inputs to authenticated;
revoke all on function public.is_member(uuid, boolean), public.can_manage(uuid), public.the_vault() from anon, public;
grant execute on function public.is_member(uuid, boolean), public.can_manage(uuid), public.the_vault() to authenticated;
