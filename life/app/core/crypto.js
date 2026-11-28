// R53 · end-to-end encryption on the device (Web Crypto; the same code runs in browsers, the
// Android WebView and Node for the tests). The server only ever sees iv + ciphertext.
//  - data key: AES-GCM 256, encrypts every record, log entry and input.
//  - device keys: RSA-OAEP 2048; another device "wraps" (locks) the data key for this device.
//  - recovery code: 128 random bits on paper; PBKDF2 turns it into a key that locks a copy of the
//    data key, and into a proof whose hash the server keeps (to register a new owner device).
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder(), dec = new TextDecoder();

export const b64 = (bytes) => { let s = ""; const u = new Uint8Array(bytes); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
const hex = (bytes) => [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const sha256hex = async (text) => hex(await subtle().digest("SHA-256", enc.encode(text)));

export const newDataKey = () => subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

export async function encryptJSON(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value)));
  return { iv: b64(iv), ciphertext: b64(ct) };
}
export async function decryptJSON(key, { iv, ciphertext }) {
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ciphertext));
  return JSON.parse(dec.decode(pt));
}

// ---------- device keys ----------
const RSA = { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
export async function newDeviceKeys() {
  const pair = await subtle().generateKey(RSA, false, ["wrapKey", "unwrapKey"]); // the private key can never leave the device
  return { privateKey: pair.privateKey, publicKey: b64(await subtle().exportKey("spki", pair.publicKey)) };
}
export async function wrapFor(publicKeyB64, dataKey) {
  const pub = await subtle().importKey("spki", unb64(publicKeyB64), RSA, false, ["wrapKey"]);
  return b64(await subtle().wrapKey("raw", dataKey, pub, { name: "RSA-OAEP" }));
}
export const unwrapWith = async (privateKey, wrappedB64) =>
  subtle().unwrapKey("raw", unb64(wrappedB64), privateKey, { name: "RSA-OAEP" }, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

// Six digits from the device's public key: shown on the new device and on the approving one, so
// the owner can see they are approving the device in their hand.
export async function fingerprint(publicKeyB64) {
  const h = new Uint8Array(await subtle().digest("SHA-256", unb64(publicKeyB64)));
  const n = ((h[0] << 16) | (h[1] << 8) | h[2]) % 1e6;
  return String(n).padStart(6, "0").replace(/(\d{3})(\d{3})/, "$1 $2");
}

// ---------- recovery code on paper ----------
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I to misread
export function newRecoveryCode() {
  const r = crypto.getRandomValues(new Uint8Array(26)); // 26 × 5 bits = 130 bits
  const s = [...r].map((x) => ALPHA[x & 31]).join("");
  return s.match(/.{1,4}/g).join("-");
}
export const normalizeCode = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ITER = 150000;
async function recoveryMaterial(code, salt) {
  const base = await subtle().importKey("raw", enc.encode(normalizeCode(code)), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("life-archipelago:" + salt), iterations: ITER }, base, 512));
  const lockKey = await subtle().importKey("raw", bits.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return { lockKey, proof: hex(bits.slice(32)) };
}
// Lock a copy of the data key with the paper code. Returns the locked copy and the hash the server keeps.
export async function lockWithRecovery(code, salt, dataKey) {
  const { lockKey, proof } = await recoveryMaterial(code, salt);
  const raw = await subtle().exportKey("raw", dataKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, lockKey, raw);
  return { blob: JSON.stringify({ v: 1, iter: ITER, iv: b64(iv), ct: b64(ct) }), check: await sha256hex(proof) };
}
export async function openWithRecovery(code, salt, blob) {
  const { lockKey, proof } = await recoveryMaterial(code, salt);
  const b = JSON.parse(blob);
  const raw = await subtle().decrypt({ name: "AES-GCM", iv: unb64(b.iv) }, lockKey, unb64(b.ct)); // throws on a wrong code
  const dataKey = await subtle().importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  return { dataKey, proof };
}
