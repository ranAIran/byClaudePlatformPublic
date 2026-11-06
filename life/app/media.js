// Photos and scans live in IndexedDB (localStorage is far too small for images).
// Nodes keep only a small thumbnail and "idb:<key>" references to the full images.
const DB = "life-media", STORE = "images";
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return dbp;
}
async function tx(mode, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out && "result" in out ? out.result : out); t.onerror = () => rej(t.error); }); }
export async function putImage(dataUrl) { const key = "img_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); await tx("readwrite", (s) => s.put(dataUrl, key)); return "idb:" + key; }
export async function getImage(ref) { if (!ref) return null; if (!ref.startsWith("idb:")) return ref; return tx("readonly", (s) => s.get(ref.slice(4))); }
export async function deleteImages(refs = []) { for (const r of refs) if (r && r.startsWith("idb:")) await tx("readwrite", (s) => s.delete(r.slice(4))); }
export function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
export async function shrink(src, max = 1280, quality = 0.82) {
  const img = await loadImage(src); const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", quality);
}
export const thumb = (src) => shrink(src, 160, 0.7);
export function fileToDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
// Store a list of data URLs: returns { images: ["idb:…"], thumb: "data:…" }.
export async function storeImages(list) {
  const images = []; let th = null;
  for (const src of list) { const small = await shrink(src); images.push(await putImage(small)); if (!th) th = await thumb(small); }
  return { images, thumb: th };
}
