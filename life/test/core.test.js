// Requirements as tests (see "Requirements as tests" in the Life Archipelago Plan doc).
// Each block names the requirement it checks. Written before the code; run with `npm test`.
import { describe, it, expect } from "vitest";
import { createStore, memoryBackend } from "../app/core/store.js";
import { parseCapture } from "../app/core/capture.js";
import { suggestPlaces } from "../app/core/places.js";
import { levelFor, XP } from "../app/core/xp.js";
import { exportMarkdown, importMarkdown, exportJSON, importJSON } from "../app/core/exporter.js";
import { shareToNode } from "../app/core/share.js";
import { districtMood } from "../app/core/mood.js";
import { celebrationFor } from "../app/core/reward.js";
import { ISO, orbitOffset, panBasis, turn } from "../app/core/orbit.js";
import { makeWalker } from "../app/core/walk.js";
import { createPhysics } from "../app/core/physics.js";
import { applyEdit, placeChoices } from "../app/core/edit.js";
import { todayList } from "../app/core/today.js";
import { nextDue, parseRepeat, describeRepeat } from "../app/core/repeat.js";
import { reminderList } from "../app/core/reminders.js";
import { parseDeepLink } from "../app/core/links.js";
import { openSavedBackend } from "../app/storage.js";
import { IDBFactory } from "fake-indexeddb";
import { backupDue, backupName } from "../app/core/backup.js";
import { CATALOG, SLOTS, buy, decorationsFor } from "../app/core/shop.js";
import { DICTS, makeT, pickLang, placeTitle } from "../app/core/i18n.js";
import { pickQuality, canChooseQuality } from "../app/core/quality.js";
import { PROFILE_KEYS, DEFAULT_PROFILE, validProfile } from "../app/core/profile.js";
import { splitForSync } from "../app/core/sealable.js";
import { parseGoal, goalDeadline, timeLeft, goalBoard, artFor, spreadDates, progressView, stuckReason, STUCK_ANSWERS } from "../app/core/goals.js";
import { addCategory, renameCategory, removeCategory, categories } from "../app/core/categories.js";

const NOW = new Date("2026-11-06T09:00:00");
const fresh = () => createStore(memoryBackend(), { now: () => NOW });

describe("R1 · capture into the bag", () => {
  it("parses 'renew passport before March' as a task due 1 March", () => {
    const c = parseCapture("renew passport before March", NOW);
    expect(c.type).toBe("task");
    expect(c.due).toBe("2027-03-01");
    expect(c.title).toBe("Renew passport");
  });
  it("puts a captured task in the bag, unplaced, within 1 second", () => {
    const s = fresh(), t0 = performance.now();
    const id = s.capture("renew passport before March");
    expect(performance.now() - t0).toBeLessThan(1000);
    const n = s.get(id);
    expect(n.parent).toBe("bag");
    expect(n.due).toBe("2027-03-01");
    expect(s.unplaced().map((x) => x.id)).toContain(id);
  });
  it("understands dates in Hebrew and English", () => {
    expect(parseCapture("להתקשר לסבתא מחר", NOW).due).toBe("2026-11-07");
    expect(parseCapture("pay electricity bill by 20/11", NOW).due).toBe("2026-11-20");
    expect(parseCapture("dentist Nov 25", NOW).due).toBe("2026-11-25");
    expect(parseCapture("לחדש ביטוח רכב עד מרץ", NOW).due).toBe("2027-03-01");
    expect(parseCapture("call plumber tomorrow", NOW).due).toBe("2026-11-07");
  });
  it("keeps plain thoughts as notes", () => {
    const c = parseCapture("idea: a reading corner by the window", NOW);
    expect(c.type).toBe("note");
    expect(c.due).toBeNull();
  });
});

describe("R2 · suggest where it belongs", () => {
  it("puts paperwork first for a passport task", () => {
    expect(suggestPlaces("renew passport before March")[0]).toBe("paperwork");
  });
  it("suggests the right island or room for common captures", () => {
    expect(suggestPlaces("להתקשר לסבתא מחר")[0]).toBe("family");
    expect(suggestPlaces("gym legs day")[0]).toBe("health");
    expect(suggestPlaces("change the fridge water filter")[0]).toBe("kitchen");
    expect(suggestPlaces("project meeting with client")[0]).toBe("work");
    expect(suggestPlaces("pay electricity bill")[0]).toBe("paperwork");
  });
  it("returns a sensible default when nothing matches", () => {
    expect(suggestPlaces("zzz qqq").length).toBeGreaterThan(0);
  });
});

describe("R3 · places hold things", () => {
  it("an item added to the living room shows in that room and in search", () => {
    const s = fresh();
    const id = s.add({ type: "item", title: "TV", parent: "living" });
    expect(s.children("living").map((n) => n.id)).toContain(id);
    expect(s.search("tv").map((n) => n.id)).toContain(id);
    expect(s.path(id)).toEqual(["home", "living"]);
  });
  it("seeds the world with six islands (Shopping added, R41) and four home rooms", () => {
    const s = fresh();
    expect(s.children("world").map((n) => n.id).sort()).toEqual(["family", "health", "home", "paperwork", "shopping", "work"]);
    expect(s.children("home").map((n) => n.id).sort()).toEqual(["bedroom", "kitchen", "living", "office"]);
  });
  it("placing a bag item moves it to the chosen place", () => {
    const s = fresh();
    const id = s.capture("renew passport before March");
    s.place(id, "paperwork");
    expect(s.get(id).parent).toBe("paperwork");
    expect(s.unplaced().length).toBe(0);
  });
  it("persists across reloads through its backend", () => {
    const be = memoryBackend();
    const a = createStore(be, { now: () => NOW });
    const id = a.add({ type: "note", title: "Wi-Fi password is on the router", parent: "office" });
    const b = createStore(be, { now: () => NOW });
    expect(b.get(id).title).toBe("Wi-Fi password is on the router");
  });
});

describe("R7 · export and import lose nothing", () => {
  const filled = () => {
    const s = fresh();
    const places = ["home", "living", "kitchen", "bedroom", "office", "work", "health", "family", "paperwork", "bag"];
    for (let i = 0; i < 50; i++) s.add({ type: i % 3 ? "task" : "note", title: `Thing ${i}: "quoted", ok`, parent: places[i % places.length], due: i % 4 ? null : "2026-12-01", tags: ["t" + (i % 5)] });
    return s;
  };
  it("Markdown round trip keeps all 50 nodes under the same place", () => {
    const s = filled();
    const files = exportMarkdown(s);
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(50);
    const t = fresh(); importMarkdown(t, files);
    for (const n of s.all().filter((x) => !x.system)) {
      const m = t.get(n.id);
      expect(m, n.id).toBeTruthy();
      expect(m.parent).toBe(n.parent);
      expect(m.title).toBe(n.title);
      expect(m.due).toBe(n.due);
      expect(m.tags).toEqual(n.tags);
    }
  });
  it("JSON round trip is exact", () => {
    const s = filled();
    const t = fresh(); importJSON(t, exportJSON(s));
    expect(t.all()).toEqual(s.all());
  });
});

describe("R8 · XP for paperwork quests", () => {
  it("adds XP once per step and a boss bonus once when the last step is done", () => {
    const s = fresh();
    const q = s.add({ type: "task", title: "Tax refund", parent: "paperwork", effort: 3, steps: ["collect forms", "fill in", "submit", "confirm"].map((t) => ({ title: t, done: false })) });
    let total = 0;
    for (let i = 0; i < 3; i++) total += s.completeStep(q, i);
    expect(total).toBe(3 * XP.perStep * 3);
    const last = s.completeStep(q, 3);
    expect(last).toBe(XP.perStep * 3 + XP.bossBonus * 3);
    expect(s.get(q).done).toBe(true);
    expect(s.completeStep(q, 3)).toBe(0);
  });
  it("XP never goes down, even when a task is reopened", () => {
    const s = fresh();
    const t = s.add({ type: "task", title: "Call the bank", parent: "paperwork" });
    const before = s.xp();
    s.complete(t);
    const after = s.xp();
    expect(after).toBeGreaterThan(before);
    s.reopen(t);
    expect(s.xp()).toBe(after);
    s.complete(t);
    expect(s.xp()).toBe(after);
  });
  it("maps XP to levels with a growing curve", () => {
    expect(levelFor(0).level).toBe(1);
    const a = levelFor(500), b = levelFor(5000);
    expect(b.level).toBeGreaterThan(a.level);
    expect(a.into).toBeLessThan(a.need);
  });
});

describe("Share into the app (Android share sheet)", () => {
  it("turns a shared link into a link node in the bag", () => {
    const n = shareToNode({ text: "Check this https://www.gov.il/en/service/passport-renewal", subject: "Passport" }, NOW);
    expect(n.type).toBe("link");
    expect(n.url).toBe("https://www.gov.il/en/service/passport-renewal");
    expect(n.parent).toBe("bag");
    expect(n.suggest[0]).toBe("paperwork");
  });
  it("turns shared text into a capture and a shared image into a photo", () => {
    expect(shareToNode({ text: "buy milk tomorrow" }, NOW).due).toBe("2026-11-07");
    const p = shareToNode({ images: ["data:image/jpeg;base64,AAAA"] }, NOW);
    expect(p.type).toBe("photo");
    expect(p.images.length).toBe(1);
  });
});

describe("R27 · the city reflects your state", () => {
  it("a district with an overdue task is 'overdue', and 'clear' once everything there is done", () => {
    const s = fresh();
    const id = s.add({ type: "task", title: "Pay the fine", parent: "paperwork", due: "2026-11-01" });
    expect(districtMood(s, "paperwork", NOW)).toMatchObject({ state: "overdue", overdue: 1, open: 1 });
    s.complete(id);
    expect(districtMood(s, "paperwork", NOW)).toMatchObject({ state: "clear", overdue: 0, open: 0 });
  });
  it("open tasks that are not late make a district 'open'; due today is not overdue yet", () => {
    const s = fresh();
    s.add({ type: "task", title: "Gym", parent: "health", due: "2026-11-06" });
    s.add({ type: "task", title: "Book a check-up", parent: "health" });
    expect(districtMood(s, "health", NOW)).toMatchObject({ state: "open", open: 2, overdue: 0, soon: 1 });
  });
  it("Home counts the tasks inside its rooms, and notes or items never make a district late", () => {
    const s = fresh();
    s.add({ type: "task", title: "Fix the lamp", parent: "living", due: "2026-10-30" });
    s.add({ type: "item", title: "Old TV", parent: "living", due: "2020-01-01" });
    expect(districtMood(s, "home", NOW)).toMatchObject({ state: "overdue", overdue: 1, open: 1 });
    expect(districtMood(s, "work", NOW).state).toBe("clear");
  });
});

describe("R26 · finishing things feels rewarding", () => {
  const base = { questDone: false, isStep: false, levelBefore: 1, levelAfter: 1 };
  it("a finished task gets a small celebration that shows its XP", () => {
    expect(celebrationFor({ ...base, gained: 10 })).toMatchObject({ kind: "task", xp: 10, levelUp: null });
  });
  it("a quest step is quieter than a task, a finished quest is bigger, a level-up is the biggest", () => {
    const step = celebrationFor({ ...base, gained: 10, isStep: true });
    const task = celebrationFor({ ...base, gained: 10 });
    const quest = celebrationFor({ ...base, gained: 60, isStep: true, questDone: true });
    const level = celebrationFor({ ...base, gained: 10, levelAfter: 2 });
    expect(step.kind).toBe("step"); expect(quest.kind).toBe("quest"); expect(level.levelUp).toBe(2);
    expect(step.confetti).toBeLessThan(task.confetti);
    expect(task.confetti).toBeLessThan(quest.confetti);
    expect(quest.confetti).toBeLessThan(level.confetti);
    expect(level.notes.length).toBeGreaterThan(task.notes.length);
  });
  it("ticking a task that already paid out gives no celebration, so XP can't be farmed", () => {
    expect(celebrationFor({ ...base, gained: 0 })).toBeNull();
  });
});

describe("R29 · the world can be rotated", () => {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  it("the starting view is the familiar corner view, looking down from (1, 1.05, 1)", () => {
    const o = orbitOffset(ISO.yaw, ISO.pitch, 10);
    expect(o[0]).toBeCloseTo(o[2], 6);
    expect(o[1] / o[0]).toBeCloseTo(1.05, 6);
    expect(Math.hypot(...o)).toBeCloseTo(10, 6);
  });
  it("a full turn comes back to the same place, and dragging always moves along the ground", () => {
    const a = orbitOffset(0.3, 0.6, 20), b = orbitOffset(0.3 + 2 * Math.PI, 0.6, 20);
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
    for (const yaw of [0, 0.8, 2.5, -1.2]) {
      const { right, forward } = panBasis(yaw), o = orbitOffset(yaw, 0.6, 1);
      expect(right[1]).toBe(0); expect(forward[1]).toBe(0);
      expect(dot(right, forward)).toBeCloseTo(0, 6);
      expect(dot(right, o)).toBeCloseTo(0, 6);            // right is across the view
      expect(dot(forward, o)).toBeLessThan(0);            // forward is away from the camera
    }
  });
  it("turning takes the short way round", () => {
    expect(turn(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(-0.2, 6);
    expect(turn(-3, 3)).toBeCloseTo(-(2 * Math.PI - 6), 6);
  });
});

describe("R31 · walking in the city", () => {
  // Two blocks side by side (6 wide each), a building in the middle of the second one.
  const w = makeWalker({ cells: [[0, 0], [6, 0]], pitch: 6, block: 4.6, solids: [{ x0: 5, x1: 7, z0: -1, z1: 1, h: 3 }] });
  it("you can cross the road from one block to the next, but not walk into the water", () => {
    let x = 0, z = 2.2, ok = true;
    for (let i = 0; i < 60 && ok; i++) [x, z, ok] = w.step(x, z, 0.1, 0);
    expect(x).toBeGreaterThan(5.5);
    let moved = true; x = 0; z = 0;
    for (let i = 0; i < 100; i++) [x, z, moved] = w.step(x, z, 0, 0.1);
    expect(z).toBeLessThan(3); expect(w.walkable(0, 3.2)).toBe(false);
  });
  it("a building blocks you, and you slide along its wall instead of stopping", () => {
    expect(w.walkable(6, 0)).toBe(false);
    let x = 3.5, z = 0, ok;
    for (let i = 0; i < 20; i++) [x, z, ok] = w.step(x, z, 0.1, 0.02);
    expect(x).toBeLessThan(4.8); expect(z).toBeCloseTo(0.4, 5);   // stopped by the wall in x, kept moving in z
    for (let i = 0; i < 30; i++) [x, z, ok] = w.step(x, z, 0.1, 0.1);
    expect(x).toBeGreaterThan(6);                                 // and goes on once clear of the corner
  });
  it("finds a way round a building instead of getting stuck against it", () => {
    // From the left of the building to a point straight behind it: the direct line is blocked.
    const path = w.route(4.2, 0, 7.8, 0);
    expect(path.length).toBeGreaterThan(1);
    const end = path[path.length - 1]; expect(end[0]).toBeCloseTo(7.8, 1); expect(end[1]).toBeCloseTo(0, 1);
    let x = 4.2, z = 0, len = 0;
    for (const [px, pz] of path) { // every stretch of the route is free of walls
      const d = Math.hypot(px - x, pz - z); len += d;
      for (let t = 0; t <= 1; t += 0.05) expect(w.walkable(x + (px - x) * t, z + (pz - z) * t)).toBe(true);
      x = px; z = pz;
    }
    expect(len).toBeLessThan(8);   // round the corner, not round the block
  });
  it("a tap on a wall or on the water leads to the nearest place you can stand", () => {
    const toWall = w.route(0, 0, 6, 0), toSea = w.route(0, 0, 0, 9);
    expect(w.walkable(...toWall[toWall.length - 1])).toBe(true); expect(toWall[toWall.length - 1][0]).toBeGreaterThan(4);
    expect(w.walkable(...toSea[toSea.length - 1])).toBe(true); expect(toSea[toSea.length - 1][1]).toBeGreaterThan(2);
  });
  it("blocks stand a step above the road", () => {
    expect(w.groundY(0, 0)).toBeGreaterThan(w.groundY(3, 0));
  });
});

describe("R32 · things react physically", () => {
  const flat = () => createPhysics({ groundY: () => 0 });
  it("a dropped ball bounces lower each time and comes to rest on the ground", () => {
    const ph = flat(), b = ph.add({ p: [0, 3, 0], r: 0.2 }), peaks = []; let up = false, top = 0;
    for (let i = 0; i < 1500 && !b.asleep; i++) { ph.step(1 / 60); if (b.v[1] > 0) { up = true; top = Math.max(top, b.p[1]); } else if (up) { peaks.push(top); up = false; top = 0; } }
    expect(peaks.length).toBeGreaterThan(1);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeLessThan(peaks[i - 1]);
    expect(b.asleep).toBe(true); expect(b.p[1]).toBeCloseTo(0.2, 2);
  });
  it("a ball kicked at a wall bounces back and never ends up inside the building", () => {
    const ph = createPhysics({ groundY: () => 0, solids: [{ x0: 2, x1: 4, z0: -1, z1: 1, h: 3 }] }), b = ph.add({ p: [0, 0.2, 0], r: 0.2 });
    ph.kick(b, 14, 1, 0); let maxX = 0;
    for (let i = 0; i < 400; i++) { ph.step(1 / 60); maxX = Math.max(maxX, b.p[0]); }
    expect(maxX).toBeLessThanOrEqual(1.81); expect(b.p[0]).toBeLessThan(1.8);
  });
  it("a ball that rolls off the quay splashes into the water and returns to where it lives", () => {
    const ph = createPhysics({ groundY: () => 0.26, inCity: (x) => x < 3 }), b = ph.add({ p: [2, 0.5, 0], r: 0.2, home: [0, 0.6, 0] });
    ph.kick(b, 6, 0, 0); const seen = [];
    for (let i = 0; i < 300; i++) for (const e of ph.step(1 / 60)) seen.push(e.type);
    expect(seen).toContain("splash"); expect(b.p[0]).toBeCloseTo(0, 1);
  });
  it("reward coins vanish after their time, toys stay", () => {
    const ph = flat(); ph.add({ p: [0, 1, 0], life: 1, kind: "coin" }); ph.add({ p: [1, 1, 0], kind: "ball" });
    for (let i = 0; i < 120; i++) ph.step(1 / 60);
    expect(ph.bodies.map((b) => b.kind)).toEqual(["ball"]);
  });
});

describe("R33 · edit an item", () => {
  it("changes title, due date, notes and effort, and keeps the id, creation time and XP already paid", () => {
    const s = fresh(); const id = s.add({ type: "task", title: "Pay bill", parent: "paperwork" });
    s.complete(id); s.reopen(id); const before = s.get(id), xp = s.xp();
    const r = applyEdit(s, id, { title: "  Pay electricity bill ", due: "2026-11-20", notes: "NorthGrid", effort: 9 });
    expect(r.ok).toBe(true);
    const n = s.get(id);
    expect(n).toMatchObject({ id, title: "Pay electricity bill", due: "2026-11-20", notes: "NorthGrid", effort: 5, created: before.created, awarded: true });
    expect(s.xp()).toBe(xp);
  });
  it("refuses an empty title or a date that isn't a date, and changes nothing", () => {
    const s = fresh(); const id = s.add({ type: "task", title: "Keep me", parent: "work" });
    expect(applyEdit(s, id, { title: "   " })).toMatchObject({ ok: false, field: "title" });
    expect(applyEdit(s, id, { due: "31/02/2026" })).toMatchObject({ ok: false, field: "due" });
    expect(s.get(id).title).toBe("Keep me");
  });
  it("moves an item to another place, but only to a real place", () => {
    const s = fresh(); const id = s.add({ type: "item", title: "Laptop", parent: "office" });
    expect(applyEdit(s, id, { parent: "work" }).ok).toBe(true); expect(s.get(id).parent).toBe("work");
    expect(applyEdit(s, id, { parent: "nowhere" })).toMatchObject({ ok: false, field: "parent" });
    expect(applyEdit(s, id, { parent: id })).toMatchObject({ ok: false, field: "parent" });
    const choices = placeChoices(s).map((c) => c.id);
    expect(choices).toEqual(expect.arrayContaining(["bag", "home", "living", "paperwork"])); expect(choices).not.toContain("world");
  });
  it("edits steps: done steps stay done, new steps start open, and no XP is paid again", () => {
    const s = fresh(); const id = s.add({ type: "task", title: "Passport", parent: "paperwork", steps: [{ title: "Book" }, { title: "Photo" }, { title: "Go" }] });
    s.completeStep(id, 0); const xp = s.xp();
    applyEdit(s, id, { steps: [{ from: 0, title: "Book an appointment" }, { from: 2, title: "Go to the office" }, { title: "Pick up" }] });
    expect(s.get(id).steps).toEqual([{ title: "Book an appointment", done: true }, { title: "Go to the office", done: false }, { title: "Pick up", done: false }]);
    expect(s.xp()).toBe(xp);
    applyEdit(s, id, { steps: [] }); expect(s.get(id).steps).toBeNull();
  });
});

describe("R34 · one list that answers what now", () => {
  const T = () => { const s = fresh(); // NOW is 2026-11-06
    s.add({ type: "task", title: "Late form", parent: "paperwork", due: "2026-11-01" });
    s.add({ type: "task", title: "Gym", parent: "health", due: "2026-11-06" });
    s.add({ type: "task", title: "Big review", parent: "work", due: "2026-11-06", effort: 3 });
    s.add({ type: "task", title: "Filter", parent: "kitchen", due: "2026-11-10" });
    s.add({ type: "task", title: "Far away", parent: "work", due: "2026-12-30" });
    s.add({ type: "task", title: "No date", parent: "work" });
    s.add({ type: "task", title: "Done late", parent: "work", due: "2026-11-02", done: true });
    s.add({ type: "note", title: "A note", parent: "work", due: "2026-11-06" });
    s.capture("call the plumber"); return s; };
  it("splits open tasks into overdue, today and this week, and counts the bag", () => {
    const t = todayList(T(), NOW);
    expect(t.overdue.map((x) => x.title)).toEqual(["Late form"]);
    expect(t.today.map((x) => x.title)).toEqual(["Big review", "Gym"]);   // bigger effort first on the same day
    expect(t.week.map((x) => x.title)).toEqual(["Filter"]);
    expect(t.bag).toBe(1);
  });
  it("shows where each task lives, including rooms in the home", () => {
    const t = todayList(T(), NOW);
    expect(t.week[0].where).toBe("Home › Kitchen");
    expect(t.overdue[0].where).toBe("Paperwork");
  });
  it("says how long the oldest thing has waited in the bag", () => {
    const s = createStore(memoryBackend(), { now: () => new Date("2026-11-01T09:00:00") }); s.capture("old thought");
    expect(todayList(s, NOW).bagDays).toBe(5);
  });
  it("is empty on a clear day", () => {
    const t = todayList(fresh(), NOW);
    expect(t.overdue.length + t.today.length + t.week.length).toBe(0); expect(t.empty).toBe(true);
  });
});

describe("R35 · repeating tasks", () => {
  it("moves the date on by the period, keeping month ends and leap days sensible", () => {
    expect(nextDue("2026-11-06", { every: 1, unit: "week" }, "2026-11-06")).toBe("2026-11-13");
    expect(nextDue("2026-11-06", { every: 6, unit: "month" }, "2026-11-06")).toBe("2027-05-06");
    expect(nextDue("2027-01-31", { every: 1, unit: "month" }, "2027-01-31")).toBe("2027-02-28");
    expect(nextDue("2028-01-31", { every: 1, unit: "month" }, "2028-01-31")).toBe("2028-02-29");
    expect(nextDue("2028-02-29", { every: 1, unit: "year" }, "2028-02-29")).toBe("2029-02-28");
    expect(nextDue("2026-12-30", { every: 3, unit: "day" }, "2026-12-30")).toBe("2027-01-02");
  });
  it("when the task was done late, the next date is the first one after today, still on the same rhythm", () => {
    expect(nextDue("2026-10-01", { every: 1, unit: "week" }, "2026-11-06")).toBe("2026-11-12");   // Thursdays stay Thursdays
  });
  it("understands repeats in English and Hebrew, and takes them out of the title", () => {
    const cases = [["gym every week", 1, "week", "gym"], ["change the filter every 6 months", 6, "month", "change the filter"], ["water the plants daily", 1, "day", "water the plants"],
      ["להחליף פילטר כל חצי שנה", 6, "month", "להחליף פילטר"], ["לשלם ארנונה כל חודשיים", 2, "month", "לשלם ארנונה"], ["חדר כושר כל שבוע", 1, "week", "חדר כושר"], ["ביקור אצל סבתא כל שבועיים", 2, "week", "ביקור אצל סבתא"], ["לחדש ביטוח כל שנה", 1, "year", "לחדש ביטוח"], ["every 3 days stretch", 3, "day", "stretch"]];
    for (const [text, every, unit, rest] of cases) { const r = parseRepeat(text); expect(r.repeat, text).toEqual({ every, unit }); expect(r.text.trim(), text).toBe(rest); }
    expect(parseRepeat("buy milk").repeat).toBeNull();
    expect(describeRepeat({ every: 6, unit: "month" })).toBe("every 6 months"); expect(describeRepeat({ every: 1, unit: "week" })).toBe("every week");
  });
  it("a captured repeating task is a task, due one period from today", () => {
    const s = fresh(); const n = s.get(s.capture("change the water filter every 6 months"));
    expect(n).toMatchObject({ type: "task", title: "Change the water filter", repeat: { every: 6, unit: "month" }, due: "2027-05-06" });
  });
  it("finishing a repeating task pays XP for this time, then it comes back with the next date, open again", () => {
    const s = fresh(); const id = s.add({ type: "task", title: "Gym", parent: "health", due: "2026-11-06", repeat: { every: 1, unit: "week" } });
    expect(s.complete(id)).toBe(10); expect(s.get(id)).toMatchObject({ done: false, due: "2026-11-13", awarded: false });
    expect(s.complete(id)).toBe(10); expect(s.get(id).due).toBe("2026-11-20"); expect(s.xp()).toBe(20);
  });
  it("a repeating quest with steps opens all its steps again for next time", () => {
    const s = fresh(); const id = s.add({ type: "task", title: "Monthly bills", parent: "paperwork", due: "2026-11-06", repeat: { every: 1, unit: "month" }, steps: [{ title: "Electric" }, { title: "Water" }] });
    s.completeStep(id, 0); s.completeStep(id, 1);
    expect(s.get(id)).toMatchObject({ done: false, due: "2026-12-06", bossAwarded: false });
    expect(s.get(id).steps.every((st) => !st.done)).toBe(true);
  });
  it("the repeat survives export and import", () => {
    const s = fresh(); s.add({ id: "r1", type: "task", title: "Gym", parent: "health", due: "2026-11-06", repeat: { every: 2, unit: "week" } });
    const t = fresh(); importMarkdown(t, exportMarkdown(s), { merge: false }); expect(t.get("r1").repeat).toEqual({ every: 2, unit: "week" });
  });
});

describe("R11 · reminders: what the phone is asked to remind", () => {
  it("open tasks due from today on, soonest first, never done ones or ones without a date", () => {
    const s = fresh();
    s.add({ id: "a", type: "task", title: "Late", parent: "work", due: "2026-11-01" });
    s.add({ id: "b", type: "task", title: "Today", parent: "work", due: "2026-11-06" });
    s.add({ id: "c", type: "task", title: "Next week", parent: "work", due: "2026-11-12" });
    s.add({ id: "d", type: "task", title: "Done", parent: "work", due: "2026-11-08", done: true });
    s.add({ id: "e", type: "task", title: "No date", parent: "work" });
    s.add({ id: "f", type: "note", title: "A note", parent: "work", due: "2026-11-09" });
    s.add({ id: "g", type: "task", title: "Next year", parent: "work", due: "2027-06-01" });
    expect(reminderList(s, NOW)).toEqual([{ id: "b", title: "Today", due: "2026-11-06" }, { id: "c", title: "Next week", due: "2026-11-12" }]);
  });
  it("keeps the list short for the phone", () => {
    const s = fresh(); for (let i = 0; i < 90; i++) s.add({ type: "task", title: "T" + i, parent: "work", due: "2026-11-20" });
    expect(reminderList(s, NOW).length).toBe(64);
  });
});

describe("R21 · deep links open the app on an action", () => {
  it("reads add, open, place, today, scan and voice links", () => {
    expect(parseDeepLink("lifearchipelago://add?text=call%20the%20plumber%20tomorrow")).toEqual({ action: "add", text: "call the plumber tomorrow" });
    expect(parseDeepLink("lifearchipelago://add?text=%D7%9C%D7%97%D7%93%D7%A9%20%D7%93%D7%A8%D7%9B%D7%95%D7%9F")).toEqual({ action: "add", text: "לחדש דרכון" });
    expect(parseDeepLink("lifearchipelago://open?id=abc123")).toEqual({ action: "open", id: "abc123" });
    expect(parseDeepLink("lifearchipelago://open?place=paperwork")).toEqual({ action: "place", id: "paperwork" });
    expect(parseDeepLink("lifearchipelago://today")).toEqual({ action: "today" });
    expect(parseDeepLink("lifearchipelago://scan")).toEqual({ action: "scan" });
    expect(parseDeepLink("lifearchipelago://voice")).toEqual({ action: "voice" });
    expect(parseDeepLink("lifearchipelago://add")).toEqual({ action: "capture" });
  });
  it("ignores anything it doesn't know", () => {
    for (const u of ["", null, 42, "lifearchipelago://", "lifearchipelago://open"]) expect(parseDeepLink(u)).toBeNull();
    expect(parseDeepLink("https://evil.example/add?text=x")).toBeNull();
    expect(parseDeepLink("lifearchipelago://delete?id=1")).toBeNull();
    expect(parseDeepLink("lifearchipelago://add?text=" + "x".repeat(3000)).text.length).toBe(500);
  });
});

describe("R19 · data is kept safely in IndexedDB", () => {
  const fakeLS = (init = {}) => { const m = { ...init }; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; };
  it("moves version-1 data from localStorage on first start without losing an item, then saves version 3", async () => {
    const old = fresh(); old.add({ id: "x1", type: "task", title: "Renew passport", parent: "paperwork" }); old.award(30, "test");
    const ls = fakeLS({ "life-archipelago-v1": JSON.stringify(old.snapshot()) }), idb = new IDBFactory();
    const b1 = await openSavedBackend({ idb, ls });
    expect(b1.kind).toBe("indexeddb"); expect(b1.migrated).toBe(true);
    const s = createStore(b1, { now: () => NOW });
    expect(s.get("x1").title).toBe("Renew passport"); expect(s.xp()).toBe(30);
    s.add({ id: "x2", type: "note", title: "New", parent: "work" }); await b1.flush();
    const b2 = await openSavedBackend({ idb, ls }); const data = b2.load();
    expect(b2.migrated).toBe(false); expect(data.version).toBe(3); expect(data.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["x1", "x2"]));
    expect(ls.getItem("life-archipelago-v1")).not.toBeNull();  // the old copy stays as a fallback
  });
  it("falls back to localStorage when IndexedDB is missing", async () => {
    const b = await openSavedBackend({ idb: null, ls: fakeLS() }); expect(b.kind).toBe("localStorage");
  });
  it("deleting leaves a tombstone, so a later sync knows; undo brings the item back; old tombstones go after 30 days", () => {
    const back = memoryBackend(); const s = createStore(back, { now: () => NOW });
    s.add({ id: "d1", type: "task", title: "Gone", parent: "work" }); s.remove("d1");
    expect(s.get("d1")).toBeNull(); expect(s.all().some((n) => n.id === "d1")).toBe(false);
    expect(s.snapshot().deleted).toEqual([{ id: "d1", at: NOW.toISOString() }]);
    s.add({ id: "d1", type: "task", title: "Gone", parent: "work" }); expect(s.snapshot().deleted).toEqual([]);
    s.remove("d1");
    const later = createStore(back, { now: () => new Date("2026-12-10T09:00:00") }); expect(later.snapshot().deleted).toEqual([]);
    const soon = createStore(back, { now: () => new Date("2026-11-20T09:00:00") }); expect(soon.snapshot().deleted.length).toBe(1);
  });
});

describe("R20 · automatic backups", () => {
  it("backs up once a day, and names files by date", () => {
    expect(backupDue(null, NOW)).toBe(true);
    expect(backupDue("2026-11-06", NOW)).toBe(false);
    expect(backupDue("2026-11-05", NOW)).toBe(true);
    expect(backupName(NOW)).toBe("life-backup-2026-11-06.json");
  });
});

describe("R36 · coins buy decorations for the city", () => {
  it("finishing things fills a wallet: a task 1 coin, a quest step 1, a whole quest 5 more; coins are never taken away", () => {
    const s = fresh(); const t = s.add({ type: "task", title: "T", parent: "work" });
    const q = s.add({ type: "task", title: "Q", parent: "paperwork", steps: [{ title: "a" }, { title: "b" }] });
    s.complete(t); s.reopen(t); s.complete(t);
    s.completeStep(q, 0); s.completeStep(q, 1);
    expect(s.coins()).toBe(1 + 1 + 1 + 5);
  });
  it("each time a repeating task is done it pays again", () => {
    const s = fresh(); const r = s.add({ type: "task", title: "Gym", parent: "health", due: "2026-11-06", repeat: { every: 1, unit: "week" } });
    s.complete(r); s.complete(r); expect(s.coins()).toBe(2);
  });
  it("buying places the decoration in the next free spot of that district and takes its price", () => {
    const s = fresh(); s.earnCoins(20, "test");
    const bench = CATALOG.find((c) => c.id === "bench");
    expect(buy(s, "paperwork", "bench")).toMatchObject({ ok: true, slot: 0 });
    expect(s.coins()).toBe(20 - bench.price);
    expect(decorationsFor(s, "paperwork")).toEqual([{ district: "paperwork", slot: 0, item: "bench" }]);
  });
  it("can't spend coins you don't have, and a district has only so many spots", () => {
    const s = fresh(); s.earnCoins(2, "test");
    expect(buy(s, "work", "fountain")).toMatchObject({ ok: false, reason: "coins" }); expect(s.coins()).toBe(2);
    s.earnCoins(500, "test");
    for (let i = 0; i < SLOTS; i++) expect(buy(s, "work", "tree").ok).toBe(true);
    expect(buy(s, "work", "tree")).toMatchObject({ ok: false, reason: "full" });
    expect(buy(s, "nowhere", "tree")).toMatchObject({ ok: false, reason: "place" });
    expect(buy(s, "work", "rocket")).toMatchObject({ ok: false, reason: "item" });
  });
  it("the wallet and the decorations are saved with everything else", () => {
    const s = fresh(); s.earnCoins(10, "test"); buy(s, "health", "flowers");
    const t = fresh(); t.restore(s.snapshot());
    expect(t.coins()).toBe(s.coins()); expect(decorationsFor(t, "health").length).toBe(1);
  });
});

describe("R37 · the interface in Hebrew", () => {
  it("every phrase exists in both English and Hebrew, and Hebrew uses only placeholders English has", () => {
    const ph = (v) => [...String(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    expect(Object.keys(DICTS.he).sort()).toEqual(Object.keys(DICTS.en).sort());
    for (const k of Object.keys(DICTS.en)) for (const p of ph(DICTS.he[k])) expect(ph(DICTS.en[k]), k).toContain(p);
    for (const c of CATALOG) expect(DICTS.he["item_" + c.id], c.id).toBeTruthy();
  });
  it("fills in values, and follows the device language unless the owner chose one", () => {
    expect(makeT("he")("nOverdue", { n: 3 })).toBe("3 באיחור");
    expect(makeT("en")("inDays", { n: 4 })).toBe("in 4 days");
    expect(pickLang(null, "he-IL")).toBe("he"); expect(pickLang(null, "en-US")).toBe("en"); expect(pickLang("en", "he-IL")).toBe("en");
  });
  it("translates the built-in place names, but never a name the owner chose", () => {
    expect(placeTitle("paperwork", "Paperwork", "he")).toBe("ניירת");
    expect(placeTitle("paperwork", "Bills and forms", "he")).toBe("Bills and forms");
    expect(placeTitle("paperwork", "Paperwork", "en")).toBe("Paperwork");
  });
});

describe("R39 · enhanced graphics on computers only", () => {
  it("a computer with a wide screen starts enhanced; a narrow window starts light", () => {
    expect(pickQuality({ coarse: false, width: 1440 })).toBe("enhanced");
    expect(pickQuality({ coarse: false, width: 700 })).toBe("light");
  });
  it("the owner's choice on a computer is kept", () => {
    expect(pickQuality({ coarse: false, width: 1440, saved: "light" })).toBe("light");
    expect(pickQuality({ coarse: false, width: 700, saved: "enhanced" })).toBe("enhanced");
  });
  it("a phone never changes, whatever was saved, and has no switch", () => {
    expect(pickQuality({ coarse: true, width: 1440, saved: "enhanced" })).toBe("light");
    expect(canChooseQuality({ coarse: true })).toBe(false); expect(canChooseQuality({ coarse: false })).toBe(true);
  });
});

describe("R40 · dates are checked in the owner's own time zone", () => {
  it("in Israel (UTC+2) a picked date is a real date, and a wrong one is still refused", () => {
    const tz = process.env.TZ; process.env.TZ = "Asia/Jerusalem";
    try {
      const s = fresh(); const id = s.add({ type: "task", title: "ללכת לסופר פארם", parent: "home" });
      expect(applyEdit(s, id, { due: "2026-11-26" })).toMatchObject({ ok: true }); expect(s.get(id).due).toBe("2026-11-26");
      expect(applyEdit(s, id, { due: "2026-03-01" }).ok).toBe(true);
      expect(applyEdit(s, id, { due: "2026-02-30" })).toMatchObject({ ok: false, field: "due" });
    } finally { process.env.TZ = tz; }
  });
});

describe("R41 · a Shopping category", () => {
  it("exists in a new world and is added to an older saved world", () => {
    expect(fresh().get("shopping")).toMatchObject({ type: "place", kind: "island", title: "Shopping" });
    const back = memoryBackend(); const old = createStore(back, { now: () => NOW }); const snap = old.snapshot();
    snap.nodes = snap.nodes.filter((n) => n.id !== "shopping"); back.save(snap);
    expect(createStore(back, { now: () => NOW }).get("shopping")).toBeTruthy();
  });
  it("shopping words suggest Shopping first, in English and Hebrew", () => {
    for (const t of ["buy milk and eggs", "go to the supermarket", "לקנות חלב", "ללכת לסופר פארם", "רשימת קניות"]) expect(suggestPlaces(t)[0], t).toBe("shopping");
  });
});

describe("R42 · edit the categories", () => {
  it("renames a category (built-in or new); an empty name is refused", () => {
    const s = fresh();
    expect(renameCategory(s, "paperwork", "Bills and forms").ok).toBe(true); expect(s.get("paperwork").title).toBe("Bills and forms");
    expect(renameCategory(s, "paperwork", "  ").ok).toBe(false);
    expect(renameCategory(s, "living", "Salon").ok).toBe(true);
  });
  it("adds a new category, which can hold things and can be removed; its things go back to the bag", () => {
    const s = fresh(); const r = addCategory(s, "Hobbies"); expect(r.ok).toBe(true);
    const id = r.id; expect(s.get(id)).toMatchObject({ type: "place", kind: "island", title: "Hobbies", custom: true });
    expect(categories(s).map((c) => c.id)).toContain(id);
    const thing = s.add({ type: "task", title: "Guitar lesson", parent: id });
    expect(removeCategory(s, id).ok).toBe(true); expect(s.get(id)).toBeNull(); expect(s.get(thing).parent).toBe("bag");
  });
  it("built-in categories and the bag can't be removed, and names must be unique", () => {
    const s = fresh();
    expect(removeCategory(s, "home").ok).toBe(false); expect(removeCategory(s, "bag").ok).toBe(false);
    expect(addCategory(s, "work").ok).toBe(false); expect(addCategory(s, "").ok).toBe(false);
  });
});

describe("R43 · a done-state sentence becomes a goal card", () => {
  const FRI = new Date(2026, 10, 27, 10, 0); // Friday 27 Nov 2026, 10:00 local
  it("reads the Hebrew examples: day, time of day, object and place", () => {
    const a = parseGoal("עד יום שבת בערב הארגז יהיה במחסן", FRI);
    expect(a).toMatchObject({ ok: true, due: "2026-11-28", time: "18:00", title: "הארגז במחסן", object: "box", scene: "storage" });
    const b = parseGoal("עד מחר בבוקר יש לי שוקולד חדש במקרר", FRI);
    expect(b).toMatchObject({ ok: true, due: "2026-11-28", time: "08:00", title: "יש לי שוקולד חדש במקרר", object: "chocolate", scene: "fridge" });
  });
  it("reads English, with times of day and a clock time", () => {
    expect(parseGoal("By Saturday evening the box will be in the storage room", FRI)).toMatchObject({ ok: true, due: "2026-11-28", time: "18:00", title: "The box is in the storage room", object: "box", scene: "storage" });
    expect(parseGoal("by tomorrow morning there is new chocolate in the fridge", FRI)).toMatchObject({ due: "2026-11-28", time: "08:00", object: "chocolate", scene: "fridge" });
    expect(parseGoal("the form is sent by Monday at 17:30", FRI)).toMatchObject({ due: "2026-11-30", time: "17:30", object: "doc" });
    expect(parseGoal("עד יום ראשון בשעה 9:15 החשבון משולם", FRI)).toMatchObject({ due: "2026-11-29", time: "09:15", object: "doc" });
    expect(parseGoal("עד היום בלילה המפתח בתיק", FRI)).toMatchObject({ due: "2026-11-27", time: "21:00", object: "key" });
  });
  it("needs a when, and something to be true", () => {
    expect(parseGoal("the box is in storage", FRI)).toMatchObject({ ok: false, error: "when" });
    expect(parseGoal("by Saturday", FRI)).toMatchObject({ ok: false, error: "what" });
    expect(parseGoal("", FRI)).toMatchObject({ ok: false });
  });
  it("draws something for any sentence: unknown words fall back to a star in a room", () => {
    expect(parseGoal("by Friday the guitar is tuned", FRI)).toMatchObject({ ok: true, object: "star", scene: "room" });
    expect(artFor("ספר חדש על המדף")).toEqual({ object: "star", scene: "room" });
    expect(artFor("קופסה ברכב")).toEqual({ object: "box", scene: "car" });
  });
  it("counts down to the deadline in local time; a day without a time ends at 23:59", () => {
    const g = { due: "2026-11-28", goal: { time: "08:00" } };
    expect(goalDeadline(g).getHours()).toBe(8);
    expect(timeLeft(g, FRI)).toMatchObject({ late: false, days: 0, hours: 22, minutes: 0 });
    expect(goalDeadline({ due: "2026-11-28", goal: { time: null } }).getHours()).toBe(23);
    expect(timeLeft(g, new Date(2026, 10, 28, 9, 0))).toMatchObject({ late: true });
  });
  it("lives in the store: a card with one first step, Started, Done, kept apart from tasks", () => {
    const s = createStore(memoryBackend(), { now: () => FRI });
    const r = s.addGoal("עד מחר בבוקר יש לי שוקולד חדש במקרר");
    expect(r.ok).toBe(true);
    const g = s.get(r.id);
    expect(g).toMatchObject({ type: "goal", parent: null, due: "2026-11-28", goal: { time: "08:00", object: "chocolate", scene: "fridge", step: null, started: null } });
    s.setGoalStep(r.id, "לקנות בסופר בדרך הביתה", "18:30");
    expect(s.get(r.id).goal.step).toMatchObject({ title: "לקנות בסופר בדרך הביתה", at: "18:30", day: "2026-11-27" });
    s.startGoal(r.id);
    expect(s.get(r.id).goal.started).toBeTruthy();
    expect(s.unplaced().length).toBe(0); // not in the bag
    expect(todayList(s, FRI).empty).toBe(true); // not a task
    expect(s.complete(r.id)).toBeGreaterThan(0);
    expect(s.addGoal("no date here")).toMatchObject({ ok: false, error: "when" });
    const again = createStore({ load: () => s.snapshot(), save() {} }, { now: () => FRI });
    expect(again.get(r.id).goal.step.title).toBe("לקנות בסופר בדרך הביתה");
  });
  it("the board: open goals by deadline, and what was achieved in the last 7 days", () => {
    let t = FRI; const s = createStore(memoryBackend(), { now: () => t });
    const a = s.addGoal("by Saturday evening the box is in storage").id;
    const b = s.addGoal("by tomorrow morning there is chocolate in the fridge").id;
    const c = s.addGoal("by Monday the form is sent").id;
    s.complete(c);
    const B = goalBoard(s, FRI);
    expect(B.open.map((g) => g.id)).toEqual([b, a]);
    expect(B.done.map((g) => g.id)).toEqual([c]);
    expect(B.suggestMore).toBe(true); // 2 open: room for one more of the suggested 3
    s.addGoal("by Sunday the key is in the bag");
    expect(goalBoard(s, FRI).suggestMore).toBe(false);
    t = new Date(2026, 11, 8); expect(goalBoard(s, t).done).toEqual([]);
  });
});

describe("R49 · simple first: the basic card, nothing locked", () => {
  it("a new goal has only the basic parts; there are no levels or unlock rules", () => {
    const s = createStore(memoryBackend(), { now: () => new Date(2026, 10, 27, 10) });
    const g = s.get(s.addGoal("by Saturday the box is in storage").id);
    expect(g.goal).toMatchObject({ step: null, path: [], obstacle: null, stakes: null, released: null });
    expect(g.steps).toBe(null);
    expect(goalBoard(s).locked).toBeUndefined();
  });
  it("the interface has the goals words in both languages", () => {
    for (const k of ["goals", "goalsSub", "goalPh", "firstStep", "firstStepPh", "started", "goalDone", "achievedWeek", "goalNeedsWhen", "goalNeedsWhat", "roomForOne", "leftDH", "leftHM", "goalLate", "goalAdded"]) {
      expect(DICTS.en[k], k).toBeTruthy(); expect(DICTS.he[k], k).toBeTruthy();
    }
  });
});

describe("R44 · plan backward from the finish", () => {
  const FRI = new Date(2026, 10, 27, 10, 0);
  it("spreads station dates back from the deadline, earliest today, never after it", () => {
    expect(spreadDates(3, "2026-11-27", "2026-11-30")).toEqual(["2026-11-27", "2026-11-28", "2026-11-29"]);
    expect(spreadDates(2, "2026-11-27", "2026-11-28")).toEqual(["2026-11-27", "2026-11-27"]);
    expect(spreadDates(1, "2026-12-30", "2026-12-31")).toEqual(["2026-12-30"]);
    expect(spreadDates(0, "2026-11-27", "2026-11-30")).toEqual([]);
  });
  it("each answer to 'what must be true just before?' goes in front; 'I can do this now' becomes the first step", () => {
    const s = createStore(memoryBackend(), { now: () => FRI });
    const id = s.addGoal("עד יום שלישי בערב הארגז יהיה במחסן").id; // Tue 1 Dec
    s.planBefore(id, "הארגז ברכב");
    s.planBefore(id, "המפתח בתיק");
    s.planBefore(id, "הארגז סגור ומסומן");
    const g = s.get(id).goal;
    expect(g.path.map((x) => x.title)).toEqual(["הארגז סגור ומסומן", "המפתח בתיק", "הארגז ברכב"]);
    expect(g.path.map((x) => x.due)).toEqual(["2026-11-27", "2026-11-28", "2026-11-29"]);
    expect(g.path[0]).toMatchObject({ done: false, object: "box" });
    s.setStationDue(id, 1, "2026-11-30");
    s.planBefore(id, "יש סלוטייפ"); // a moved date stays where the owner put it
    expect(s.get(id).goal.path[2].due).toBe("2026-11-30");
    s.nowStep(id, "לסגור את הארגז");
    expect(s.get(id).goal.step).toMatchObject({ title: "לסגור את הארגז" });
    expect(s.completeStation(id, 0)).toBeGreaterThan(0);
    expect(s.get(id).goal.path[0].done).toBe(true);
    s.removeStation(id, 0);
    expect(s.get(id).goal.path.length).toBe(3);
  });
  it("one obstacle with an if–then plan", () => {
    const s = createStore(memoryBackend(), { now: () => FRI });
    const id = s.addGoal("by Saturday evening the box is in storage").id;
    s.setObstacle(id, "I'm tired on Saturday", "I only load the car and drive");
    expect(s.get(id).goal.obstacle).toEqual({ if: "I'm tired on Saturday", then: "I only load the car and drive" });
    s.setObstacle(id, "", "");
    expect(s.get(id).goal.obstacle).toBe(null);
  });
  it("progress shows what is done early on, and what is left near the end (small-area)", () => {
    const g = (done, n) => ({ goal: { path: Array.from({ length: n }, (_, i) => ({ done: i < done })) } });
    expect(progressView(g(0, 0))).toBe(null);
    expect(progressView(g(1, 4))).toEqual({ kind: "done", done: 1, total: 5 });
    expect(progressView(g(3, 4))).toEqual({ kind: "left", left: 2, total: 5 });
  });
});

describe("R45 · when a step doesn't move: questions, not nagging", () => {
  const MON = new Date(2026, 10, 23, 9, 0);
  it("asks when the step's time passed without Started, or a third of the time went by with nothing done", () => {
    let t = MON; const s = createStore(memoryBackend(), { now: () => t });
    const id = s.addGoal("by Sunday evening the box is in storage").id; // Sun 29 Nov 18:00
    expect(stuckReason(s.get(id), t)).toBe(null);
    s.setGoalStep(id, "Tape the box", "20:00");
    t = new Date(2026, 10, 23, 21, 0); expect(stuckReason(s.get(id), t)).toBe("step-time");
    s.startGoal(id); expect(stuckReason(s.get(id), t)).toBe(null);
    const id2 = s.addGoal("by Sunday evening the form is sent").id; // created Mon 21:00
    t = new Date(2026, 10, 25, 22, 0); expect(stuckReason(s.get(id2), t)).toBe("no-progress");
    s.markAsked(id2); expect(stuckReason(s.get(id2), t)).toBe(null); // at most once a day
    t = new Date(2026, 10, 26, 9, 0); expect(stuckReason(s.get(id2), t)).toBe("no-progress");
  });
  it("each answer leads to an action", () => {
    let t = MON; const s = createStore(memoryBackend(), { now: () => t });
    expect(STUCK_ANSWERS).toEqual(["missing", "unclear", "energy", "time", "someone", "unimportant"]);
    const id = s.addGoal("by Sunday evening the box is in storage").id;
    s.setGoalStep(id, "Tape the box", "20:00");
    expect(s.answerStuck(id, "missing", "Buy tape on the way home")).toMatchObject({ action: "addBefore" });
    expect(s.get(id).goal.step.title).toBe("Buy tape on the way home");
    expect(s.get(id).goal.path[0].title).toBe("Tape the box");
    expect(s.answerStuck(id, "unclear")).toMatchObject({ action: "smaller" });
    expect(s.get(id).goal.step.title).toBe("2′ · Buy tape on the way home");
    s.answerStuck(id, "energy"); expect(s.get(id).goal.step.title).toBe("2′ · Buy tape on the way home"); // not twice
    t = new Date(2026, 10, 23, 22, 0);
    expect(s.answerStuck(id, "time", "08:30")).toMatchObject({ action: "reschedule" });
    expect(s.get(id).goal.step).toMatchObject({ at: "08:30", day: "2026-11-24" });
    expect(s.answerStuck(id, "someone", "Ask Dan for the key")).toMatchObject({ action: "ask" });
    expect(s.get(id).goal.step.title).toBe("Ask Dan for the key");
    expect(s.get(id).goal.asked).toBe("2026-11-23");
    expect(s.answerStuck(id, "unimportant")).toMatchObject({ action: "release" });
    const B = goalBoard(s, t);
    expect(B.open.length).toBe(0); expect(B.done.length).toBe(0); expect(B.released.length).toBe(1);
  });
  it("'what happens if not?' sets a soft or hard deadline", () => {
    const s = createStore(memoryBackend(), { now: () => MON });
    const id = s.addGoal("by Sunday the box is in storage").id;
    s.setStakes(id, "hard"); expect(s.get(id).goal.stakes).toBe("hard");
    s.setStakes(id, "nonsense"); expect(s.get(id).goal.stakes).toBe(null);
  });
  it("the interface words exist in both languages", () => {
    for (const k of ["planBack", "justBefore", "canDoNow", "obstacleIf", "obstacleThen", "progDone", "progLeft", "stuckBanner", "stuckQ", "ans_missing", "ans_unclear", "ans_energy", "ans_time", "ans_someone", "ans_unimportant", "stakesQ", "stakes_none", "stakes_soft", "stakes_hard", "notNow", "youAreHere", "released", "m_theme", "th_contrast", "th_faded"])
      { expect(DICTS.en[k], k).toBeTruthy(); expect(DICTS.he[k], k).toBeTruthy(); }
  });
});

describe("R51 · an action log with a time tag for every add, update and delete, and the raw inputs", () => {
  let clock; const at = (h, m = 0, sec = 0) => { clock = new Date(2026, 10, 28, h, m, sec); };
  const mk = (opts = {}) => { at(9); return createStore(memoryBackend(), { now: () => clock, device: "phone-1", ...opts }); };
  it("logs add, update and remove with time, fields, who and which device", () => {
    const s = mk();
    at(9, 0, 5); const id = s.add({ type: "task", title: "Pay arnona", parent: "paperwork" });
    at(9, 1); s.update(id, { due: "2026-12-01" });
    at(9, 2); s.as("claude"); s.update(id, { title: "Pay the arnona" }); s.as("me");
    at(9, 3); s.remove(id);
    const j = s.journal().filter((e) => e.id === id);
    expect(j.map((e) => e.op)).toEqual(["add", "update", "update", "remove"]);
    expect(j[0]).toMatchObject({ at: new Date(2026, 10, 28, 9, 0, 5).toISOString(), by: "me", device: "phone-1", type: "task" });
    expect(j[1].fields).toEqual(["due"]); expect(j[1].after).toEqual({ due: "2026-12-01" });
    expect(j[2]).toMatchObject({ by: "claude", fields: ["title"] });
    expect(j.map((e) => e.seq)).toEqual([...j.map((e) => e.seq)].sort((a, b) => a - b));
  });
  it("catches every way of changing things: completing, goals, stations, stuck answers", () => {
    const s = mk(); const id = s.addGoal("by Tuesday evening the box is in storage").id;
    s.planBefore(id, "The box is in the car"); s.completeStation(id, 0); s.answerStuck(id, "unimportant");
    const t = s.add({ type: "task", title: "Call", parent: "family" }); s.complete(t);
    const ops = s.journal().map((e) => `${e.op}:${e.fields?.join("+") || ""}`);
    expect(ops.filter((o) => o.startsWith("update")).length).toBeGreaterThanOrEqual(4);
    expect(s.journal().some((e) => e.id === t && e.fields?.includes("done"))).toBe(true);
    expect(s.journal().some((e) => e.op === "state" && e.fields.includes("coins"))).toBe(true);
  });
  it("keeps each raw input exactly as typed, with its source and what it became", () => {
    const s = mk();
    const a = s.capture("  לשלם ארנונה עד יום ראשון  ", { source: "voice" });
    const g = s.addGoal("עד מחר בבוקר יש לי שוקולד חדש במקרר").id;
    s.addGoal("no date here");
    s.input("share", "https://example.com/article");
    const ins = s.inputs();
    expect(ins.map((x) => [x.kind, x.text, x.result ?? null])).toEqual([
      ["voice", "  לשלם ארנונה עד יום ראשון  ", a], ["goal", "עד מחר בבוקר יש לי שוקולד חדש במקרר", g], ["goal", "no date here", null], ["share", "https://example.com/article", null]]);
    expect(ins[0]).toMatchObject({ device: "phone-1", at: clock.toISOString() });
  });
  it("saves version 3 with the log, inputs and profile; version-2 data moves over and is logged", () => {
    const back = memoryBackend(); const s = createStore(back, { now: () => new Date(2026, 10, 28), device: "pc-1" });
    s.add({ id: "k", type: "note", title: "Keep", parent: "home" }); s.setProfile("workWeek", { days: [0, 1, 2, 3, 4], from: "08:30", to: "16:30" });
    const saved = back.load();
    expect(saved.version).toBe(3); expect(saved.journal.length).toBeGreaterThan(0); expect(saved.profile.workWeek.value.from).toBe("08:30");
    const again = createStore(back, { now: () => new Date(2026, 10, 29) }); expect(again.journal().length).toBe(s.journal().length);
    const v2 = { version: 2, nodes: [{ id: "old", type: "task", title: "Old", parent: "work" }], deleted: [], state: { xp: 5, log: [], coins: 1, decor: [] } };
    const m = createStore({ load: () => v2, save() {} }, { now: () => new Date(2026, 10, 28) });
    expect(m.get("old").title).toBe("Old"); expect(m.journal()[0]).toMatchObject({ op: "migrate", from: 2 });
    const snap = s.snapshot(); expect(snap.journal.length).toBe(s.journal().length); expect(snap.profile.workWeek).toBeTruthy();
    const r = createStore(memoryBackend(), { now: () => new Date(2026, 10, 30) }); r.restore(snap);
    expect(r.profile().workWeek.from).toBe("08:30"); expect(r.journal().at(-1)).toMatchObject({ op: "restore" });
  });
  it("is ready to encrypt: what the server may see is split from the content", () => {
    const s = mk(); const id = s.add({ type: "task", title: "Secret plan", parent: "work" });
    const e = s.journal().find((x) => x.id === id);
    const { meta, content } = splitForSync("journal", e);
    expect(meta).toMatchObject({ kind: "journal", id, op: "add", at: e.at, device: "phone-1", seq: e.seq });
    expect(JSON.stringify(meta)).not.toContain("Secret plan"); expect(JSON.parse(content).after.title).toBe("Secret plan");
    const n = splitForSync("node", s.get(id)); expect(n.meta).toMatchObject({ kind: "node", id, updated: s.get(id).updated }); expect(JSON.stringify(n.meta)).not.toContain("Secret");
  });
});

describe("R52 · the user profile (memory): week, rest, effective times, with history", () => {
  const mk = () => { let t = new Date(2026, 10, 28, 9); const s = createStore(memoryBackend(), { now: () => t }); return { s, tick: (h) => { t = new Date(2026, 10, 28, h); } }; };
  it("has sensible Israeli defaults until you set your own", () => {
    const { s } = mk();
    expect(s.profile().workWeek).toEqual(DEFAULT_PROFILE.workWeek);
    expect(DEFAULT_PROFILE.workWeek.days).toEqual([0, 1, 2, 3, 4]);
    expect(s.profileEntry("workWeek")).toMatchObject({ source: "default" });
    expect(PROFILE_KEYS).toEqual(expect.arrayContaining(["workWeek", "restTimes", "focusTimes", "lowTimes", "errands", "placeHours", "people"]));
  });
  it("validates what you set and keeps every earlier value with its time", () => {
    const { s, tick } = mk();
    expect(s.setProfile("workWeek", { days: [0, 1, 2, 3], from: "08:00", to: "16:00" })).toMatchObject({ ok: true });
    tick(10); s.setProfile("workWeek", { days: [0, 1, 2, 3, 4], from: "09:00", to: "18:00" });
    const e = s.profileEntry("workWeek");
    expect(e).toMatchObject({ source: "me", value: { from: "09:00" } }); expect(e.history.map((h) => h.value.from)).toEqual(["08:00"]);
    expect(s.setProfile("workWeek", { days: [9], from: "18:00", to: "09:00" })).toMatchObject({ ok: false });
    expect(s.setProfile("restTimes", [{ days: [5, 6], from: "14:00", to: "16:00", label: "nap" }]).ok).toBe(true);
    expect(s.setProfile("focusTimes", [{ days: [0, 1, 2, 3, 4], from: "07:00", to: "10:00" }]).ok).toBe(true);
    expect(s.setProfile("lowTimes", [{ days: [0], from: "25:00", to: "26:00" }]).ok).toBe(false);
    expect(s.setProfile("errands", { friday: true, saturday: false }).ok).toBe(true);
    expect(s.setProfile("favouriteColour", "blue").ok).toBe(false);
    expect(validProfile("people", [{ name: "Dan", note: "brother, home Friday mornings" }])).toBe(true);
    expect(s.journal().filter((x) => x.op === "profile").map((x) => x.key)).toEqual(["workWeek", "workWeek", "restTimes", "focusTimes", "errands"]);
  });
  it("learned values are only suggestions until you accept them", () => {
    const { s } = mk();
    const sid = s.suggestProfile("focusTimes", [{ days: [0, 1, 2, 3, 4], from: "06:30", to: "08:30" }], "You finish most goals before 08:30");
    expect(s.profile().focusTimes).toEqual([]); expect(s.suggestions().length).toBe(1);
    s.acceptSuggestion(sid);
    expect(s.profile().focusTimes[0].from).toBe("06:30"); expect(s.profileEntry("focusTimes").source).toBe("learned"); expect(s.suggestions().length).toBe(0);
    const s2 = s.suggestProfile("lowTimes", [{ days: [4], from: "15:00", to: "17:00" }], "x"); s.rejectSuggestion(s2);
    expect(s.profile().lowTimes).toEqual([]); expect(s.suggestions().length).toBe(0);
  });
  it("the interface words exist in both languages", () => {
    for (const k of ["m_profile", "m_journal", "pf_title", "pf_sub", "pf_work", "pf_days", "pf_from", "pf_to", "pf_rest", "pf_focus", "pf_low", "pf_errands", "pf_friday", "pf_saturday", "pf_add", "pf_none", "pf_byMe", "pf_learned", "pf_default", "pf_saved", "pf_bad", "pf_suggest", "pf_noSuggest", "jr_title", "jr_sub", "jr_actions", "jr_inputs", "op_add", "op_update", "op_remove", "op_state", "op_profile", "op_migrate", "op_restore", "op_reset", "by_me", "by_claude", "by_app", "jr_empty", "day0", "day6"])
      { expect(DICTS.en[k], k).toBeTruthy(); expect(DICTS.he[k], k).toBeTruthy(); }
  });
});
