-- Phase B, part 3: the server keeps the newest version of each record. An older version that
-- arrives late (from a device that was offline) is ignored instead of replacing a newer one.
create or replace function public.keep_newest() returns trigger language plpgsql as $$
begin
  if new.updated_at < old.updated_at then return null; end if;  -- skip this row, no error
  return new;
end $$;
drop trigger if exists records_keep_newest on public.records;
create trigger records_keep_newest before update on public.records for each row execute function public.keep_newest();
