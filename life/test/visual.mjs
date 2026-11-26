// Visual and flow checks in a real browser (R4, R5 and the capture flow). Run: npm run test:visual
// Serves the repository root, opens life/app/ at phone size, and fails on a blank frame.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const root = normalize(join(fileURLToPath(import.meta.url), "../../.."));
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".css": "text/css", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  try { const p = normalize(join(root, decodeURIComponent(req.url.split("?")[0]))); if (!p.startsWith(root)) throw 0; const f = p.endsWith("/") ? join(p, "index.html") : p; res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream" }); res.end(await readFile(f)); }
  catch (e) { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/life/app/`;
const out = process.argv[2] || ".";
const failures = [];
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) failures.push(msg); };
const colours = async (p) => p.evaluate(async (b64) => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = 120; c.height = 120; const x = c.getContext("2d"); x.drawImage(im, 0, im.height * 0.3, im.width, im.height * 0.35, 0, 0, 120, 120); const d = x.getImageData(0, 0, 120, 120).data; const s = new Set(); for (let i = 0; i < d.length; i += 4) s.add((d[i] >> 4) + "," + (d[i + 1] >> 4) + "," + (d[i + 2] >> 4)); return s.size; }, (await p.screenshot()).toString("base64"));
// A 24×24 grey thumbnail of the 3D area (middle of the screen) to compare frames.
const thumb = async (p) => p.evaluate(async (b64) => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = 24; c.height = 24; const x = c.getContext("2d"); x.drawImage(im, 0, im.height * 0.25, im.width, im.height * 0.5, 0, 0, 24, 24); const d = x.getImageData(0, 0, 24, 24).data; const g = []; for (let i = 0; i < d.length; i += 4) g.push((d[i] + d[i + 1] + d[i + 2]) / 3); return g; }, (await p.screenshot()).toString("base64"));
const dist = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
// Average colour of the city centre (the plaza and its buildings), to check the golden-hour light.
const warmth = async (p, cx = 0.5, cy = 0.52) => p.evaluate(async ([b64, cx, cy]) => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = 48; c.height = 48; const x = c.getContext("2d"); x.drawImage(im, im.width * (cx - 0.15), im.height * (cy - 0.07), im.width * 0.3, im.height * 0.14, 0, 0, 48, 48); const d = x.getImageData(0, 0, 48, 48).data; let r = 0, g = 0, bl = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; } const n = d.length / 4; return { r: r / n, g: g / n, b: bl / n }; }, [(await p.screenshot()).toString("base64"), cx, cy]);

const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ ...devices["Pixel 7"], deviceScaleFactor: 1 }); // 1× keeps the software renderer quick
const p = await ctx.newPage(); const errs = [];
p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
await p.goto(base); await p.waitForFunction(() => window.__life?.ready, null, { timeout: 120000 }); await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/v-map.png` });
check((await colours(p)) > 40, "R5 map frame is not blank");
const mapThumb = await thumb(p);
// R18 · the map is a city of five life districts; tapping a building opens its district.
const districts = await p.evaluate(() => window.__life.districts?.() || []);
check(["home", "family", "paperwork", "work", "health"].every((id) => districts.some((d) => d.id === id)), `R18 the city has the five life districts (${districts.map((d) => d.id).join(", ")})`);
const hall = districts.find((d) => d.id === "paperwork");
if (hall) { await p.mouse.click(hall.x, hall.y); await p.waitForTimeout(350); }
check(!(await p.isHidden("#sheet")) && (await p.textContent("#sheetTitle")).includes("Paperwork"), "R18 tapping the city hall opens Paperwork");
await p.tap("#sheetClose").catch(() => {}); await p.waitForTimeout(800); // let the scrim behind the sheet fade out
const meshes = await p.evaluate(() => window.__life.meshes?.() ?? 9999);
check(meshes < 260, `R18 the city is merged into few draw calls for phones (${meshes} meshes)`);
// R34 · Today: the pill opens one list with today's tasks; ticking one there works like anywhere else.
{
  await p.tap(".pill.today"); await p.waitForTimeout(400);
  const t = await p.evaluate(() => ({ title: document.getElementById("sheetTitle").textContent, rows: [...document.querySelectorAll("#sheetBody .item .t")].map((x) => x.textContent), secs: [...document.querySelectorAll("#sheetBody .sec")].map((x) => x.textContent) }));
  await p.screenshot({ path: `${out}/v-today.png` });
  check(t.title === "Today" && t.secs.includes("Today") && t.rows.includes("Gym · legs day") && t.rows.includes("Call grandma"), `R34 Today lists what is due (${t.secs.join(", ")}: ${t.rows.join(", ")})`);
  await p.tap("#sheetClose"); await p.waitForTimeout(700);
}
// R35 · a repeating task comes back with its next date after you tick it; R21 · a deep link adds to the bag.
{
  const rid = await p.evaluate(() => window.__life.store.add({ type: "task", title: "Water the plants", parent: "health", due: new Date().toISOString().slice(0, 10), repeat: { every: 1, unit: "week" } }));
  await p.evaluate(() => window.__life.ui.openSheet("health")); await p.waitForTimeout(400);
  const row = await p.$(`#sheetBody [data-act="toggle"][data-id="${rid}"]`); await row.tap(); await p.waitForTimeout(500);
  const after = await p.evaluate((id) => { const n = window.__life.store.get(id); return { done: n.done, due: n.due, row: [...document.querySelectorAll("#sheetBody .item")].map((r) => r.innerText).find((t) => t.includes("Water the plants")) || "" }; }, rid);
  check(!after.done && after.due > new Date().toISOString().slice(0, 10) && /every week/.test(after.row), `R35 a repeating task comes back open, with its next date (${after.row.replace(/\s+/g, " ")})`);
  await p.evaluate((id) => window.__life.store.remove(id), rid); await p.evaluate(() => window.__life.ui.closeSheet()); await p.waitForTimeout(600);
  const bag0 = await p.evaluate(() => window.__life.store.unplaced().length);
  await p.evaluate(() => window.__life.link("lifearchipelago://add?text=" + encodeURIComponent("buy light bulbs tomorrow"))); await p.waitForTimeout(300);
  const bag1 = await p.evaluate(() => window.__life.store.unplaced().map((n) => n.title));
  check(bag1.length === bag0 + 1 && bag1.includes("Buy light bulbs"), `R21 a deep link adds to the bag (${bag1.join(", ")})`);
  await p.evaluate(() => { const s = window.__life.store; for (const n of s.unplaced()) if (n.title === "Buy light bulbs") s.remove(n.id); });
}
// R33 · edit an item: tap its name, change the name and the date, save; the row shows the change.
{
  const hallE = (await p.evaluate(() => window.__life.districts())).find((d) => d.id === "paperwork");
  await p.mouse.click(hallE.x, hallE.y); await p.waitForTimeout(400);
  await p.click('#sheetBody .t:text("Pay electricity bill")'); await p.waitForTimeout(300);
  const opened = !(await p.isHidden("#editor"));
  await p.fill("#edTitle", "Pay the electricity bill"); await p.click('#edDueChips [data-days="1"]'); await p.click("#edSave"); await p.waitForTimeout(400);
  const row = await p.evaluate(() => [...document.querySelectorAll("#sheetBody .item")].map((r) => r.innerText).find((t) => t.includes("Pay the electricity bill")) || "");
  await p.screenshot({ path: `${out}/v-edit.png` });
  check(opened && /tomorrow/.test(row) && (await p.isHidden("#editor")), `R33 editing an item changes its name and date (${row.replace(/\s+/g, " ").slice(0, 60)})`);
  await p.click('#sheetBody .t:text("Pay the electricity bill")'); await p.waitForTimeout(200); await p.fill("#edTitle", "Pay electricity bill"); await p.click("#edSave"); await p.waitForTimeout(200);
  await p.tap("#sheetClose"); await p.waitForTimeout(800);
}
// R28 · golden hour: the light is warm.
const hallAt = (await p.evaluate(() => window.__life.districts())).find((d) => d.id === "paperwork"), vp = p.viewportSize();
await p.addStyleTag({ content: "body.measure #labels, body.measure #hud, body.measure #hint, body.measure #dock, body.measure #viewCtl, body.measure #scrim { visibility: hidden !important; }" });
await p.evaluate(() => document.body.classList.add("measure")); await p.waitForTimeout(300);
const warm = await warmth(p, hallAt.x / vp.width, hallAt.y / vp.height); // the 3D alone, around the city hall
await p.evaluate(() => document.body.classList.remove("measure"));
check(warm.r > warm.b + 20, `R28 the city hall and its plaza are lit by a low warm sun (red ${warm.r.toFixed(0)}, blue ${warm.b.toFixed(0)})`);
// R27 · an overdue task shows on its district (scaffolding, cones, flickering lamp) and goes when it is done.
const mood0 = await p.evaluate(() => window.__life.moods?.().paperwork);
const lateId = await p.evaluate(() => window.__life.store.add({ type: "task", title: "Late form", parent: "paperwork", due: "2020-01-01" }));
await p.waitForTimeout(500); await p.screenshot({ path: `${out}/v-overdue.png` });
const mood1 = await p.evaluate(() => window.__life.moods?.().paperwork);
await p.evaluate((id) => window.__life.store.complete(id), lateId); await p.waitForTimeout(200);
const mood2 = await p.evaluate(() => window.__life.moods?.().paperwork);
await p.evaluate((id) => window.__life.store.remove(id), lateId); await p.waitForTimeout(300);
check(mood0?.state === "open" && !mood0.signs && mood1?.state === "overdue" && mood1.signs === "overdue" && mood2?.state === "open" && !mood2.signs, `R27 an overdue task puts repair signs on its district, and finishing it removes them (${JSON.stringify([mood0, mood1, mood2])})`);
// R29 · the world can be turned; labels and taps follow the buildings.
const band = async (y0, y1) => p.evaluate(async ([b64, y0, y1]) => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = 32; c.height = 8; const x = c.getContext("2d"); x.drawImage(im, 0, im.height * y0, im.width, im.height * (y1 - y0), 0, 0, 32, 8); const d = x.getImageData(0, 0, 32, 8).data; let r = 0, g = 0, bl = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; } const n = d.length / 4; return { r: r / n, g: g / n, b: bl / n }; }, [(await p.screenshot()).toString("base64"), y0, y1]);
const cam0 = await p.evaluate(() => window.__life.cam());
const yawIs = (y) => p.waitForFunction((y) => Math.abs(window.__life.cam().yaw - y) < 0.01, y, { timeout: 15000 }).catch(() => {});
await p.tap("#rotR"); await yawIs(cam0.yaw + Math.PI / 4); await p.waitForTimeout(300);
const cam1 = await p.evaluate(() => window.__life.cam()), turned = await thumb(p);
await p.screenshot({ path: `${out}/v-turned.png` });
check(cam0.perspective && Math.abs(cam1.yaw - cam0.yaw - Math.PI / 4) < 0.03 && dist(turned, mapThumb) > 4, `R29 the turn button rotates the world by 45° (yaw ${cam0.yaw.toFixed(2)} → ${cam1.yaw.toFixed(2)}, picture changed by ${dist(turned, mapThumb).toFixed(1)})`);
const hall2 = (await p.evaluate(() => window.__life.districts())).find((d) => d.id === "paperwork");
await p.mouse.click(hall2.x, hall2.y); await p.waitForTimeout(350);
check(!(await p.isHidden("#sheet")) && (await p.textContent("#sheetTitle")).includes("Paperwork"), "R29 after turning, tapping the city hall still opens Paperwork");
await p.tap("#sheetClose").catch(() => {}); await p.tap("#rotL"); await yawIs(cam0.yaw); await p.waitForTimeout(300);
check(dist(await thumb(p), mapThumb) < 3, "R29 turning back returns to the same view");
// R29 · the middle mouse button pans (moves the view across the ground, without turning it).
const free = await p.evaluate(() => { const c = document.querySelector("#stage canvas"); for (let y = 300; y < 650; y += 25) for (let x = 60; x < 360; x += 25) if (document.elementFromPoint(x, y) === c && document.elementFromPoint(x + 60, y + 40) === c) return { x, y }; return { x: 200, y: 400 }; });
await p.mouse.move(free.x, free.y); await p.mouse.down({ button: "middle" }); await p.mouse.move(free.x + 60, free.y + 40, { steps: 4 }); await p.mouse.up({ button: "middle" }); await p.waitForTimeout(400);
const panned = await p.evaluate(() => window.__life.cam());
check(panned.pan > 0.5 && Math.abs(panned.yaw - cam0.yaw) < 0.01 && (await p.isHidden("#sheet")), `R29 middle-drag pans the view and opens nothing (moved ${panned.pan.toFixed(2)} units, yaw kept)`);
await p.evaluate(() => window.__life.setCam({ pan: 0 })); await p.waitForTimeout(300);
// R30 · a true 3D world: tilt down and the sky and horizon fill the top of the view.
await p.evaluate(() => window.__life.setCam({ pitch: 0.14 })); await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/v-horizon.png` });
const skyB = await band(0.16, 0.24), seaB = await band(0.8, 0.86);
check(skyB.r > 170 && skyB.r > skyB.b + 15 && Math.abs(skyB.r - seaB.r) > 40, `R30 tilting down shows a warm sky above the horizon and the sea below (sky ${JSON.stringify(Object.values(skyB).map(Math.round))}, sea ${JSON.stringify(Object.values(seaB).map(Math.round))})`);
await p.evaluate((pitch) => window.__life.setCam({ pitch }), cam0.pitch); await p.waitForTimeout(500);
// R32 · touching a ball kicks it: it flies, bounces and rolls.
const toy0 = (await p.evaluate(() => window.__life.props())).toys[0];
await p.mouse.click(toy0.x, toy0.y); await p.waitForTimeout(600);
const toy1 = (await p.evaluate(() => window.__life.props())).toys[0];
check(Math.hypot(toy1.p[0] - toy0.p[0], toy1.p[1] - toy0.p[1], toy1.p[2] - toy0.p[2]) > 0.3, `R32 tapping the ball kicks it (moved ${Math.hypot(toy1.p[0] - toy0.p[0], toy1.p[1] - toy0.p[1], toy1.p[2] - toy0.p[2]).toFixed(2)} units)`);
// R31 · walk: tap the city hall and you walk to its door; the camera follows; arriving opens Paperwork.
await p.tap("#walkBtn"); await p.waitForFunction(() => window.__life.walk().k > 0.97, null, { timeout: 20000 }).catch(() => {});
const wk0 = await p.evaluate(() => window.__life.walk());
await p.screenshot({ path: `${out}/v-walk.png` });
// A tap on the ground walks to that spot (here: the driveway, on the camera's side of you).
const spot = await p.evaluate(() => { const m = window.__life.walk(); return window.__life.screenOf(m.x + 1.3, 0.3, m.z + 0.9); });
await p.mouse.click(spot.x, spot.y); await p.waitForTimeout(2500);
const wkTap = await p.evaluate(() => window.__life.walk());
check(Math.hypot(wkTap.x - wk0.x, wkTap.z - wk0.z) > 0.4 && wkTap.x > wk0.x, `R31 tapping the ground walks you there (moved ${Math.hypot(wkTap.x - wk0.x, wkTap.z - wk0.z).toFixed(2)} units)`);
// Then to the city hall: the same call a tap on the building makes.
await p.evaluate(() => window.__life.goTo("paperwork"));
await p.waitForFunction(() => window.__life.walk().arrived === "paperwork", null, { timeout: 120000 }).catch(() => {});
await p.waitForTimeout(400);
const wk1 = await p.evaluate(() => window.__life.walk());
await p.screenshot({ path: `${out}/v-arrived.png` });
check(wk0.mode === "walk" && Math.hypot(wk1.x - wk0.x, wk1.z - wk0.z) > 4 && wk1.arrived === "paperwork" && !(await p.isHidden("#sheet")) && (await p.textContent("#sheetTitle")).includes("Paperwork"), `R31 you walk from home to the city hall door and Paperwork opens (walked ${Math.hypot(wk1.x - wk0.x, wk1.z - wk0.z).toFixed(1)} units, arrived: ${wk1.arrived})`);
// R32 · finishing a task there makes coins burst out of the door when the sheet closes.
await p.tap('#sheetBody [data-act="toggle"]'); await p.waitForTimeout(300);
await p.tap("#sheetClose"); await p.waitForTimeout(500);
const coins = (await p.evaluate(() => window.__life.props())).coins;
await p.screenshot({ path: `${out}/v-coins.png` });
check(coins >= 5, `R32 finishing a task makes coins burst out of the building (${coins} coins in the air)`);
await p.tap("#walkBtn"); await p.waitForFunction(() => window.__life.walk().k < 0.03, null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(6500); // and let the coins fade
await p.evaluate(() => { const s = window.__life.store; for (const n of s.all()) if (n.title === "Pay electricity bill" && n.done) s.reopen(n.id); });
// Capture into the bag, then place it from the bag.
await p.fill("#capInput", "renew passport before March"); await p.press("#capInput", "Enter"); await p.waitForTimeout(300);
const bagN = await p.evaluate(() => window.__life.store.unplaced().length);
check(bagN >= 1, `R1 capture lands in the bag (${bagN} unplaced)`);
await p.tap("#bagBtn"); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/v-bag.png` });
const firstChip = await p.$('#sheetBody [data-act="place"]');
const to = await firstChip.getAttribute("data-to"); await firstChip.tap(); await p.waitForTimeout(200);
check(to === "paperwork" || (await p.evaluate(() => window.__life.store.unplaced().length)) < bagN, `R2 first suggestion places the item (${to})`);
await p.tap("#sheetClose");
// Fly into Home (R4) and check the interior renders.
const cityThumb = await thumb(p); // the city as it looks now, to compare with after coming back
await p.click(".lbl >> nth=0"); await p.waitForFunction(() => window.__lastFlyMs, null, { timeout: 5000 }); const flyMs = await p.evaluate(() => window.__lastFlyMs);
await p.waitForTimeout(900); await p.screenshot({ path: `${out}/v-home.png` });
check(flyMs < 1200, `R4 fly into Home took ${flyMs} ms`);
check((await colours(p)) > 40, "R5 home frame is not blank");
const tanks = JSON.stringify(await p.evaluate(() => window.__life.terrariums()));
check(tanks === '[[60,60,45,"lizard 22cm"],[60,45,45]]', `R17 bedroom has two terrariums 60×60×45 (with a small lizard) and 60×45×45 cm (${tanks})`);
// Complete a task for XP.
const xp0 = await p.evaluate(() => window.__life.store.xp());
const box = await p.$('#sheetBody [data-act="toggle"]'); if (box) { await box.tap(); await p.waitForTimeout(200); }
// R26 · finishing a task celebrates: its XP flies to the bar, with confetti.
const fx1 = await p.evaluate(() => ({ last: window.__life.lastFx?.(), fly: !!document.querySelector(".xpfly"), confetti: window.__life.confetti?.() || 0 }));
check((await p.evaluate(() => window.__life.store.xp())) > xp0, "R8 completing a task adds XP");
await p.screenshot({ path: `${out}/v-xp.png` });
check(fx1.last?.kind === "task" && fx1.last.xp === 10 && fx1.fly && fx1.confetti > 0, `R26 finishing a task shows +XP flying to the bar and confetti (${JSON.stringify(fx1)})`);
// R26 · reaching the next level is the biggest moment.
await p.evaluate(() => { const s = window.__life.store, L = s.level(); s.award(L.need - L.into - 5, "test"); }); // 5 XP short of the next level
await p.tap('#sheetTabs [data-room="kitchen"]'); await p.waitForTimeout(250);
await p.tap('#sheetBody [data-act="toggle"]'); await p.waitForTimeout(900);
const lu = await p.evaluate(() => ({ shown: !!document.getElementById("levelUp"), text: document.getElementById("levelUp")?.innerText || "", level: window.__life.store.level().level, last: window.__life.lastFx?.() }));
check(lu.shown && lu.text.includes(String(lu.level)) && lu.last?.levelUp === lu.level, `R26 a level-up gets its own moment (${JSON.stringify({ ...lu, text: lu.text.replace(/\s+/g, " ") })})`);
await p.screenshot({ path: `${out}/v-levelup.png` });
await p.tap("#levelUp").catch(() => {}); await p.waitForTimeout(500);
// R4 · back from Home must show the islands again, not the last home frame.
const homeThumb = await thumb(p);
await p.tap("#sheetClose").catch(() => {}); await p.tap("#back"); await p.waitForFunction(() => window.__life.view() === "map"); await p.waitForTimeout(900);
await p.screenshot({ path: `${out}/v-back.png` });
const backThumb = await thumb(p), dMap = dist(backThumb, cityThumb), dHome = dist(backThumb, homeThumb);
check(dMap < dHome * 0.6, `R4 back to map shows the city again (diff to map ${dMap.toFixed(1)}, to home ${dHome.toFixed(1)})`);
// R16 · feedback opens a prefilled GitHub issue.
await p.evaluate(() => { window.__opened = null; window.open = (u) => { window.__opened = u; return null; }; });
await p.tap("#menuBtn"); await p.tap('#menu [data-act="feedback"]'); await p.waitForTimeout(200);
await p.tap('#fbKinds [data-kind="bug"]'); await p.fill("#fbText", "The kitchen label overlaps the fridge"); await p.waitForTimeout(150);
await p.screenshot({ path: `${out}/v-feedback.png` });
await p.tap("#fbGitHub"); await p.waitForTimeout(200);
const opened = await p.evaluate(() => window.__opened || "");
const q = opened ? new URL(opened).searchParams : new URLSearchParams();
check(opened.startsWith("https://github.com/ranAIran/byClaudePlatformPublic/issues/new?") && q.get("title").includes("Bug: The kitchen label overlaps the fridge") && q.get("body").includes("renderer:"), `R16 feedback opens a prefilled GitHub issue (${q.get("title")})`);
// R19 · the data lives in IndexedDB and survives a reload.
{
  const before = await p.evaluate(async () => { await window.__life.flush(); return { st: window.__life.storage(), n: window.__life.store.all().length, xp: window.__life.store.xp() }; });
  await p.reload(); await p.waitForFunction(() => window.__life?.ready, null, { timeout: 120000 });
  const afterR = await p.evaluate(() => ({ n: window.__life.store.all().length, xp: window.__life.store.xp() }));
  check(before.st.kind === "indexeddb" && afterR.n === before.n && afterR.xp === before.xp, `R19 data is in IndexedDB and survives a reload (${before.st.kind}, ${before.n} → ${afterR.n} items, XP ${before.xp} → ${afterR.xp})`);
}
check(errs.length === 0, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
await b.close(); server.close();
process.exit(failures.length ? 1 : 0);
