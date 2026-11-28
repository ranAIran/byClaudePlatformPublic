-- R53/R54 · row-level security check. Plays four devices against the live schema and cleans up.
-- Run: life/test/supabase-rls.sh (through the Management API). Every line must say PASS.
create or replace function pg_temp.rls_check() returns setof text language plpgsql as $$
declare
  A uuid := gen_random_uuid();  -- the owner's first device
  B uuid := gen_random_uuid();  -- a new phone asking to join
  C uuid := gen_random_uuid();  -- a stranger with the public key of the app
  D uuid := gen_random_uuid();  -- the Claude agent (read-only, 24 h)
  V uuid; n int; ok boolean;
  procedure_as text;
begin
  if (select count(*) from public.vaults) > 0 then return next 'SKIP a vault already exists; this check needs an empty project'; return; end if;
  -- helper: act as a signed-in device
  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  insert into public.vaults (owner) values (A) returning id into V;
  insert into public.devices (id, vault_id, name, kind, role, public_key, approved_at) values (A, V, 'phone', 'phone', 'owner', 'pkA', now());
  insert into public.records (vault_id, kind, id, updated_at, device, iv, ciphertext) values (V, 'node', 'n1', now(), 'phone-a', 'iv', 'LOCKED');
  return next 'PASS owner creates the vault, registers itself and writes a record';

  perform set_config('request.jwt.claims', json_build_object('sub', C, 'role', 'authenticated')::text, true);
  begin insert into public.vaults (owner) values (C); return next 'FAIL a stranger created a second vault'; exception when others then return next 'PASS a stranger cannot create a second vault'; end;
  begin insert into public.devices (id, vault_id, name, kind, role, public_key, approved_at) values (C, V, 'x', 'web', 'owner', 'pkC', now()); return next 'FAIL a stranger joined as owner'; exception when others then return next 'PASS a stranger cannot join as owner'; end;
  select count(*) into n from public.records; return next case when n = 0 then 'PASS a stranger sees no records' else 'FAIL a stranger sees records' end;
  begin insert into public.records (vault_id, kind, id, updated_at, device, iv, ciphertext) values (V, 'node', 'evil', now(), 'x', 'iv', 'junk'); return next 'FAIL a stranger wrote a record'; exception when others then return next 'PASS a stranger cannot write'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', B, 'role', 'authenticated')::text, true);
  insert into public.pairing_requests (vault_id, name, kind, public_key, code) values (public.the_vault(), 'new phone', 'phone', 'pkB', '4821');
  select count(*) into n from public.records; return next case when n = 0 then 'PASS a pending device asks to join and still sees nothing' else 'FAIL a pending device sees records' end;
  update public.pairing_requests set status = 'approved' where device_uid = B; get diagnostics n = row_count;
  return next case when n = 0 then 'PASS a pending device cannot approve itself' else 'FAIL a pending device approved itself' end;

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  update public.pairing_requests set status = 'approved' where device_uid = B;
  insert into public.devices (id, vault_id, name, kind, role, public_key, wrapped_key, approved_at, approved_by) values (B, V, 'new phone', 'phone', 'member', 'pkB', 'WRAPPED-FOR-B', now(), A);
  insert into public.devices (id, vault_id, name, kind, role, can_write, public_key, wrapped_key, approved_at, approved_by, expires_at) values (D, V, 'Claude', 'agent', 'agent', false, 'pkD', 'WRAPPED-FOR-D', now(), A, now() + interval '24 hours');
  return next 'PASS the owner approves the phone and the agent';

  perform set_config('request.jwt.claims', json_build_object('sub', B, 'role', 'authenticated')::text, true);
  select count(*) into n from public.records; return next case when n = 1 then 'PASS the approved phone reads the vault' else 'FAIL the approved phone cannot read' end;

  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated')::text, true);
  select count(*) into n from public.records; return next case when n = 1 then 'PASS the agent reads' else 'FAIL the agent cannot read' end;
  begin insert into public.records (vault_id, kind, id, updated_at, device, iv, ciphertext) values (V, 'node', 'n2', now(), 'claude', 'iv', 'x'); return next 'FAIL the read-only agent wrote'; exception when others then return next 'PASS the read-only agent cannot write'; end;
  begin insert into public.devices (id, vault_id, name, kind, role, public_key, approved_at) values (gen_random_uuid(), V, 'x', 'agent', 'agent', 'pk', now()); return next 'FAIL the agent added a device'; exception when others then return next 'PASS the agent cannot add devices'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  update public.devices set expires_at = now() - interval '1 second' where id = D;
  update public.devices set revoked_at = now() where id = B;
  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated')::text, true);
  select count(*) into n from public.records; return next case when n = 0 then 'PASS the agent sees nothing after its 24 h' else 'FAIL the expired agent still reads' end;
  perform set_config('request.jwt.claims', json_build_object('sub', B, 'role', 'authenticated')::text, true);
  select count(*) into n from public.records; return next case when n = 0 then 'PASS a revoked phone sees nothing' else 'FAIL a revoked phone still reads' end;

  perform set_config('role', 'anon', true);
  begin select count(*) into n from public.records; return next 'FAIL the public key alone can query records'; exception when others then return next 'PASS without signing in, nothing is reachable'; end;

  perform set_config('role', 'postgres', true);
  delete from public.vaults where id = V;
  return next 'CLEAN test data removed';
end $$;
select * from pg_temp.rls_check();
