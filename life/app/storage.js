// Where the life graph is saved (R19): IndexedDB, which holds far more than localStorage and is
// written in the background. On first start the old localStorage data (version 1) is moved over;
// the old copy is left in place as a fallback. Without IndexedDB, localStorage is used as before.
import { localStorageBackend } from "./core/store.js";

const OLD_KEY = "life-archipelago-v1";
const req = (r) => new Promise((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });

export async function openSavedBackend({ idb = globalThis.indexedDB, ls = globalThis.localStorage, name = "life-archipelago-data" } = {}) {
  const fallback = () => ({ ...localStorageBackend(OLD_KEY), kind: "localStorage", migrated: false, flush: async () => {} });
  if (!idb) return fallback();
  let db;
  try {
    const open = idb.open(name, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("graph");
    db = await req(open);
  } catch (e) { return fallback(); }
  const get = async () => req(db.transaction("graph").objectStore("graph").get("main"));
  const put = (data) => new Promise((ok, fail) => { const tx = db.transaction("graph", "readwrite"); tx.objectStore("graph").put(data, "main"); tx.oncomplete = ok; tx.onerror = () => fail(tx.error); });
  let data = null, migrated = false;
  try { data = (await get()) || null; } catch (e) { return fallback(); }
  if (!data) {
    try { data = JSON.parse(ls?.getItem(OLD_KEY) || "null"); } catch (e) { data = null; }
    if (data) { migrated = true; await put(data); }
  }
  // Write behind: the store calls save() on every change; the last version is written a moment later.
  let pending = null, timer = 0, writing = Promise.resolve();
  const flush = () => { clearTimeout(timer); if (!pending) return writing; const d = pending; pending = null; writing = writing.then(() => put(d)).catch((e) => console.warn("save failed", e)); return writing; };
  if (typeof addEventListener === "function") { addEventListener("pagehide", flush); addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); }); }
  return {
    kind: "indexeddb", migrated, flush,
    load: () => (data ? JSON.parse(JSON.stringify(data)) : null),
    save: (d) => { pending = JSON.parse(JSON.stringify(d)); clearTimeout(timer); timer = setTimeout(flush, 250); },
  };
}
