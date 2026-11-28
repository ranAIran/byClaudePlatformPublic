// R53 · pairing and R54 · sync. Talks to a "remote" (the Supabase REST client in app/supa.js, or an
// in-memory server in the tests) and keeps its keys in a "keystore" (IndexedDB in the app).
// Everything that leaves the device is encrypted with the data key first.
import { newDataKey, encryptJSON, decryptJSON, newDeviceKeys, wrapFor, unwrapWith, fingerprint, newRecoveryCode, lockWithRecovery, openWithRecovery } from "./crypto.js";

export const SYNC_STATES = ["off", "join", "pending", "on", "revoked"];
const maxOf = (rows, col, was) => rows.reduce((m, r) => (r[col] > (m || "") ? r[col] : m), was);

export function createSync({ store, remote, keys }) {
  let state = "off", vault = null, dataKey = null, me = null;

  async function deviceKeys() {
    let k = await keys.get("deviceKeys");
    if (!k) { k = await newDeviceKeys(); await keys.set("deviceKeys", k); }
    return k;
  }

  async function start() {
    await remote.signIn();
    vault = await remote.theVault();
    if (!vault) { state = "off"; return state; }
    me = await remote.myDevice();
    if (me && me.vault_id === vault && me.approved_at && !me.revoked_at && me.wrapped_key) {
      dataKey = (await keys.get("dataKey")) || (await unwrapWith((await deviceKeys()).privateKey, me.wrapped_key));
      await keys.set("dataKey", dataKey); state = "on";
    } else if (me?.revoked_at) { state = "revoked"; dataKey = null; await keys.set("dataKey", null); }
    else state = (await remote.myRequest()) ? "pending" : "join";
    return state;
  }

  // The first device: makes the vault and the data key, and the paper recovery code (shown once).
  async function enable({ name, kind }) {
    await remote.signIn();
    if (await remote.theVault()) throw new Error("a vault already exists: join it instead");
    const k = await deviceKeys();
    dataKey = await newDataKey();
    vault = await remote.createVault();
    me = await remote.addDevice({ id: remote.uid(), vault_id: vault, name, kind, role: "owner", public_key: k.publicKey, wrapped_key: await wrapFor(k.publicKey, dataKey), approved_at: new Date().toISOString() });
    const recoveryCode = newRecoveryCode();
    const { blob, check } = await lockWithRecovery(recoveryCode, vault, dataKey);
    await remote.updateVault(vault, { recovery_wrapped_key: blob, recovery_check: check });
    await keys.set("dataKey", dataKey); state = "on";
    await syncNow();
    return { recoveryCode };
  }

  // A new device asks to join; the code on its screen must match the one on the approving device.
  async function requestJoin({ name, kind }) {
    await remote.signIn();
    vault = await remote.theVault(); if (!vault) throw new Error("no vault yet");
    const k = await deviceKeys(), code = await fingerprint(k.publicKey);
    await remote.requestPairing({ vault_id: vault, name, kind, public_key: k.publicKey, code: code.replace(" ", "") });
    state = "pending"; return { code };
  }
  async function myCode() { return fingerprint((await deviceKeys()).publicKey); }

  // On an approved phone or computer: who is waiting, with the code computed from their key.
  async function pending() {
    const rows = await remote.pairingRequests(vault);
    const out = [];
    for (const r of rows.filter((x) => x.status === "pending" && new Date(x.expires_at) > new Date())) out.push({ ...r, check: await fingerprint(r.public_key) });
    return out;
  }
  async function approve(request, { agent = false, hours = 24 } = {}) {
    if (state !== "on") throw new Error("only an approved device can approve");
    const check = await fingerprint(request.public_key);
    if (check.replace(" ", "") !== String(request.code).replace(" ", "")) throw new Error("the code does not match this device's key");
    await remote.addDevice({ id: request.device_uid, vault_id: vault, name: request.name, kind: agent ? "agent" : request.kind, role: agent ? "agent" : "member",
      can_write: !agent, public_key: request.public_key, wrapped_key: await wrapFor(request.public_key, dataKey), approved_at: new Date().toISOString(), approved_by: remote.uid(),
      expires_at: agent ? new Date(Date.now() + hours * 36e5).toISOString() : null });
    await remote.answerPairing(request.id, "approved");
  }
  const reject = (request) => remote.answerPairing(request.id, "rejected");
  const devices = () => remote.devices(vault);
  const revoke = (deviceId) => remote.updateDevice(deviceId, { revoked_at: new Date().toISOString() });

  // Every device lost: the paper code opens the locked copy of the data key and proves ownership.
  async function recover({ code, name, kind }) {
    await remote.signIn();
    const blob = await remote.recoveryBlob(); if (!blob?.recovery_wrapped_key) throw new Error("no vault to recover");
    const opened = await openWithRecovery(code, blob.vault_id, blob.recovery_wrapped_key);
    const k = await deviceKeys();
    vault = await remote.recoverDevice({ proof: opened.proof, name, kind, public_key: k.publicKey, wrapped_key: await wrapFor(k.publicKey, opened.dataKey) });
    dataKey = opened.dataKey; await keys.set("dataKey", dataKey); state = "on";
    await syncNow();
  }

  // Push what changed here, then pull what changed elsewhere (by the server's clock).
  let busy = null;
  function syncNow() { if (!busy) busy = run().finally(() => { busy = null; }); return busy; }
  async function run() {
    if (state === "pending") await start();
    if (state !== "on") return { pushed: 0, pulled: 0, state };
    const out = store.syncOutbox(), dev = store.device();
    const rec = [];
    for (const x of out.nodes) rec.push({ vault_id: vault, kind: "node", id: x.id, updated_at: x.updated, device: dev, deleted: x.deleted, ...(await encryptJSON(dataKey, x.deleted ? {} : x.node)) });
    if (out.profile) rec.push({ vault_id: vault, kind: "profile", id: "main", updated_at: out.profile.at, device: dev, deleted: false, ...(await encryptJSON(dataKey, out.profile)) });
    if (out.state) rec.push({ vault_id: vault, kind: "state", id: "main", updated_at: out.state.at, device: dev, deleted: false, ...(await encryptJSON(dataKey, out.state)) });
    const jr = []; for (const e of out.journal) jr.push({ vault_id: vault, device: e.device, seq: e.seq, at: e.at, op: e.op, record_id: e.id || e.key || null, by_who: e.by, ...(await encryptJSON(dataKey, e)) });
    const ir = []; for (const e of out.inputs) ir.push({ vault_id: vault, device: e.device, seq: e.seq, at: e.at, ...(await encryptJSON(dataKey, e)) });
    if (rec.length) await remote.upsert("records", rec);
    if (jr.length) await remote.upsert("journal", jr);
    if (ir.length) await remote.upsert("inputs", ir);
    store.syncSent(out);

    const c = store.syncCursor();
    const [rr, rj, ri] = await Promise.all([remote.pull("records", vault, "synced_at", c.records), remote.pull("journal", vault, "received_at", c.journal), remote.pull("inputs", vault, "received_at", c.inputs)]);
    const inbound = { nodes: [], profile: null, state: null, journal: [], inputs: [] };
    for (const r of rr) {
      if (r.device === dev) continue;
      const v = await decryptJSON(dataKey, r);
      if (r.kind === "node") inbound.nodes.push({ id: r.id, updated: r.deleted ? new Date(r.updated_at).toISOString() : v.updated, deleted: r.deleted, node: r.deleted ? null : v });
      if (r.kind === "profile") inbound.profile = v;
      if (r.kind === "state") inbound.state = v;
    }
    for (const r of rj) if (r.device !== dev) inbound.journal.push(await decryptJSON(dataKey, r));
    for (const r of ri) if (r.device !== dev) inbound.inputs.push(await decryptJSON(dataKey, r));
    const pulled = store.applyRemote(inbound);
    store.setSyncCursor({ records: maxOf(rr, "synced_at", c.records), journal: maxOf(rj, "received_at", c.journal), inputs: maxOf(ri, "received_at", c.inputs) });
    return { pushed: rec.length + jr.length + ir.length, pulled, state };
  }

  return { start, enable, requestJoin, myCode, pending, approve, reject, devices, revoke, recover, syncNow, state: () => state, vault: () => vault };
}
