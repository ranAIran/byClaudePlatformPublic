-- Pairing requests wait 2 hours instead of 15 minutes: the owner often switches devices or reloads
-- later. The 6-digit code (from the new device's own key) still has to match on the approving device.
alter table public.pairing_requests alter column expires_at set default now() + interval '2 hours';
-- The owner's request from the phone (28 Nov 2026) had expired before the computer looked: give it 2 hours.
update public.pairing_requests set expires_at = now() + interval '2 hours' where status = 'pending';
