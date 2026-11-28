// R53/R54 live check against the real Supabase project: a phone and a computer (two anonymous
// sign-ins) pair, sync both ways, and the server holds only ciphertext. Runs only while the project
// has no vault yet (before the owner turns sync on) and removes everything it made.
// Needs the Supabase personal access token (injected by the session proxy) for the cleanup.
import { createStore, memoryBackend } from "../app/core/store.js";
import { createSync } from "../app/core/sync.js";
import { createSupabaseRemote } from "../app/supa.js";

const REF = "uuamddvxaownewcfpczt";
const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: "Bearer proxy-injected", "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  if (!r.ok) throw new Error("management API: " + r.status + " " + (await r.text()));
  return r.json();
};
const memKeys = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } }; };
const fails = []; const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) fails.push(msg); };
const dev = (name) => { const store = createStore(memoryBackend(), { device: name }); const remote = createSupabaseRemote({ keys: memKeys() }); return { store, remote, sync: createSync({ store, remote, keys: memKeys() }) }; };

const [{ n }] = await sql("select count(*)::int as n from public.vaults;");
if (n > 0) { console.log("SKIP the project already has a vault (sync is on); this check runs only on an empty project"); process.exit(0); }
const made = [];
try {
  const phone = dev("phone-live"), pc = dev("web-live");
  check((await phone.sync.start()) === "off", "an empty project: sync is off");
  const t1 = phone.store.add({ type: "task", title: "Live secret task", parent: "paperwork" });
  phone.store.capture("קלט סודי לבדיקה");
  const { recoveryCode } = await phone.sync.enable({ name: "Live phone", kind: "phone" }); made.push(phone.remote.uid());
  check(phone.sync.state() === "on" && /-/.test(recoveryCode), "the phone makes the vault and a recovery code");
  check((await pc.sync.start()) === "join", "the computer sees a vault it may ask to join");
  const { code } = await pc.sync.requestJoin({ name: "Live computer", kind: "web" }); made.push(pc.remote.uid());
  check((await pc.sync.syncNow()).state === "pending", "before approval the computer gets nothing");
  const reqs = await phone.sync.pending();
  check(reqs.length === 1 && reqs[0].check === code, `the phone sees the request with the same code (${code})`);
  await phone.sync.approve(reqs[0]);
  check((await pc.sync.start()) === "on", "after approval the computer opens the data key");
  await pc.sync.syncNow();
  check(pc.store.get(t1)?.title === "Live secret task" && pc.store.inputs().some((x) => x.text === "קלט סודי לבדיקה"), "the computer has the phone's task and raw input");
  pc.store.update(t1, { title: "Live secret task, edited" }); await pc.sync.syncNow(); await phone.sync.syncNow();
  check(phone.store.get(t1).title === "Live secret task, edited", "an edit on the computer reaches the phone");
  const rows = await sql("select string_agg(ciphertext, '') as c, count(*)::int as n from (select ciphertext from public.records union all select ciphertext from public.journal union all select ciphertext from public.inputs) x;");
  check(rows[0].n > 3 && !/Live secret|סודי/.test(rows[0].c), `the server holds ${rows[0].n} rows, all ciphertext`);
  const stranger = createSupabaseRemote({ keys: memKeys() }); await stranger.signIn(); made.push(stranger.uid());
  const vault = phone.sync.vault(); let blocked = false;
  try { const r = await stranger.pull("records", vault, "synced_at", null); blocked = r.length === 0; } catch (e) { blocked = true; }
  check(blocked, "a stranger who signs in sees nothing");
  const fresh = dev("phone-recovered"); await fresh.sync.start();
  await fresh.sync.recover({ code: recoveryCode, name: "Recovered phone", kind: "phone" }); made.push(fresh.remote.uid());
  check(fresh.store.get(t1)?.title === "Live secret task, edited", "the paper recovery code brings everything back on a new device");
} catch (e) { check(false, "error: " + e.message); }
finally {
  await sql("delete from public.vaults; delete from public.pairing_requests;");
  const ids = made.filter(Boolean).map((x) => `'${x}'`).join(",");
  if (ids) await sql(`delete from auth.users where id in (${ids}) and is_anonymous;`);
  const [{ v, u }] = await sql("select (select count(*) from public.vaults)::int as v, (select count(*) from auth.users)::int as u;");
  check(v === 0 && u === 0, `cleaned up (vaults ${v}, users ${u})`);
}
process.exit(fails.length ? 1 : 0);
