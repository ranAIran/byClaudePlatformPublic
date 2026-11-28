// The Supabase "remote" for core/sync.js: plain REST over fetch (no SDK), anonymous sign-in, and the
// tables from supabase/migrations. Only ciphertext is ever sent; access rules live in the database (RLS).
export const SUPABASE = { url: "https://uuamddvxaownewcfpczt.supabase.co", key: "sb_publishable_wTaicahcCO_Mbq6T2EEavg_rdf-CNKq" };

export function createSupabaseRemote({ url = SUPABASE.url, key = SUPABASE.key, keys, fetch: f = globalThis.fetch.bind(globalThis) } = {}) {
  let session = null;
  const load = async () => { if (!session) session = await keys.get("session"); return session; };
  const save = async (s) => { session = s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Date.now() + (s.expires_in || 3600) * 1000, uid: s.user?.id || session?.uid } : null; await keys.set("session", session); };
  async function auth(path, body) {
    const r = await f(`${url}/auth/v1/${path}`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.error_description || j.message || `sign-in failed (${r.status})`);
    return j;
  }
  async function signIn() {
    await load();
    if (session && session.expires_at - Date.now() > 60e3) return;
    if (session?.refresh_token) { try { await save(await auth("token?grant_type=refresh_token", { refresh_token: session.refresh_token })); return; } catch (e) { /* the refresh token is gone: sign in again */ } }
    if (session?.uid) throw new Error("this device's sign-in expired; open the app online to renew it");
    await save(await auth("signup", {}));
  }
  async function rest(path, { method = "GET", body, prefer, retried = false } = {}) {
    await signIn();
    const headers = { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
    if (prefer) headers.Prefer = prefer;
    const r = await f(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 401 && !retried) { session.expires_at = 0; return rest(path, { method, body, prefer, retried: true }); }
    const text = await r.text(); const j = text ? JSON.parse(text) : null;
    if (!r.ok) throw new Error(`${j?.message || "request failed"} (${r.status})`);
    return j;
  }
  const q = encodeURIComponent;
  const one = (rows) => (Array.isArray(rows) ? rows[0] || null : rows);
  const rpc = (name, args = {}) => rest(`rpc/${name}`, { method: "POST", body: args });

  return {
    signIn, uid: () => session?.uid,
    theVault: async () => (await rpc("the_vault")) || null,
    createVault: async () => one(await rest("vaults", { method: "POST", body: { owner: session.uid }, prefer: "return=representation" })).id,
    updateVault: (id, patch) => rest(`vaults?id=eq.${q(id)}`, { method: "PATCH", body: patch, prefer: "return=minimal" }),
    addDevice: async (row) => { await rest("devices", { method: "POST", body: row, prefer: "return=minimal" }); return row; },
    myDevice: async () => one(await rest(`devices?id=eq.${q(session.uid)}&select=*`)),
    devices: (v) => rest(`devices?vault_id=eq.${q(v)}&select=*&order=created_at`),
    updateDevice: (id, patch) => rest(`devices?id=eq.${q(id)}`, { method: "PATCH", body: patch, prefer: "return=minimal" }),
    requestPairing: (row) => rest("pairing_requests", { method: "POST", body: row, prefer: "return=minimal" }),
    myRequest: async () => one(await rest(`pairing_requests?device_uid=eq.${q(session.uid)}&status=eq.pending&select=*`)),
    pairingRequests: (v) => rest(`pairing_requests?vault_id=eq.${q(v)}&status=eq.pending&select=*&order=created_at`),
    answerPairing: (id, status) => rest(`pairing_requests?id=eq.${q(id)}`, { method: "PATCH", body: { status }, prefer: "return=minimal" }),
    recoveryBlob: async () => one(await rpc("recovery_blob")),
    recoverDevice: ({ proof, name, kind, public_key, wrapped_key }) => rpc("recover_device", { proof, device_name: name, device_kind: kind, device_public_key: public_key, device_wrapped_key: wrapped_key }),
    async upsert(table, rows) {
      const prefer = (table === "records" ? "resolution=merge-duplicates" : "resolution=ignore-duplicates") + ",return=minimal";
      for (let i = 0; i < rows.length; i += 200) await rest(table, { method: "POST", body: rows.slice(i, i + 200), prefer });
    },
    async pull(table, v, col, since) {
      const out = []; let after = since;
      for (;;) {
        const page = await rest(`${table}?vault_id=eq.${q(v)}${after ? `&${col}=gt.${q(after)}` : ""}&order=${col}.asc&limit=500&select=*`);
        out.push(...page); if (page.length < 500) return out; after = page[page.length - 1][col];
      }
    },
  };
}
