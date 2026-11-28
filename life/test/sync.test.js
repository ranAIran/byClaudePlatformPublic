// R53 pairing + end-to-end encryption, R54 sync. Two (or more) devices against an in-memory server
// that follows the same rules as the Supabase tables (only approved devices read; only writers write).
import { describe, it, expect } from "vitest";
import { createStore, memoryBackend } from "../app/core/store.js";
import { createSync } from "../app/core/sync.js";
import { newDataKey, encryptJSON, decryptJSON, newDeviceKeys, wrapFor, unwrapWith, fingerprint, newRecoveryCode, lockWithRecovery, openWithRecovery, sha256hex, normalizeCode } from "../app/core/crypto.js";

function fakeServer() {
  const t = { vaults: [], devices: [], pairing: [], records: new Map(), journal: [], inputs: [] };
  let clock = 0, users = 0;
  const now = () => new Date(Date.UTC(2026, 10, 28, 0, 0, 0, ++clock)).toISOString();
  const client = () => {
    let uid = null;
    const member = (v, write) => t.devices.some((d) => d.id === uid && d.vault_id === v && d.approved_at && !d.revoked_at && (!d.expires_at || d.expires_at > new Date().toISOString()) && (!write || d.can_write !== false));
    const manager = (v) => t.devices.some((d) => d.id === uid && d.vault_id === v && ["owner", "member"].includes(d.role) && d.approved_at && !d.revoked_at);
    const deny = () => { throw new Error("permission denied"); };
    return {
      signIn: async () => { if (!uid) uid = "u" + ++users; }, uid: () => uid,
      theVault: async () => t.vaults[0]?.id || null,
      createVault: async () => { if (t.vaults.length) deny(); t.vaults.push({ id: "vault-1", owner: uid }); return "vault-1"; },
      updateVault: async (id, p) => { if (!manager(id)) deny(); Object.assign(t.vaults.find((v) => v.id === id), p); },
      addDevice: async (row) => { const boot = !t.devices.length && t.vaults[0]?.owner === uid && row.id === uid; if (!boot && !manager(row.vault_id)) deny(); t.devices.push({ can_write: true, revoked_at: null, expires_at: null, ...row }); return row; },
      myDevice: async () => t.devices.find((d) => d.id === uid) || null,
      devices: async (v) => (member(v) ? t.devices.filter((d) => d.vault_id === v).map((d) => ({ ...d })) : []),
      updateDevice: async (id, p) => { const d = t.devices.find((x) => x.id === id); if (!manager(d.vault_id)) deny(); Object.assign(d, p); },
      requestPairing: async (row) => { t.pairing.push({ id: "req-" + t.pairing.length, device_uid: uid, status: "pending", expires_at: new Date(Date.now() + 9e5).toISOString(), ...row }); },
      myRequest: async () => t.pairing.find((r) => r.device_uid === uid && r.status === "pending") || null,
      pairingRequests: async (v) => (manager(v) ? t.pairing.filter((r) => r.vault_id === v).map((r) => ({ ...r })) : []),
      answerPairing: async (id, status) => { const r = t.pairing.find((x) => x.id === id); if (!manager(r.vault_id)) deny(); r.status = status; },
      recoveryBlob: async () => ({ vault_id: t.vaults[0].id, recovery_wrapped_key: t.vaults[0].recovery_wrapped_key }),
      recoverDevice: async ({ proof, name, kind, public_key, wrapped_key }) => {
        if ((await sha256hex(proof)) !== t.vaults[0].recovery_check) deny();
        t.devices.push({ id: uid, vault_id: t.vaults[0].id, name, kind, role: "member", can_write: true, public_key, wrapped_key, approved_at: now(), revoked_at: null, expires_at: null });
        return t.vaults[0].id;
      },
      upsert: async (table, rows) => {
        for (const r of rows) {
          if (!member(r.vault_id, true)) deny();
          if (table === "records") { const old = t.records.get(r.kind + "|" + r.id); if (!old || old.updated_at <= r.updated_at) t.records.set(r.kind + "|" + r.id, { ...r, synced_at: now() }); }
          else if (!t[table].some((x) => x.device === r.device && x.seq === r.seq)) t[table].push({ ...r, received_at: now() });
        }
      },
      pull: async (table, v, col, since) => {
        if (!member(v)) deny();
        const all = table === "records" ? [...t.records.values()] : t[table];
        return all.filter((r) => r.vault_id === v && (!since || r[col] > since)).sort((a, b) => (a[col] < b[col] ? -1 : 1)).map((r) => ({ ...r }));
      },
    };
  };
  return { t, client };
}
const memKeys = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } }; };
let tick = 0; const clock = () => new Date(Date.UTC(2026, 10, 28, 8, 0, 0) + 1000 * ++tick);
const device = (server, name) => { const store = createStore(memoryBackend(), { now: clock, device: name }); const sync = createSync({ store, remote: server.client(), keys: memKeys() }); return { store, sync }; };

describe("R53 · encryption on the device", () => {
  it("encrypts and decrypts records; a wrong key cannot open them", async () => {
    const k = await newDataKey(), other = await newDataKey();
    const box = await encryptJSON(k, { title: "Secret plan", n: 3 });
    expect(box.ciphertext).not.toContain("Secret");
    expect(await decryptJSON(k, box)).toEqual({ title: "Secret plan", n: 3 });
    await expect(decryptJSON(other, box)).rejects.toThrow();
  });
  it("locks the data key for one device only; the code is 6 digits from that device's key", async () => {
    const k = await newDataKey(), a = await newDeviceKeys(), b = await newDeviceKeys();
    const w = await wrapFor(a.publicKey, k), k2 = await unwrapWith(a.privateKey, w);
    expect(await decryptJSON(k2, await encryptJSON(k, { x: 1 }))).toEqual({ x: 1 });
    await expect(unwrapWith(b.privateKey, w)).rejects.toThrow();
    expect(await fingerprint(a.publicKey)).toMatch(/^\d{3} \d{3}$/); expect(await fingerprint(a.publicKey)).toBe(await fingerprint(a.publicKey));
  });
  it("the paper recovery code opens the locked copy; a wrong code does not", async () => {
    const code = newRecoveryCode(); expect(code).toMatch(/^([A-Z2-9]{4}-){6}[A-Z2-9]{2}$/);
    const k = await newDataKey(), { blob, check } = await lockWithRecovery(code, "vault-1", k);
    const typed = code.toLowerCase().replace(/-/g, " ");
    const { dataKey, proof } = await openWithRecovery(typed, "vault-1", blob);
    expect(await sha256hex(proof)).toBe(check); expect(normalizeCode(typed)).toBe(code.replace(/-/g, ""));
    expect(await decryptJSON(dataKey, await encryptJSON(k, { ok: true }))).toEqual({ ok: true });
    await expect(openWithRecovery(newRecoveryCode(), "vault-1", blob)).rejects.toThrow();
  });
});

describe("R53/R54 · pairing and sync between the phone and the computer", () => {
  it("phone turns sync on; the computer joins with a matching code; both see the same life, encrypted on the server", async () => {
    const server = fakeServer(), phone = device(server, "phone-1"), pc = device(server, "web-1");
    expect(await phone.sync.start()).toBe("off");
    const t1 = phone.store.add({ type: "task", title: "Pay arnona", parent: "paperwork", due: "2026-12-01" });
    phone.store.setProfile("workWeek", { days: [0, 1, 2, 3, 4], from: "08:30", to: "16:30" });
    phone.store.capture("לשלם ארנונה עד יום ראשון");
    const { recoveryCode } = await phone.sync.enable({ name: "My phone", kind: "phone" });
    expect(recoveryCode).toMatch(/-/); expect(phone.sync.state()).toBe("on");

    expect(await pc.sync.start()).toBe("join");
    const { code } = await pc.sync.requestJoin({ name: "Home computer", kind: "web" });
    expect(await pc.sync.start()).toBe("pending");
    expect((await pc.sync.syncNow()).state).toBe("pending"); // nothing before approval
    const reqs = await phone.sync.pending();
    expect(reqs.length).toBe(1); expect(reqs[0].check).toBe(code); expect(reqs[0].name).toBe("Home computer");
    await phone.sync.approve(reqs[0]);
    expect(await pc.sync.start()).toBe("on");
    await pc.sync.syncNow();
    expect(pc.store.get(t1).title).toBe("Pay arnona");
    expect(pc.store.profile().workWeek.from).toBe("08:30");
    expect(pc.store.inputs().some((x) => x.text === "לשלם ארנונה עד יום ראשון" && x.device === "phone-1")).toBe(true);
    expect(pc.store.journal().some((e) => e.id === t1 && e.op === "add" && e.device === "phone-1")).toBe(true);

    pc.store.update(t1, { title: "Pay the arnona" });
    const t2 = pc.store.add({ type: "note", title: "Computer note", parent: "home" });
    await pc.sync.syncNow(); await phone.sync.syncNow();
    expect(phone.store.get(t1).title).toBe("Pay the arnona"); expect(phone.store.get(t2).title).toBe("Computer note");
    expect(phone.store.journal().some((e) => e.id === t1 && e.op === "update" && e.device === "web-1")).toBe(true);
    phone.store.remove(t2); await phone.sync.syncNow(); await pc.sync.syncNow();
    expect(pc.store.get(t2)).toBe(null);
    expect(phone.store.syncPending()).toBe(0); expect(pc.store.syncPending()).toBe(0);

    const raw = JSON.stringify([...server.t.records.values(), ...server.t.journal, ...server.t.inputs]);
    for (const secret of ["arnona", "Computer note", "ארנונה", "08:30"]) expect(raw).not.toContain(secret);
  });
  it("turning sync on uploads everything already on the device, not only later changes", async () => {
    const server = fakeServer();
    const before = createStore(memoryBackend(), { now: clock, device: "web-1" });
    const a = before.add({ type: "task", title: "Written before sync", parent: "home" });
    before.setProfile("workWeek", { days: [0, 1, 2, 3], from: "07:00", to: "15:00" });
    const saved = before.snapshot();
    const keys = memKeys();
    const pc = { store: createStore({ load: () => saved, save() {} }, { now: clock, device: "web-1" }) }; // reopened: nothing marked as changed
    pc.sync = createSync({ store: pc.store, remote: server.client(), keys });
    expect(pc.store.syncOutbox().nodes.length).toBe(0);
    await pc.sync.start(); await pc.sync.enable({ name: "pc", kind: "web" });
    const phone = device(server, "phone-1");
    await phone.sync.requestJoin({ name: "phone", kind: "phone" }); const [r] = await pc.sync.pending(); await pc.sync.approve(r);
    await phone.sync.start(); await phone.sync.syncNow();
    expect(phone.store.get(a)?.title).toBe("Written before sync");
    expect(phone.store.profile().workWeek.from).toBe("07:00");
    const ids = [...server.t.records.values()].filter((x) => x.kind === "node").map((x) => x.id);
    expect(ids).toContain(a); expect(ids).not.toContain("home"); // untouched built-in places are not sent
  });
  it("a new device's untouched defaults never overwrite the vault (renamed places, score, my week)", async () => {
    const server = fakeServer(), pc = device(server, "web-1");
    await pc.sync.start(); pc.store.update("work", { title: "Job" }); pc.store.award(50, "test"); pc.store.setProfile("workWeek", { days: [0, 1, 2], from: "06:00", to: "14:00" });
    await pc.sync.enable({ name: "pc", kind: "web" });
    const phone = device(server, "phone-1"); // made later: its untouched "Work" place is newer than the rename
    await phone.sync.requestJoin({ name: "phone", kind: "phone" }); const [r] = await pc.sync.pending(); await pc.sync.approve(r);
    await phone.sync.start(); await phone.sync.syncNow(); await pc.sync.syncNow();
    expect(phone.store.get("work").title).toBe("Job"); expect(pc.store.get("work").title).toBe("Job");
    expect(phone.store.xp()).toBe(50); expect(pc.store.xp()).toBe(50);
    expect(phone.store.profile().workWeek.from).toBe("06:00");
  });
  it("an older edit that arrives late does not replace a newer one", async () => {
    const server = fakeServer(), pc = device(server, "web-1"), phone = device(server, "phone-1");
    await pc.sync.start(); const id = pc.store.add({ type: "task", title: "v1", parent: "home" }); await pc.sync.enable({ name: "pc", kind: "web" });
    await phone.sync.requestJoin({ name: "phone", kind: "phone" }); const [r] = await pc.sync.pending(); await pc.sync.approve(r);
    await phone.sync.start(); await phone.sync.syncNow();
    phone.store.update(id, { title: "older edit, made offline" });   // earlier clock tick
    pc.store.update(id, { title: "newer edit" }); await pc.sync.syncNow(); // later tick, reaches the server first
    await phone.sync.syncNow(); await pc.sync.syncNow();
    expect(phone.store.get(id).title).toBe("newer edit"); expect(pc.store.get(id).title).toBe("newer edit");
  });
  it("a device that joins uploads what it already had", async () => {
    const server = fakeServer(), pc = device(server, "web-1");
    await pc.sync.start(); await pc.sync.enable({ name: "pc", kind: "web" });
    const local = createStore(memoryBackend(), { now: clock, device: "phone-1" });
    const b = local.add({ type: "note", title: "Phone note from before", parent: "home" });
    const saved = local.snapshot();
    const phone = { store: createStore({ load: () => saved, save() {} }, { now: clock, device: "phone-1" }) };
    phone.sync = createSync({ store: phone.store, remote: server.client(), keys: memKeys() });
    await phone.sync.requestJoin({ name: "phone", kind: "phone" }); const [r] = await pc.sync.pending(); await pc.sync.approve(r);
    await phone.sync.start(); await phone.sync.syncNow(); await pc.sync.syncNow();
    expect(pc.store.get(b)?.title).toBe("Phone note from before");
  });
  it("the approving device refuses a request whose code does not match its key", async () => {
    const server = fakeServer(), phone = device(server, "phone-1"), pc = device(server, "web-1");
    await phone.sync.start(); await phone.sync.enable({ name: "phone", kind: "phone" });
    await pc.sync.requestJoin({ name: "pc", kind: "web" });
    const [r] = await phone.sync.pending();
    await expect(phone.sync.approve({ ...r, code: "000000" })).rejects.toThrow(/code/);
  });
  it("a stranger cannot read or write; a revoked device is shut out; the read-only agent cannot write", async () => {
    const server = fakeServer(), phone = device(server, "phone-1"), pc = device(server, "web-1"), stranger = server.client();
    await phone.sync.start(); phone.store.add({ type: "task", title: "Private", parent: "work" }); await phone.sync.enable({ name: "phone", kind: "phone" });
    await stranger.signIn();
    await expect(stranger.pull("records", "vault-1", "synced_at", null)).rejects.toThrow();
    await expect(stranger.upsert("records", [{ vault_id: "vault-1", kind: "node", id: "x" }])).rejects.toThrow();
    await pc.sync.requestJoin({ name: "pc", kind: "web" }); const [r] = await phone.sync.pending(); await phone.sync.approve(r);
    expect(await pc.sync.start()).toBe("on");
    const pcDev = (await phone.sync.devices()).find((d) => d.name === "pc");
    await phone.sync.revoke(pcDev.id);
    expect(await pc.sync.start()).toBe("revoked");
    const agent = device(server, "claude"); await agent.sync.requestJoin({ name: "Claude", kind: "agent" });
    const [ra] = await phone.sync.pending(); await phone.sync.approve(ra, { agent: true, hours: 24 });
    expect(await agent.sync.start()).toBe("on");
    await agent.sync.syncNow(); expect(agent.store.all().some((n) => n.title === "Private")).toBe(true);
    agent.store.add({ type: "note", title: "agent wrote", parent: "home" });
    await expect(agent.sync.syncNow()).rejects.toThrow(/permission/);
    const ad = (await phone.sync.devices()).find((d) => d.name === "Claude");
    expect(ad).toMatchObject({ role: "agent", can_write: false }); expect(Date.parse(ad.expires_at) - Date.now()).toBeGreaterThan(23 * 36e5);
  });
  it("every device lost: the paper code brings everything back on a new one", async () => {
    const server = fakeServer(), phone = device(server, "phone-1");
    await phone.sync.start(); const id = phone.store.add({ type: "task", title: "Renew passport", parent: "paperwork" });
    const { recoveryCode } = await phone.sync.enable({ name: "phone", kind: "phone" });
    const fresh = device(server, "phone-2");
    expect(await fresh.sync.start()).toBe("join");
    await expect(fresh.sync.recover({ code: "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GG", name: "new phone", kind: "phone" })).rejects.toThrow();
    await fresh.sync.recover({ code: recoveryCode, name: "new phone", kind: "phone" });
    expect(fresh.sync.state()).toBe("on"); expect(fresh.store.get(id).title).toBe("Renew passport");
  });
});
