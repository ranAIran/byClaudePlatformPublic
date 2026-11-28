// Claude as an approved, read-only device (data plan, phase C): asks to join the owner's vault,
// and after the owner approves it on their phone or computer (24 h, read-only), reads and decrypts.
//   NODE_USE_ENV_PROXY=1 node life/tools/claude-agent.mjs request   → prints the 6-digit code
//   NODE_USE_ENV_PROXY=1 node life/tools/claude-agent.mjs read      → after approval: what is in the vault
// Its keys and sign-in live only in AGENT_DIR (default: a folder in the session's scratch space),
// never in the repository. Nothing is ever written to the vault from here.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createStore, memoryBackend } from "../app/core/store.js";
import { createSync } from "../app/core/sync.js";
import { createSupabaseRemote } from "../app/supa.js";
import { b64, unb64, fingerprint } from "../app/core/crypto.js";

const DIR = process.env.AGENT_DIR || join(process.env.TMPDIR || "/tmp", "life-claude-agent");
mkdirSync(DIR, { recursive: true, mode: 0o700 });
const FILE = join(DIR, "agent-keys.json");
const RSA = { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
const subtle = crypto.subtle;

// A file-backed key store: CryptoKeys are saved as JWK/raw (the agent must survive restarts).
const disk = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
const save = () => writeFileSync(FILE, JSON.stringify(disk), { mode: 0o600 });
const keys = {
  async get(k) {
    if (!(k in disk) || disk[k] === null) return null;
    if (k === "deviceKeys") return { publicKey: disk[k].publicKey, privateKey: await subtle.importKey("jwk", disk[k].privateJwk, RSA, true, ["unwrapKey"]) };
    if (k === "dataKey") return subtle.importKey("raw", unb64(disk[k]), { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    return disk[k];
  },
  async set(k, v) {
    if (k === "deviceKeys") disk[k] = { publicKey: v.publicKey, privateJwk: await subtle.exportKey("jwk", v.privateKey) };
    else if (k === "dataKey") disk[k] = v ? b64(await subtle.exportKey("raw", v)) : null;
    else disk[k] = v;
    save();
  },
};
if (!disk.deviceKeys) { // extractable here (unlike the app) so the agent can be restarted
  const pair = await subtle.generateKey(RSA, true, ["wrapKey", "unwrapKey"]);
  await keys.set("deviceKeys", { publicKey: b64(await subtle.exportKey("spki", pair.publicKey)), privateKey: pair.privateKey });
}

const store = createStore(memoryBackend(), { device: "claude" });
const sync = createSync({ store, remote: createSupabaseRemote({ keys }), keys });
const cmd = process.argv[2] || "read";

if (cmd === "request") {
  const st = await sync.start();
  if (st === "on") console.log("Already approved. Run: read");
  else if (st === "pending") console.log("Waiting for approval. Code:", await sync.myCode());
  else if (st === "off") console.log("No vault yet: sync is not turned on anywhere.");
  else { const { code } = await sync.requestJoin({ name: "Claude (read-only)", kind: "agent" }); console.log("Request sent. Approve it in Sync & devices; the code is", code); }
} else {
  const st = await sync.start();
  if (st !== "on") { console.log("Not approved (state: " + st + ")." + (st === "pending" ? " Code: " + (await sync.myCode()) : "")); process.exit(0); }
  await sync.syncNow();
  const items = store.all().filter((n) => !n.system || n.title !== n.id);
  const mine = items.filter((n) => !n.system);
  console.log(`Vault opened (read-only). ${mine.length} items, ${store.journal().length} log entries, ${store.inputs().length} raw inputs.`);
  for (const n of mine) console.log(`- [${n.type}] ${n.title}${n.due ? "  due " + n.due : ""}${n.done ? "  (done)" : ""}  · in ${n.parent ?? "—"} · updated ${n.updated}`);
  const renamed = store.all().filter((n) => n.system && n.kind === "island");
  console.log("Places:", renamed.map((n) => n.title).join(", "));
  console.log("Profile:", JSON.stringify(store.profile().workWeek));
  for (const e of store.journal().slice(-10)) console.log(`  log ${e.at} ${e.op} ${e.id || e.key || ""} by ${e.by} on ${e.device}`);
  for (const e of store.inputs().slice(-10)) console.log(`  input ${e.at} [${e.kind}] ${e.text}`);
}
