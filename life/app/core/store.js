// The life graph: every place, item, person, task, note and link is a node with a parent place.
// The store is synchronous and storage-agnostic: the web and Android apps pass a localStorage
// backend, the tests pass a memory backend.
import { parseCapture } from "./capture.js";
import { suggestPlaces } from "./places.js";
import { XP, levelFor } from "./xp.js";

export const SEED = [
  { id: "world", type: "place", kind: "world", title: "World", parent: null },
  { id: "bag", type: "place", kind: "bag", title: "Bag", parent: null },
  { id: "home", type: "place", kind: "island", title: "Home", parent: "world" },
  { id: "work", type: "place", kind: "island", title: "Work", parent: "world" },
  { id: "health", type: "place", kind: "island", title: "Health", parent: "world" },
  { id: "family", type: "place", kind: "island", title: "Family", parent: "world" },
  { id: "paperwork", type: "place", kind: "island", title: "Paperwork", parent: "world" },
  { id: "living", type: "place", kind: "room", title: "Living room", parent: "home" },
  { id: "kitchen", type: "place", kind: "room", title: "Kitchen", parent: "home" },
  { id: "bedroom", type: "place", kind: "room", title: "Bedroom", parent: "home" },
  { id: "office", type: "place", kind: "room", title: "Office", parent: "home" },
];

export function memoryBackend() {
  let saved = null;
  return { load: () => (saved ? JSON.parse(saved) : null), save: (data) => { saved = JSON.stringify(data); } };
}
export function localStorageBackend(key = "life-archipelago-v1") {
  return {
    load: () => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } },
    save: (data) => { try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.warn("save failed", e); } },
  };
}

let counter = 0;
const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().slice(0, 12) : Date.now().toString(36) + (counter++).toString(36));

export function createStore(backend, { now = () => new Date() } = {}) {
  let nodes = new Map();
  let state = { xp: 0, log: [] };
  const listeners = new Set();
  const stamp = () => now().toISOString();

  function seed() {
    nodes = new Map();
    for (const s of SEED) nodes.set(s.id, normalize({ ...s, system: true, created: stamp(), updated: stamp() }));
  }
  function normalize(n) {
    return {
      id: n.id, type: n.type || "note", title: n.title || "", parent: n.parent === undefined ? "bag" : n.parent,
      kind: n.kind ?? null, system: !!n.system, tags: n.tags ? [...n.tags] : [], due: n.due ?? null, done: !!n.done,
      effort: n.effort ?? 1, steps: n.steps ? n.steps.map((s) => ({ title: s.title, done: !!s.done })) : null,
      notes: n.notes ?? "", url: n.url ?? null, images: n.images ? [...n.images] : [], thumb: n.thumb ?? null, suggest: n.suggest ? [...n.suggest] : [],
      awarded: !!n.awarded, bossAwarded: !!n.bossAwarded, created: n.created || stamp(), updated: n.updated || stamp(),
    };
  }
  const persist = () => backend.save({ version: 1, nodes: [...nodes.values()], state });
  const emit = () => { persist(); listeners.forEach((f) => f()); };

  const loaded = backend.load();
  if (loaded && Array.isArray(loaded.nodes)) {
    for (const n of loaded.nodes) nodes.set(n.id, normalize(n));
    state = { xp: loaded.state?.xp || 0, log: loaded.state?.log || [] };
    for (const s of SEED) if (!nodes.has(s.id)) nodes.set(s.id, normalize({ ...s, system: true }));
  } else { seed(); persist(); }

  const api = {
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get: (id) => nodes.get(id) || null,
    all: () => [...nodes.values()],
    children: (pid) => [...nodes.values()].filter((n) => n.parent === pid),
    descendants(pid) { const out = []; const walk = (p) => { for (const c of api.children(p)) { out.push(c); walk(c.id); } }; walk(pid); return out; },
    path(id) { const out = []; let p = nodes.get(id)?.parent; while (p && p !== "world") { out.unshift(p); p = nodes.get(p)?.parent; } return out; },
    add(partial) { const n = normalize({ ...partial, id: partial.id || newId(), created: stamp(), updated: stamp() }); nodes.set(n.id, n); emit(); return n.id; },
    update(id, patch) { const n = nodes.get(id); if (!n) return; nodes.set(id, normalize({ ...n, ...patch, id, updated: stamp() })); emit(); },
    remove(id) { const n = nodes.get(id); if (!n || n.system) return; for (const c of api.children(id)) api.remove(c.id); nodes.delete(id); emit(); },
    capture(text) {
      const c = parseCapture(text, now());
      return api.add({ ...c, parent: "bag", suggest: suggestPlaces(text), notes: "" });
    },
    unplaced: () => api.children("bag"),
    place(id, pid) { api.update(id, { parent: pid, suggest: [] }); },
    search(q) {
      const s = String(q || "").trim().toLowerCase(); if (!s) return [];
      return [...nodes.values()].filter((n) => !n.system && [n.title, n.notes, n.url, ...(n.tags || [])].some((v) => v && String(v).toLowerCase().includes(s)));
    },
    xp: () => state.xp,
    level: () => levelFor(state.xp),
    log: () => [...state.log],
    award(points, why) { if (points <= 0) return 0; state.xp += points; state.log.push({ at: stamp(), points, why }); if (state.log.length > 500) state.log.shift(); return points; },
    complete(id) {
      const n = nodes.get(id); if (!n || n.done) return 0;
      let gained = 0;
      if (!n.awarded) gained = api.award(XP.perTask * (n.effort || 1), n.title);
      nodes.set(id, { ...n, done: true, awarded: true, updated: stamp() }); emit();
      return gained;
    },
    reopen(id) { const n = nodes.get(id); if (!n) return; nodes.set(id, { ...n, done: false, updated: stamp() }); emit(); },
    completeStep(id, i) {
      const n = nodes.get(id); if (!n || !n.steps || !n.steps[i] || n.steps[i].done) return 0;
      const steps = n.steps.map((s, k) => (k === i ? { ...s, done: true } : s));
      let gained = api.award(XP.perStep * (n.effort || 1), `${n.title}: ${n.steps[i].title}`);
      const finished = steps.every((s) => s.done);
      let boss = n.bossAwarded;
      if (finished && !boss) { gained += api.award(XP.bossBonus * (n.effort || 1), `${n.title}: quest complete`); boss = true; }
      nodes.set(id, { ...n, steps, done: finished || n.done, awarded: true, bossAwarded: boss, updated: stamp() }); emit();
      return gained;
    },
    openTasks(pid) { return api.descendants(pid).filter((n) => n.type === "task" && !n.done); },
    // Snapshot and restore, used by export/import.
    snapshot: () => ({ version: 1, nodes: [...nodes.values()].map((n) => ({ ...n })), state: { ...state, log: [...state.log] } }),
    restore(data, { merge = false } = {}) {
      if (!merge) { nodes = new Map(); }
      for (const n of data.nodes || []) nodes.set(n.id, normalize(n));
      for (const s of SEED) if (!nodes.has(s.id)) nodes.set(s.id, normalize({ ...s, system: true }));
      if (data.state && !merge) state = { xp: data.state.xp || 0, log: data.state.log || [] };
      emit();
    },
    reset() { seed(); state = { xp: 0, log: [] }; emit(); },
  };
  return api;
}
