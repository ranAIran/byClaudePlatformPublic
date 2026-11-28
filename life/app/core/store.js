// The life graph: every place, item, person, task, note and link is a node with a parent place.
// The store is synchronous and storage-agnostic: the web and Android apps pass a localStorage
// backend, the tests pass a memory backend.
import { parseCapture } from "./capture.js";
import { suggestPlaces } from "./places.js";
import { XP, levelFor } from "./xp.js";
import { validRepeat, nextDue, parseRepeat } from "./repeat.js";
import { isoDate } from "./capture.js";
import { DEFAULT_PROFILE, validProfile } from "./profile.js";
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

export function createStore(backend, { now = () => new Date(), device = "dev-" + newId() } = {}) {
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
  // R51 · the action log and the raw inputs. Every add, update and delete is found by comparing each
  // node with how it looked at the last save, so no way of changing things can skip the log.
  let journal = [], inputs = [], seq = 0, actor = "me", shadow = new Map(), stateShadow = {};
  let profile = {}, suggestions = []; // R52
  // R54 · what still has to go to the server, and how far this device has read from it.
  let dirty = new Set(), metaDirty = new Set(), pushed = { journal: 0, inputs: 0 }, cursor = { records: null, journal: null, inputs: null }, profileAt = null, stateAt = null;
  const STATE_KEYS = ["xp", "coins", "decor"], SKIP = new Set(["id", "created", "updated"]);
  const stateNow = () => Object.fromEntries(STATE_KEYS.map((k) => [k, JSON.stringify(state[k])]));
  const resetShadow = () => { shadow = new Map([...nodes].map(([id, n]) => [id, JSON.stringify(n)])); stateShadow = stateNow(); };
  const entry = (e) => { journal.push({ seq: ++seq, at: stamp(), by: actor, device, ...e }); };
  function record() {
    for (const [id, n] of nodes) {
      const was = shadow.get(id), is = JSON.stringify(n); if (was === is) continue;
      dirty.add(id);
      if (!was) { const after = {}; for (const [k, v] of Object.entries(n)) if (!SKIP.has(k)) after[k] = v; entry({ op: "add", id, type: n.type, fields: Object.keys(after), after }); }
      else {
        const prev = JSON.parse(was), fields = Object.keys(n).filter((k) => !SKIP.has(k) && JSON.stringify(n[k]) !== JSON.stringify(prev[k]));
        if (fields.length) entry({ op: "update", id, type: n.type, fields, after: Object.fromEntries(fields.map((k) => [k, n[k]])) });
      }
    }
    for (const [id, was] of shadow) if (!nodes.has(id)) { dirty.add(id); const p = JSON.parse(was); entry({ op: "remove", id, type: p.type, after: { title: p.title } }); }
    const st = stateNow(), sf = STATE_KEYS.filter((k) => st[k] !== stateShadow[k]);
    if (sf.length) { metaDirty.add("state"); stateAt = stamp(); }
    if (sf.length) entry({ op: "state", fields: sf, after: Object.fromEntries(sf.map((k) => [k, state[k]])) });
    resetShadow();
  }
  const graveList = () => [...graves].map(([id, at]) => ({ id, at }));
  const syncState = () => ({ dirty: [...dirty], metaDirty: [...metaDirty], pushed, cursor, profileAt, stateAt });
  const persist = () => backend.save({ version: 3, nodes: [...nodes.values()], deleted: graveList(), state, profile, suggestions, journal, inputs, sync: syncState() });
  const profileChanged = () => { metaDirty.add("profile"); profileAt = stamp(); };
  const keepGraves = (list) => { graves = new Map(); const cut = now().getTime() - 30 * 864e5; for (const g of list || []) if (Date.parse(g.at) > cut) graves.set(g.id, g.at); };
  const emit = () => { record(); persist(); listeners.forEach((f) => f()); };

  const loaded = backend.load();
  if (loaded && Array.isArray(loaded.nodes)) {
    for (const n of loaded.nodes) nodes.set(n.id, normalize(n));
    state = { xp: loaded.state?.xp || 0, log: loaded.state?.log || [], coins: loaded.state?.coins || 0, decor: loaded.state?.decor || [] };
    keepGraves(loaded.deleted);
    for (const s of SEED) if (!nodes.has(s.id)) nodes.set(s.id, normalize({ ...s, system: true }));
    profile = loaded.profile || {}; suggestions = loaded.suggestions || []; journal = loaded.journal || []; inputs = loaded.inputs || [];
    seq = Math.max(0, ...journal.filter((e) => e.device === device).map((e) => e.seq || 0), ...inputs.filter((e) => e.device === device).map((e) => e.seq || 0));
    const sy = loaded.sync || {}; dirty = new Set(sy.dirty || []); metaDirty = new Set(sy.metaDirty || []); pushed = { journal: 0, inputs: 0, ...(sy.pushed || {}) }; cursor = { records: null, journal: null, inputs: null, ...(sy.cursor || {}) }; profileAt = sy.profileAt || null; stateAt = sy.stateAt || null;
    resetShadow();
    if ((loaded.version || 1) < 3) entry({ op: "migrate", from: loaded.version || 1 });
  } else { seed(); resetShadow(); persist(); }

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
    capture(text, { source = "text" } = {}) {
      const id = api.captureNode(text); api.input(source, text, id); return id;
    },
    captureNode(text) {
      const { repeat, text: rest } = parseRepeat(text);
      const c = parseCapture(rest, now());
      if (repeat) { c.type = "task"; if (!c.due) c.due = nextDue(isoDate(now()), repeat, isoDate(now())); }
      return api.add({ ...c, repeat, parent: "bag", suggest: suggestPlaces(text), notes: "" });
    },
    // R43 · Goals Board
    addGoal(text) {
      const g = parseGoal(text, now()); if (!g.ok) { api.input("goal", text, null); return g; }
      const id = api.add({ type: "goal", title: g.title, due: g.due, parent: null, goal: { time: g.time, object: g.object, scene: g.scene } });
      api.input("goal", text, id);
      return { ok: true, id };
    },
    setGoalStep(id, title, at = null) { const n = nodes.get(id); if (!n?.goal) return; if (String(title || "").trim()) api.input("step", title, id); const t = String(title || "").trim(); api.update(id, { goal: { ...n.goal, step: t ? { title: t, at: at || null, day: isoDate(now()) } : null, started: null } }); },
    // R44 · plan backward: each answer to "what must be true just before?" goes in front.
    planBefore(id, text) {
      const n = nodes.get(id), t = String(text || "").trim(); if (!n?.goal || !t) return;
      api.input("plan", text, id);
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
    setObstacle(id, ifText, thenText) { const n = nodes.get(id); if (!n?.goal) return; api.input("obstacle", `${ifText || ""} → ${thenText || ""}`, id); const a = String(ifText || "").trim(); api.update(id, { goal: { ...n.goal, obstacle: a ? { if: a, then: String(thenText || "").trim() } : null } }); },
    // R45 · stuck questions: each answer is an action; asked at most once a day.
    markAsked(id) { const n = nodes.get(id); if (n?.goal) api.update(id, { goal: { ...n.goal, asked: isoDate(now()) } }); },
    answerStuck(id, answer, value = "") {
      const n = nodes.get(id), action = STUCK_ACTION[answer]; if (!n?.goal || !action) return { ok: false };
      api.input("stuck", value ? `${answer}: ${value}` : answer, id);
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
    snapshot: () => JSON.parse(JSON.stringify({ version: 3, nodes: [...nodes.values()], deleted: graveList(), state, profile, suggestions, journal, inputs })),
    restore(data, { merge = false } = {}) {
      if (!merge) { nodes = new Map(); }
      for (const n of data.nodes || []) nodes.set(n.id, normalize(n));
      for (const s of SEED) if (!nodes.has(s.id)) nodes.set(s.id, normalize({ ...s, system: true }));
      if (data.state && !merge) state = { xp: data.state.xp || 0, log: data.state.log || [], coins: data.state.coins || 0, decor: data.state.decor || [] };
      if (!merge) { keepGraves(data.deleted); profile = data.profile || {}; suggestions = data.suggestions || []; journal = data.journal ? [...data.journal] : journal; inputs = data.inputs ? [...data.inputs] : inputs; seq = Math.max(seq, ...journal.map((e) => e.seq || 0), ...inputs.map((e) => e.seq || 0)); }
      resetShadow(); entry({ op: "restore", merge: !!merge, nodes: (data.nodes || []).length });
      emit();
    },
    // R36 · the wallet and the decorations bought with it.
    coins: () => state.coins,
    earnCoins(n, why) { if (n > 0) { state.coins += n; emit(); } return n; },
    spendCoins(n, why) { if (n > state.coins) return false; state.coins -= n; state.log.push({ at: stamp(), coins: -n, why }); emit(); return true; },
    decorations: () => state.decor.map((d) => ({ ...d })),
    decorate(d) { state.decor.push({ district: d.district, slot: d.slot, item: d.item }); emit(); },
    reset() { seed(); state = { xp: 0, log: [], coins: 0, decor: [] }; profile = {}; suggestions = []; resetShadow(); entry({ op: "reset" }); emit(); },
    // R51 · who is acting (me, claude, app), the log and the raw inputs.
    as(who) { actor = String(who || "me"); },
    device: () => device,
    journal: () => journal.map((e) => ({ ...e })),
    inputs: () => inputs.map((e) => ({ ...e })),
    input(kind, text, result = null) { inputs.push({ seq: ++seq, at: stamp(), kind: String(kind), text: String(text ?? ""), result: result ?? null, device, by: actor }); persist(); },
    // R52 · the profile: defaults until set; every earlier value kept; learned values wait for approval.
    profile: () => JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(DEFAULT_PROFILE).map((k) => [k, profile[k] ? profile[k].value : DEFAULT_PROFILE[k]])))),
    profileEntry: (k) => profile[k] ? JSON.parse(JSON.stringify(profile[k])) : (k in DEFAULT_PROFILE ? { value: JSON.parse(JSON.stringify(DEFAULT_PROFILE[k])), source: "default", at: null, history: [] } : null),
    setProfile(key, value, { source = "me" } = {}) {
      if (!validProfile(key, value)) return { ok: false, error: "invalid" };
      const was = profile[key], v = JSON.parse(JSON.stringify(value));
      profile[key] = { value: v, source, at: stamp(), history: was ? [...was.history, { value: was.value, source: was.source, at: was.at }] : [] };
      entry({ op: "profile", key, source, after: { [key]: v } }); profileChanged(); persist(); listeners.forEach((f) => f());
      return { ok: true };
    },
    suggestions: () => JSON.parse(JSON.stringify(suggestions)),
    suggestProfile(key, value, reason = "") { if (!validProfile(key, value)) return null; const id = newId(); suggestions.push({ id, key, value, reason, at: stamp() }); profileChanged(); persist(); return id; },
    acceptSuggestion(id) { const x = suggestions.find((s) => s.id === id); if (!x) return; suggestions = suggestions.filter((s) => s.id !== id); api.setProfile(x.key, x.value, { source: "learned" }); },
    rejectSuggestion(id) { suggestions = suggestions.filter((s) => s.id !== id); profileChanged(); persist(); },
    // R54 · sync: what this device has to send, marking it sent, and taking in what others sent.
    syncOutbox() {
      const graveAt = new Map(graves);
      const nodesOut = [...dirty].map((id) => nodes.has(id) ? { id, updated: nodes.get(id).updated, deleted: false, node: JSON.parse(JSON.stringify(nodes.get(id))) } : { id, updated: graveAt.get(id) || stamp(), deleted: true, node: null });
      return {
        nodes: nodesOut,
        profile: metaDirty.has("profile") ? { at: profileAt || stamp(), profile: JSON.parse(JSON.stringify(profile)), suggestions: JSON.parse(JSON.stringify(suggestions)) } : null,
        state: metaDirty.has("state") ? { at: stateAt || stamp(), state: JSON.parse(JSON.stringify({ xp: state.xp, coins: state.coins, decor: state.decor, log: state.log })) } : null,
        journal: journal.filter((e) => e.device === device && e.seq > pushed.journal).map((e) => ({ ...e })),
        inputs: inputs.filter((e) => e.device === device && e.seq > pushed.inputs).map((e) => ({ ...e })),
      };
    },
    syncSent(out) {
      for (const x of out.nodes) { const n = nodes.get(x.id); if (x.deleted ? !n : n && n.updated === x.updated) dirty.delete(x.id); }
      if (out.profile && profileAt === out.profile.at) metaDirty.delete("profile");
      if (out.state && stateAt === out.state.at) metaDirty.delete("state");
      if (out.journal.length) pushed.journal = Math.max(pushed.journal, ...out.journal.map((e) => e.seq));
      if (out.inputs.length) pushed.inputs = Math.max(pushed.inputs, ...out.inputs.map((e) => e.seq));
      persist();
    },
    syncCursor: () => ({ ...cursor }),
    setSyncCursor(c) { cursor = { ...cursor, ...c }; persist(); },
    syncPending: () => dirty.size + metaDirty.size + journal.filter((e) => e.device === device && e.seq > pushed.journal).length + inputs.filter((e) => e.device === device && e.seq > pushed.inputs).length,
    // Newest wins per record. The log and inputs are merged by (device, seq). Taking in remote changes
    // adds nothing to this device's own log: the device that made them already logged them.
    applyRemote({ nodes: rn = [], profile: rp = null, state: rs = null, journal: rj = [], inputs: ri = [] } = {}) {
      let changed = 0;
      for (const x of rn) {
        const local = nodes.get(x.id);
        if (x.deleted) { if (local && !local.system && local.updated <= x.updated) { nodes.delete(x.id); graves.set(x.id, x.updated); dirty.delete(x.id); changed++; } }
        else if (!local || local.updated < x.updated) { if (graves.has(x.id) && graves.get(x.id) >= x.updated) continue; nodes.set(x.id, normalize(x.node)); graves.delete(x.id); dirty.delete(x.id); changed++; }
      }
      if (rp && (!profileAt || rp.at > profileAt)) { profile = rp.profile || {}; suggestions = rp.suggestions || []; profileAt = rp.at; metaDirty.delete("profile"); changed++; }
      if (rs && (!stateAt || rs.at > stateAt)) { state = { ...state, ...rs.state }; stateAt = rs.at; metaDirty.delete("state"); changed++; }
      const key = (e) => e.device + "#" + e.seq;
      const haveJ = new Set(journal.map(key)), haveI = new Set(inputs.map(key));
      for (const e of rj) if (!haveJ.has(key(e))) { journal.push(e); haveJ.add(key(e)); changed++; }
      for (const e of ri) if (!haveI.has(key(e))) { inputs.push(e); haveI.add(key(e)); changed++; }
      const byTime = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.device === b.device ? a.seq - b.seq : a.device < b.device ? -1 : 1);
      journal.sort(byTime); inputs.sort(byTime);
      resetShadow(); persist(); if (changed) listeners.forEach((f) => f());
      return changed;
    },
  };
  return api;
}
