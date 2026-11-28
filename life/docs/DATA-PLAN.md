# Data plan: storage, sync, encryption (agreed with the owner, Nov 2026)

Diagrams: `data-architecture.png`, `data-encryption-options.png`, `plan-tree.png`.

## Where things run
- The app runs on the devices only: Android APK (WebView, offline) and the website (browser). Same code.
- GitHub Pages serves the website files. GitHub Actions builds the APK. No user data on GitHub.
- No Vercel: GitHub Pages is enough; Supabase covers the small server needs (sync, Web Push, an AI proxy if ever needed).

## Decisions
- **Encryption: option C.** End-to-end: content is encrypted on the device; Supabase sees only ids, record kinds, time tags and which device. Claude gets access like a new device that the owner approves: **read-only by default, 24 hours**, every action in the log, revocable (revoking rotates the key).
- **Recovery key on paper: yes.** Without it, if every device is lost, nothing can be opened.
- **Keep data as long as possible.** From time to time Claude helps clean up; always download a full backup first, then delete.
- **Devices:** phone (APK) and computer (website). One user now; keep the design open to more users later.
- **Action log:** a time tag for every add, update and delete, with who (me / app / claude) and which device.
- **Learned suggestions: yes,** computed on the device from the log, shared with no one, applied only after approval.
- **AI chat in the app: later,** through an OpenAI-compatible interface (Groq / Gemini / others). Check each provider's privacy terms first (free tiers may use content for training). The owner's own key stays on their approved devices.
- **Reminders when the app is closed:** Android already schedules them on the phone (R11). The computer needs Web Push sent by Supabase at the right time, with the payload encrypted in advance by the device; or export to a calendar (.ics).
- **Supabase key:** never paste it in chat; it is given through the secure credential form when phase B starts. The anon key may live in the app (rules are enforced on the server); the service_role key is secret.

## Server (Supabase project "life app Project", ref `uuamddvxaownewcfpczt`, eu-central-1)
- Schema: `supabase/migrations/20261128000001_vault.sql` (applied 28 Nov 2026 through the Management API). Tables: `vaults` (one only: single owner), `devices` (id = auth uid; role owner/member/agent; can_write; expires_at for the agent; wrapped_key = data key locked for that device; revoked_at), `pairing_requests` (one-time code, 15 min), `records` (latest encrypted version per record), `journal` and `inputs` (append-only, encrypted). The server stores only `iv` + `ciphertext` plus ids, kinds, time tags and device.
- Row-level security on every table; nothing granted to the `anon` role; helpers `is_member`, `can_manage` (owner/member only, never the agent), `the_vault`.
- Check: `bash life/test/supabase-rls.sh` plays owner, new phone, stranger and the Claude agent (`supabase/tests/rls_check.sql`) and removes its test data; 15 checks pass.
- Anonymous sign-in must be on (Authentication → Sign In / Providers): every device signs in without a password and is let in only after approval.
- The personal access token (Management API) has no `auth_config_write`; auth settings are changed by the owner in the dashboard.

## Phases
- **A (done, life 0.9.0):** R51 action log + raw inputs, R52 user profile ("memory"), data version 3 ready for encryption (`core/sealable.js` splits each record into visible metadata and content), menu screens "My week & memory" and "Activity log".
- **B (done, life 0.10.0):** `core/crypto.js` (AES-GCM data key, RSA-OAEP device keys whose private key never leaves the device, 6-digit pairing code from the device key, paper recovery code → PBKDF2), `core/sync.js` (enable, request/approve/reject/revoke, recover, push/pull with server-clock cursors, newest-wins per record, log and inputs merged by device+seq), `app/supa.js` (REST, anonymous sign-in), keys in their own IndexedDB (`openKeyStore`, never in backups), menu "Sync & devices…". Migration 2 adds `records.synced_at` (server clock) and recovery (`recovery_blob`, `recover_device`). Checks: `test/sync.test.js` (unit), `test/sync-live.mjs` and `test/sync-browser.mjs` (real project, run only while it has no vault, clean up after themselves). Not yet: rotating the data key after a revoke (a revoked device loses server access by RLS but keeps what it already had), Web Push on the computer.
- **B (original plan):** R53 end-to-end encryption + recovery key + device pairing (one-time code, owner approves, revoke); R54 sync phone ↔ computer (offline-first) + Web Push on the computer.
- **C:** R55 Claude as an approved device (read-only, 24 h), guided clean-up, server backups and restore points.
- **D:** R46 windows (time and place, last chance, cost of missing), R47 important vs. urgent, R48 wish shelf, learned suggestions.
- **Ideas (owner: save, don't build yet):** website `?add=` link; a REST inbox on Supabase (secret token; plain text waiting briefly, or encrypted to an inbox public key); approving Claude for read and write (24 h).
- **Later:** AI chat (OpenAI-compatible), R50, MCP server (R23/R25), more users.
