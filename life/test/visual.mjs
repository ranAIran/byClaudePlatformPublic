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
// The 3D picture alone: overlays (labels, HUD, sheet fade, toasts) hidden while the screenshot is taken.
const bare = async (p) => { await p.addStyleTag({ content: "#labels,#hud,#hint,#scrim,#dock,#viewCtl,#sheet,#toast,#menu{visibility:hidden!important}" }).then((h) => h.evaluate((e) => e.id = "bareStyle")); const b64 = (await p.screenshot()).toString("base64"); await p.evaluate(() => document.getElementById("bareStyle")?.remove()); return b64; };
const thumb = async (p) => p.evaluate(async (b64) => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = 24; c.height = 24; const x = c.getContext("2d"); x.drawImage(im, 0, im.height * 0.25, im.width, im.height * 0.5, 0, 0, 24, 24); const d = x.getImageData(0, 0, 24, 24).data; const g = []; for (let i = 0; i < d.length; i += 4) g.push((d[i] + d[i + 1] + d[i + 2]) / 3); return g; }, await bare(p));
const dist = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
// Average colour of the city centre (the plaza and its buildings), to check the golden-hour light.
const warmth = async (p, cx = 0.5, cy = 0.52) => p.evaluate(async ([b64, cx, cy]) => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = 48; c.height = 48; const x = c.getContext("2d"); x.drawImage(im, im.width * (cx - 0.15), im.height * (cy - 0.07), im.width * 0.3, im.height * 0.14, 0, 0, 48, 48); const d = x.getImageData(0, 0, 48, 48).data; let r = 0, g = 0, bl = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; } const n = d.length / 4; return { r: r / n, g: g / n, b: bl / n }; }, [(await p.screenshot()).toString("base64"), cx, cy]);

const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ ...devices["Pixel 7"], deviceScaleFactor: 1, timezoneId: "Asia/Jerusalem" }); // 1× keeps the software renderer quick; Israel time catches time-zone bugs (R40)
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
// R36 · coins buy a decoration that appears in the district.
{
  await p.evaluate(() => window.__life.store.earnCoins(10, "test"));
  const c0 = await p.evaluate(() => ({ coins: window.__life.store.coins(), decor: window.__life.decor() }));
  await p.evaluate(() => window.__life.ui.openSheet("paperwork")); await p.waitForTimeout(300);
  await p.click('#sheetBody [data-act="shop"]'); await p.waitForTimeout(300);
  await p.click('#sheetBody [data-act="buy"][data-item="bench"]'); await p.waitForTimeout(1200);
  const c1 = await p.evaluate(() => ({ coins: window.__life.store.coins(), decor: window.__life.decor(), hud: document.getElementById("coinTxt").textContent }));
  await p.screenshot({ path: `${out}/v-decor.png` });
  check(c1.decor === c0.decor + 1 && c1.coins === c0.coins - 4 && c1.hud === String(c1.coins), `R36 buying a bench places it in Paperwork and takes 4 coins (${c0.coins} → ${c1.coins}, decorations ${c0.decor} → ${c1.decor})`);
  await p.evaluate(() => window.__life.setCam({ pan: 0, zoom: 1 })); await p.waitForTimeout(500);
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
// R38 · keys and gestures: "t" opens Today, Escape closes it; swiping a task to the right ticks it.
{
  await p.keyboard.press("t"); await p.waitForTimeout(300);
  const tOpen = (await p.textContent("#sheetTitle")) === "Today" && !(await p.isHidden("#sheet"));
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const closed = await p.isHidden("#sheet");
  const sid = await p.evaluate(() => window.__life.store.add({ type: "task", title: "Swipe me", parent: "work" }));
  await p.evaluate(() => window.__life.ui.openSheet("work")); await p.waitForTimeout(300);
  const box = await p.$(`#sheetBody [data-act="toggle"][data-id="${sid}"]`); await box.scrollIntoViewIfNeeded(); await p.waitForTimeout(200); const r = await (await box.evaluateHandle((b) => b.closest(".item"))).boundingBox();
  await p.mouse.move(r.x + 60, r.y + r.height / 2); await p.mouse.down(); await p.mouse.move(r.x + 200, r.y + r.height / 2, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(400);
  const swiped = await p.evaluate((id) => window.__life.store.get(id).done, sid);
  check(tOpen && closed && swiped, `R38 "t" opens Today, Escape closes it, a right swipe ticks a task (${tOpen}, ${closed}, ${swiped})`);
  await p.evaluate((id) => window.__life.store.remove(id), sid); await p.evaluate(() => window.__life.ui.closeSheet()); await p.waitForTimeout(500);
}
// R37 · the interface in Hebrew, right to left; and back to English.
{
  await p.tap("#menuBtn"); await p.tap('#menu [data-act="lang"]'); await p.waitForTimeout(500);
  const he = await p.evaluate(() => ({ dir: document.documentElement.dir, pill: document.querySelector(".pill.today")?.innerText || "", ph: document.getElementById("capInput").placeholder, label: [...document.querySelectorAll(".lbl .nm")].map((x) => x.textContent) }));
  await p.evaluate(() => window.__life.ui.openSheet("today")); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/v-hebrew.png` });
  await p.evaluate(() => window.__life.ui.closeSheet()); await p.waitForTimeout(400);
  await p.tap("#menuBtn"); await p.tap('#menu [data-act="lang"]'); await p.waitForTimeout(400);
  const en = await p.evaluate(() => document.documentElement.dir);
  check(he.dir === "rtl" && /היום/.test(he.pill) && /תיק/.test(he.ph) && he.label.includes("ניירת") && en === "ltr", `R37 the menu switches to Hebrew (right to left) and back (${he.pill.replace(/\s+/g, " ")}, ${he.label.join(", ")})`);
}
// R41 · Shopping is a district; R42 · categories can be renamed, and a new one gets the free block after the city rebuilds.
{
  const has = (await p.evaluate(() => window.__life.districts())).some((d) => d.id === "shopping");
  await p.tap("#menuBtn"); await p.tap('#menu [data-act="categories"]'); await p.waitForTimeout(300);
  await p.fill('#sheetBody form.catrow[data-cat="work"] input', "Job"); await p.press('#sheetBody form.catrow[data-cat="work"] input', "Enter"); await p.waitForTimeout(300);
  const renamed = await p.evaluate(() => window.__life.store.get("work").title);
  await p.screenshot({ path: `${out}/v-categories.png` });
  await p.fill("#catAddForm input", "Hobbies"); await p.press("#catAddForm input", "Enter");
  await p.waitForFunction(() => window.__life?.ready && window.__life.districts().length === 7, null, { timeout: 180000 }).catch(() => {});
  await p.waitForTimeout(800);
  const ds = await p.evaluate(() => window.__life.districts().map((d) => d.id)), names = await p.evaluate(() => [...document.querySelectorAll(".lbl .nm")].map((x) => x.textContent));
  await p.screenshot({ path: `${out}/v-newcat.png` });
  check(has && renamed === "Job" && ds.length === 7 && names.includes("Hobbies") && names.includes("Job"), `R41/R42 Shopping is on the map; renaming and adding a category work (${names.join(", ")})`);
  await p.evaluate(() => window.__life.store.update("work", { title: "Work" }));
}
// R43 · the flag opens the Goals Board: a done-state sentence becomes a drawn card with a countdown and one first step.
{
  await p.evaluate(() => window.__life.ui.closeSheet()); await p.waitForTimeout(200);
  const flag = await p.isVisible("#goalsBtn");
  await p.click("#goalsBtn"); await p.waitForTimeout(300);
  const opened = (await p.textContent("#sheetTitle")).includes("Goals");
  await p.fill("#goalForm input", "the box is in storage"); await p.press("#goalForm input", "Enter"); await p.waitForTimeout(250);
  const refused = await p.evaluate(() => window.__life.goals().open.length === 0);
  await p.fill("#goalForm input", "עד יום שבת בערב הארגז יהיה במחסן"); await p.press("#goalForm input", "Enter"); await p.waitForTimeout(300);
  await p.fill("#goalForm input", "עד מחר בבוקר יש לי שוקולד חדש במקרר"); await p.press("#goalForm input", "Enter"); await p.waitForTimeout(300);
  const cards = await p.evaluate(() => [...document.querySelectorAll(".gcard .goalart")].map((x) => x.dataset.object + "/" + x.dataset.scene));
  const stepInput = p.locator(".gstepform input[name=t]").first();
  await stepInput.fill("לקנות בסופר בדרך הביתה"); await p.locator(".gstepform input[name=at]").first().fill("18:30"); await stepInput.press("Enter"); await p.waitForTimeout(300);
  const stepShown = await p.evaluate(() => [...document.querySelectorAll(".gcard .gmain span")].some((x) => x.textContent.includes("לקנות בסופר")));
  await p.locator("[data-act=gstart]").first().click(); await p.waitForTimeout(250);
  const started = await p.isVisible(".gstarted");
  await p.screenshot({ path: `${out}/v-goals.png` });
  await p.locator("[data-act=gdone]").first().click(); await p.waitForTimeout(600);
  const B = await p.evaluate(() => { const b = window.__life.goals(); return { open: b.open.length, done: b.done.length }; });
  const strip = await p.isVisible(".gwon .gth");
  await p.screenshot({ path: `${out}/v-goals-done.png` });
  check(flag && opened && refused && cards.includes("box/storage") && cards.includes("chocolate/fridge") && stepShown && started && B.open === 1 && B.done === 1 && strip,
    `R43 Goals Board: flag opens it, sentences become drawn cards, first step, Started and Done (${cards.join(", ")}; open ${B.open}, done ${B.done})`);
  await p.evaluate(() => window.__life.ui.closeSheet());
}
// R44 · plan backward on a goal; R45 · the stuck questions; dark high-contrast colours by default, "faded" in the menu.
{
  const theme0 = await p.evaluate(() => window.__life.theme());
  const id = await p.evaluate(() => { const s = window.__life.store; const r = s.addGoal("by Tuesday evening the box is in storage"); s.setGoalStep(r.id, "Tape the box", "00:01"); return r.id; });
  await p.click("#goalsBtn"); await p.waitForTimeout(300);
  const banner = await p.isVisible(`.gcard[data-goal="${id}"] .gstuck`);
  await p.click(`[data-act=gopen][data-id="${id}"]`); await p.waitForTimeout(300);
  for (const v of ["The box is in the car", "The key is in my bag"]) { await p.fill("#gPlanForm input[name=v]", v); await p.click("#gPlanForm button[name=add]"); await p.waitForTimeout(250); }
  const stations = await p.evaluate(() => [...document.querySelectorAll(".gpath .gst:not(.goal):not(.now) b")].map((x) => x.textContent));
  await p.locator("[data-act=gst]").last().click(); await p.waitForTimeout(400);
  await p.fill("#gObstForm input[name=a]", "I'm tired on Saturday"); await p.fill("#gObstForm input[name=b]", "I only load the car"); await p.click("#gObstForm .chip"); await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/v-goal-path.png` });
  await p.click("[data-act=gstuck]"); await p.waitForTimeout(250);
  await p.click("[data-act=gans][data-a=missing]"); await p.waitForTimeout(250);
  await p.fill("#gansForm input", "Buy tape"); await p.press("#gansForm input", "Enter"); await p.waitForTimeout(300);
  const g = await p.evaluate((id) => window.__life.store.get(id).goal, id);
  await p.click("[data-act=gstuck]"); await p.waitForTimeout(250);
  await p.click("[data-act=gstake][data-k=hard]"); await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/v-goal-stuck.png` });
  const stakes = await p.evaluate((id) => window.__life.store.get(id).goal.stakes, id);
  check(banner && stations.join("|") === "The box is in the car|The key is in my bag" && g.path.length === 3 && g.path[0].title === "Tape the box" && g.step.title === "Buy tape" && g.obstacle?.then === "I only load the car" && g.path.some((x) => x.done) && stakes === "hard",
    `R44/R45 plan backward, tick a station, if–then plan, stuck answer adds a step before, stakes (${stations.join(" → ")}; step "${g.step.title}")`);
  await p.evaluate(() => window.__life.ui.closeSheet());
  await p.click("#menuBtn"); await p.click('#menu [data-act="theme"]'); await p.waitForTimeout(200);
  const theme1 = await p.evaluate(() => [window.__life.theme(), localStorage.getItem("life-theme"), getComputedStyle(document.documentElement).getPropertyValue("--ink").trim()]);
  await p.click("#menuBtn"); await p.click('#menu [data-act="theme"]'); await p.waitForTimeout(200);
  const theme2 = await p.evaluate(() => window.__life.theme()); await p.keyboard.press("Escape");
  check(theme0 === "contrast" && theme1[0] === "faded" && theme1[1] === "faded" && theme1[2] === "#fff7ec" && theme2 === "contrast", `colours: dark high contrast by default, "faded" from the menu and back (${theme0} → ${theme1[0]} → ${theme2})`);
}
// R51 · the activity log and raw inputs; R52 · my week & memory, from the menu.
{
  await p.evaluate(() => window.__life.ui.closeSheet());
  await p.fill("#capInput", "לשלם ארנונה עד יום ראשון"); await p.press("#capInput", "Enter"); await p.waitForTimeout(250);
  await p.click("#menuBtn"); await p.click('#menu [data-act="profile"]'); await p.waitForTimeout(300);
  const f = p.locator('.pfadd[data-k="focusTimes"]');
  for (const d of ["0", "1", "2"]) await f.locator(`[data-d="${d}"]`).click();
  await f.locator("input[name=from]").fill("07:00"); await f.locator("input[name=to]").fill("10:00"); await f.locator("button.chip:not([data-act])").click(); await p.waitForTimeout(300);
  await p.locator("#pfWork input[name=from]").fill("08:30"); await p.locator("#pfWork button.chip:not([data-act])").click(); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/v-profile.png` });
  const prof = await p.evaluate(() => window.__life.store.profile());
  await p.evaluate(() => window.__life.ui.closeSheet()); await p.click("#menuBtn"); await p.click('#menu [data-act="journal"]'); await p.waitForTimeout(300);
  const rows = await p.evaluate(() => document.querySelectorAll(".jrow").length);
  await p.click('[data-jtab="inputs"]'); await p.waitForTimeout(250);
  const inputs = await p.evaluate(() => [...document.querySelectorAll(".jrow .jt")].map((x) => x.textContent));
  await p.screenshot({ path: `${out}/v-journal.png` });
  const J = await p.evaluate(() => { const j = window.__life.store.journal(); return { n: j.length, prof: j.filter((e) => e.op === "profile").length, dev: window.__life.store.device(), allTagged: j.every((e) => e.at && e.device && e.by) }; });
  const saved = await p.evaluate(async () => { await window.__life.flush(); return true; });
  check(prof.focusTimes[0]?.from === "07:00" && prof.workWeek.from === "08:30" && rows > 5 && inputs.includes("לשלם ארנונה עד יום ראשון") && J.prof >= 2 && J.allTagged && /^(web|phone)-/.test(J.dev) && saved,
    `R51/R52 my week saves, every action is time-tagged with device and who, raw inputs kept (${J.n} actions, device ${J.dev})`);
  await p.evaluate(() => window.__life.ui.closeSheet());
}
// R19 · the data lives in IndexedDB and survives a reload.
{
  const before = await p.evaluate(async () => { await window.__life.flush(); return { st: window.__life.storage(), n: window.__life.store.all().length, xp: window.__life.store.xp(), j: window.__life.store.journal().length }; });
  await p.reload(); await p.waitForFunction(() => window.__life?.ready, null, { timeout: 120000 });
  const afterR = await p.evaluate(() => ({ n: window.__life.store.all().length, xp: window.__life.store.xp(), j: window.__life.store.journal().length }));
  check(before.st.kind === "indexeddb" && afterR.n === before.n && afterR.xp === before.xp && afterR.j === before.j, `R19 data is in IndexedDB and survives a reload (${before.st.kind}, ${before.n} → ${afterR.n} items, log ${before.j} → ${afterR.j}, XP ${before.xp} → ${afterR.xp})`);
}
// R39 · a computer opens with enhanced graphics (not blank, state signs still work); a phone stays light.
{
  const phoneQ = await p.evaluate(() => window.__life.quality());
  const dctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const d = await dctx.newPage();
  d.on("pageerror", (e) => errs.push("desktop: " + e.message));
  await d.goto(base); await d.waitForFunction(() => window.__life?.ready, null, { timeout: 180000 }); await d.waitForTimeout(800);
  const dq = await d.evaluate(() => window.__life.quality());
  const lid = await d.evaluate(() => window.__life.store.add({ type: "task", title: "Late form", parent: "paperwork", due: "2020-01-01" })); await d.waitForTimeout(500);
  const signs = await d.evaluate(() => window.__life.moods().paperwork.signs);
  await d.screenshot({ path: `${out}/v-desktop.png` });
  const many = await colours(d);
  const menuItem = await d.evaluate(() => !document.querySelector('#menu [data-act="quality"]').hidden);
  check(phoneQ === "light" && dq === "enhanced" && signs === "overdue" && many > 40 && menuItem, `R39 a computer gets enhanced graphics with a switch, a phone stays light (phone ${phoneQ}, desktop ${dq}, signs ${signs}, ${many} colours)`);
  await dctx.close();
}
check(errs.length === 0, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
await b.close(); server.close();
process.exit(failures.length ? 1 : 0);
