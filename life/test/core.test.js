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
  it("seeds the world with five islands and four home rooms", () => {
    const s = fresh();
    expect(s.children("world").map((n) => n.id).sort()).toEqual(["family", "health", "home", "paperwork", "work"]);
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
  it("moves version-1 data from localStorage on first start without losing an item, then saves version 2", async () => {
    const old = fresh(); old.add({ id: "x1", type: "task", title: "Renew passport", parent: "paperwork" }); old.award(30, "test");
    const ls = fakeLS({ "life-archipelago-v1": JSON.stringify(old.snapshot()) }), idb = new IDBFactory();
    const b1 = await openSavedBackend({ idb, ls });
    expect(b1.kind).toBe("indexeddb"); expect(b1.migrated).toBe(true);
    const s = createStore(b1, { now: () => NOW });
    expect(s.get("x1").title).toBe("Renew passport"); expect(s.xp()).toBe(30);
    s.add({ id: "x2", type: "note", title: "New", parent: "work" }); await b1.flush();
    const b2 = await openSavedBackend({ idb, ls }); const data = b2.load();
    expect(b2.migrated).toBe(false); expect(data.version).toBe(2); expect(data.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["x1", "x2"]));
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
