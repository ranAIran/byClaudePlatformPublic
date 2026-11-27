// The life graph: every place, item, person, task, note and link is a node with a parent place.
// The store is synchronous and storage-agnostic: the web and Android apps pass a localStorage
// backend, the tests pass a memory backend.
import { parseCapture } from "./capture.js";
import { suggestPlaces } from "./places.js";
import { XP, levelFor } from "./xp.js";
import { validRepeat, nextDue, parseRepeat } from "./repeat.js";
import { isoDate } from "./capture.js";
import { parseGoal, artFor, spreadDates, STUCK_ACTION, STAKES } from "./goals.js";

export const SEED = [
  { id: "world", type: "place", kind: "world", title: "World", parent: null },
  { id: "bag", type: "place", kind: "bag", title: "Bag", parent: null },
  { id: "home", type: "place", kind: "island", title: "Home", parent: "world" },
  { id: "work", type: "place", kind: "island", title: "Work", parent: "world" },
  { id: "health", type: "place", kind: "island", title: "Health", parent: "world" },
  { id: "family", type: "place", kind: "island", title: "Family", parent: "world" },
  { id: "paperwork", type: "place", kind: "island", title: "Paperwork", parent: "world" },
  { id: "shopping", type: "place", kind: "island", title: "Shopping", parent: "world" },
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

// R43 · a goal's own parts. Only the basic card (R49): deeper tools are added per goal later.
const goalOf = (g) => g ? {
  time: g.time ?? null, object: g.object || "star", scene: g.scene || "room",
  step: g.step?.title ? { title: String(g.step.title), at: g.step.at ?? null, day: g.step.day ?? null } : null, started: g.started ?? null, photo: g.photo ?? null,
  path: (g.path || []).map((x) => ({ title: String(x.title), due: x.due ?? null, done: !!x.done, fixed: !!x.fixed, object: x.object || "star", scene: x.scene || "room" })), // R44, earliest first
  obstacle: g.obstacle?.if ? { if: String(g.obstacle.if), then: String(g.obstacle.then || "") } : null,
  asked: g.asked ?? null, stakes: STAKES.includes(g.stakes) ? g.stakes : null, released: g.released ?? null, // R45
} : null;

let counter = 0;
const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().slice(0, 12) : Date.now().toString(36) + (counter++).toString(36));

export function createStore(backend, { now = () => new Date() } = {}) {
  let nodes = new Map();
  let graves = new Map(); // id → when it was deleted (R19 tombstones, kept 30 days for a later sync)
  let state = { xp: 0, log: [], coins: 0, decor: [] };
  const listeners = new Set();
  const stamp = () => now().toISOString();

  function seed() {
    nodes = new Map();
    for (const s of SEED) nodes.set(s.id, normalize({ ...s, system: true, created: stamp(), updated: stamp() }));
  }
  function normalize(n) {
    return {
      id: n.id, type: n.type || "note", title: n.title || "", parent: n.parent === undefined ? "bag" : n.parent,
      kind: n.kind ?? null, system: !!n.system, custom: !!n.custom, tags: n.tags ? [...n.tags] : [], due: n.due ?? null, done: !!n.done,
      effort: n.effort ?? 1, steps: n.steps ? n.steps.map((s) => ({ title: s.title, done: !!s.done })) : null,
      notes: n.notes ?? "", url: n.url ?? null, images: n.images ? [...n.images] : [], thumb: n.thumb ?? null, suggest: n.suggest ? [...n.suggest] : [],
      awarded: !!n.awarded, bossAwarded: !!n.bossAwarded, repeat: validRepeat(n.repeat), goal: goalOf(n.goal), created: n.created || stamp(), updated: n.updated || stamp(),
    };
  }
  const graveList = () => [...graves].map(([id, at]) => ({ id, at }));
  const persist = () => backend.save({ version: 2, nodes: [...nodes.values()], deleted: graveList(), state });
  const keepGraves = (list) => { graves = new Map(); const cut = now().getTime() - 30 * 864e5; for (const g of list || []) if (Date.parse(g.at) > cut) graves.set(g.id, g.at); };
  const emit = () => { persist(); listeners.forEach((f) => f()); };

  const loaded = backend.load();
  if (loaded && Array.isArray(loaded.nodes)) {
    for (const n of loaded.nodes) nodes.set(n.id, normalize(n));
    state = { xp: loaded.state?.xp || 0, log: loaded.state?.log || [], coins: loaded.state?.coins || 0, decor: loaded.state?.decor || [] };
    keepGraves(loaded.deleted);
    for (const s of SEED) if (!nodes.has(s.id)) nodes.set(s.id, normalize({ ...s, system: true }));
  } else { seed(); persist(); }

  // The next occurrence of a repeating task: open, unpaid, steps undone, next date.
  const again = (n) => ({ ...n, done: false, awarded: false, bossAwarded: false, due: nextDue(n.due, n.repeat, isoDate(now())), steps: n.steps ? n.steps.map((st) => ({ ...st, done: false })) : null, updated: stamp() });
  // R44 · stations keep the dates the owner set; the rest spread back from the deadline.
  function respread(id) {
    const n = nodes.get(id); if (!n?.goal) return;
    const dates = spreadDates(n.goal.path.length, isoDate(now()), n.due);
    nodes.set(id, normalize({ ...n, goal: { ...n.goal, path: n.goal.path.map((x, k) => (x.fixed ? x : { ...x, due: dates[k] })) } }));
  }
  function setPath(id, path) { const n = nodes.get(id); nodes.set(id, normalize({ ...n, goal: { ...n.goal, path }, updated: stamp() })); respread(id); emit(); }
  const api = {
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get: (id) => nodes.get(id) || null,
    all: () => [...nodes.values()],
    children: (pid) => [...nodes.values()].filter((n) => n.parent === pid),
    descendants(pid) { const out = []; const walk = (p) => { for (const c of api.children(p)) { out.push(c); walk(c.id); } }; walk(pid); return out; },
    path(id) { const out = []; let p = nodes.get(id)?.parent; while (p && p !== "world") { out.unshift(p); p = nodes.get(p)?.parent; } return out; },
    add(partial) { const n = normalize({ ...partial, id: partial.id || newId(), created: partial.created || stamp(), updated: stamp() }); nodes.set(n.id, n); graves.delete(n.id); emit(); return n.id; },
    update(id, patch) { const n = nodes.get(id); if (!n) return; nodes.set(id, normalize({ ...n, ...patch, id, updated: stamp() })); emit(); },
    remove(id) { const n = nodes.get(id); if (!n || n.system) return; for (const c of api.children(id)) api.remove(c.id); nodes.delete(id); graves.set(id, stamp()); emit(); },
    capture(text) {
      const { repeat, text: rest } = parseRepeat(text);
      const c = parseCapture(rest, now());
      if (repeat) { c.type = "task"; if (!c.due) c.due = nextDue(isoDate(now()), repeat, isoDate(now())); }
      return api.add({ ...c, repeat, parent: "bag", suggest: suggestPlaces(text), notes: "" });
    },
    // R43 · Goals Board
    addGoal(text) {
      const g = parseGoal(text, now()); if (!g.ok) return g;
      const id = api.add({ type: "goal", title: g.title, due: g.due, parent: null, goal: { time: g.time, object: g.object, scene: g.scene } });
      return { ok: true, id };
    },
    setGoalStep(id, title, at = null) { const n = nodes.get(id); if (!n?.goal) return; const t = String(title || "").trim(); api.update(id, { goal: { ...n.goal, step: t ? { title: t, at: at || null, day: isoDate(now()) } : null, started: null } }); },
    // R44 · plan backward: each answer to "what must be true just before?" goes in front.
    planBefore(id, text) {
      const n = nodes.get(id), t = String(text || "").trim(); if (!n?.goal || !t) return;
      setPath(id, [{ title: t, done: false, ...artFor(t) }, ...n.goal.path]);
    },
    setStationDue(id, i, due) { const n = nodes.get(id); if (!n?.goal?.path[i]) return; setPath(id, n.goal.path.map((x, k) => (k === i ? { ...x, due, fixed: !!due } : x))); },
    removeStation(id, i) { const n = nodes.get(id); if (!n?.goal?.path[i]) return; setPath(id, n.goal.path.filter((_, k) => k !== i)); },
    completeStation(id, i) {
      const n = nodes.get(id), st = n?.goal?.path[i]; if (!st || st.done) return 0;
      const gained = api.award(XP.perStep, `${n.title}: ${st.title}`); state.coins += 1;
      api.update(id, { goal: { ...n.goal, path: n.goal.path.map((x, k) => (k === i ? { ...x, done: true } : x)) } });
      return gained;
    },
    nowStep(id, text) { api.setGoalStep(id, text, null); },
    setObstacle(id, ifText, thenText) { const n = nodes.get(id); if (!n?.goal) return; const a = String(ifText || "").trim(); api.update(id, { goal: { ...n.goal, obstacle: a ? { if: a, then: String(thenText || "").trim() } : null } }); },
    // R45 · stuck questions: each answer is an action; asked at most once a day.
    markAsked(id) { const n = nodes.get(id); if (n?.goal) api.update(id, { goal: { ...n.goal, asked: isoDate(now()) } }); },
    answerStuck(id, answer, value = "") {
      const n = nodes.get(id), action = STUCK_ACTION[answer]; if (!n?.goal || !action) return { ok: false };
      let g = { ...n.goal, asked: isoDate(now()) };
      const v = String(value || "").trim(), step = g.step;
      if (action === "addBefore" && v) { if (step) g.path = [{ title: step.title, done: false, ...artFor(step.title) }, ...g.path]; g.step = { title: v, at: null, day: isoDate(now()) }; g.started = null; }
      if (action === "smaller" && step && !step.title.startsWith("2′ · ")) g.step = { ...step, title: "2′ · " + step.title };
      if (action === "reschedule" && /^\d{2}:\d{2}$/.test(v) && step) {
        const [hh, mm] = v.split(":").map(Number), d = now(), later = hh * 60 + mm > d.getHours() * 60 + d.getMinutes();
        g.step = { ...step, at: v, day: isoDate(later ? d : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) };
      }
      if (action === "ask" && v) { g.step = { title: v, at: null, day: isoDate(now()) }; g.started = null; }
      if (action === "release") g.released = stamp();
      nodes.set(id, normalize({ ...n, goal: g, updated: stamp() })); if (action === "addBefore") respread(id); emit();
      return { ok: true, action };
    },
    setStakes(id, v) { const n = nodes.get(id); if (n?.goal) api.update(id, { goal: { ...n.goal, stakes: v } }); },
    startGoal(id) { const n = nodes.get(id); if (!n?.goal) return; api.update(id, { goal: { ...n.goal, started: stamp() } }); },
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
      if (!n.awarded) { gained = api.award(XP.perTask * (n.effort || 1), n.title); state.coins += 1; }
      if (n.repeat && n.due) nodes.set(id, again(n)); // a repeating task comes back with its next date
      else nodes.set(id, { ...n, done: true, awarded: true, updated: stamp() });
      emit();
      return gained;
    },
    reopen(id) { const n = nodes.get(id); if (!n) return; nodes.set(id, { ...n, done: false, updated: stamp() }); emit(); },
    completeStep(id, i) {
      const n = nodes.get(id); if (!n || !n.steps || !n.steps[i] || n.steps[i].done) return 0;
      const steps = n.steps.map((s, k) => (k === i ? { ...s, done: true } : s));
      let gained = api.award(XP.perStep * (n.effort || 1), `${n.title}: ${n.steps[i].title}`); state.coins += 1;
      const finished = steps.every((s) => s.done);
      let boss = n.bossAwarded;
      if (finished && !boss) { gained += api.award(XP.bossBonus * (n.effort || 1), `${n.title}: quest complete`); state.coins += 5; boss = true; }
      if (finished && n.repeat && n.due) nodes.set(id, again({ ...n, steps }));
      else nodes.set(id, { ...n, steps, done: finished || n.done, awarded: true, bossAwarded: boss, updated: stamp() });
      emit();
      return gained;
    },
    openTasks(pid) { return api.descendants(pid).filter((n) => n.type === "task" && !n.done); },
    // Snapshot and restore, used by export/import.
    snapshot: () => ({ version: 2, nodes: [...nodes.values()].map((n) => ({ ...n })), deleted: graveList(), state: { ...state, log: [...state.log], decor: state.decor.map((d) => ({ ...d })) } }),
    restore(data, { merge = false } = {}) {
      if (!merge) { nodes = new Map(); }
      for (const n of data.nodes || []) nodes.set(n.id, normalize(n));
      for (const s of SEED) if (!nodes.has(s.id)) nodes.set(s.id, normalize({ ...s, system: true }));
      if (data.state && !merge) state = { xp: data.state.xp || 0, log: data.state.log || [], coins: data.state.coins || 0, decor: data.state.decor || [] };
      if (!merge) keepGraves(data.deleted);
      emit();
    },
    // R36 · the wallet and the decorations bought with it.
    coins: () => state.coins,
    earnCoins(n, why) { if (n > 0) { state.coins += n; emit(); } return n; },
    spendCoins(n, why) { if (n > state.coins) return false; state.coins -= n; state.log.push({ at: stamp(), coins: -n, why }); emit(); return true; },
    decorations: () => state.decor.map((d) => ({ ...d })),
    decorate(d) { state.decor.push({ district: d.district, slot: d.slot, item: d.item }); emit(); },
    reset() { seed(); state = { xp: 0, log: [], coins: 0, decor: [] }; emit(); },
  };
  return api;
}
