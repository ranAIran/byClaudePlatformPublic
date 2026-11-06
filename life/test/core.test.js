// Requirements as tests (see "Requirements as tests" in the Life Archipelago Plan doc).
// Each block names the requirement it checks. Written before the code; run with `npm test`.
import { describe, it, expect } from "vitest";
import { createStore, memoryBackend } from "../app/core/store.js";
import { parseCapture } from "../app/core/capture.js";
import { suggestPlaces } from "../app/core/places.js";
import { levelFor, XP } from "../app/core/xp.js";
import { exportMarkdown, importMarkdown, exportJSON, importJSON } from "../app/core/exporter.js";
import { shareToNode } from "../app/core/share.js";

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
