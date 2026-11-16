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
const warmth = async (p) => p.evaluate(async (b64) => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = 48; c.height = 48; const x = c.getContext("2d"); x.drawImage(im, im.width * 0.3, im.height * 0.42, im.width * 0.4, im.height * 0.2, 0, 0, 48, 48); const d = x.getImageData(0, 0, 48, 48).data; let r = 0, g = 0, bl = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; } const n = d.length / 4; return { r: r / n, g: g / n, b: bl / n }; }, (await p.screenshot()).toString("base64"));

const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ ...devices["Pixel 7"] });
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
await p.tap("#sheetClose").catch(() => {}); await p.waitForTimeout(350);
const meshes = await p.evaluate(() => window.__life.meshes?.() ?? 9999);
check(meshes < 260, `R18 the city is merged into few draw calls for phones (${meshes} meshes)`);
// R28 · golden hour: the light is warm.
const warm = await warmth(p);
check(warm.r > warm.b + 20, `R28 the city centre is lit by a low warm sun (red ${warm.r.toFixed(0)}, blue ${warm.b.toFixed(0)})`);
// R27 · an overdue task shows on its district (scaffolding, cones, flickering lamp) and goes when it is done.
const mood0 = await p.evaluate(() => window.__life.moods?.().paperwork);
const lateId = await p.evaluate(() => window.__life.store.add({ type: "task", title: "Late form", parent: "paperwork", due: "2020-01-01" }));
await p.waitForTimeout(500); await p.screenshot({ path: `${out}/v-overdue.png` });
const mood1 = await p.evaluate(() => window.__life.moods?.().paperwork);
await p.evaluate((id) => window.__life.store.complete(id), lateId); await p.waitForTimeout(200);
const mood2 = await p.evaluate(() => window.__life.moods?.().paperwork);
await p.evaluate((id) => window.__life.store.remove(id), lateId); await p.waitForTimeout(300);
check(mood0?.state === "open" && !mood0.signs && mood1?.state === "overdue" && mood1.signs === "overdue" && mood2?.state === "open" && !mood2.signs, `R27 an overdue task puts repair signs on its district, and finishing it removes them (${JSON.stringify([mood0, mood1, mood2])})`);
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
await p.click(".lbl >> nth=0"); await p.waitForFunction(() => window.__lastFlyMs, null, { timeout: 5000 }); const flyMs = await p.evaluate(() => window.__lastFlyMs);
await p.waitForTimeout(900); await p.screenshot({ path: `${out}/v-home.png` });
check(flyMs < 1200, `R4 fly into Home took ${flyMs} ms`);
check((await colours(p)) > 40, "R5 home frame is not blank");
const tanks = JSON.stringify(await p.evaluate(() => window.__life.terrariums()));
check(tanks === '[[60,60,45,"lizard 22cm"],[60,45,45]]', `R17 bedroom has two terrariums 60×60×45 (with a small lizard) and 60×45×45 cm (${tanks})`);
// Complete a task for XP.
const xp0 = await p.evaluate(() => window.__life.store.xp());
const box = await p.$('#sheetBody [data-act="toggle"]'); if (box) { await box.tap(); await p.waitForTimeout(200); }
check((await p.evaluate(() => window.__life.store.xp())) > xp0, "R8 completing a task adds XP");
await p.screenshot({ path: `${out}/v-xp.png` });
// R4 · back from Home must show the islands again, not the last home frame.
const homeThumb = await thumb(p);
await p.tap("#sheetClose").catch(() => {}); await p.tap("#back"); await p.waitForFunction(() => window.__life.view() === "map"); await p.waitForTimeout(900);
await p.screenshot({ path: `${out}/v-back.png` });
const backThumb = await thumb(p), dMap = dist(backThumb, mapThumb), dHome = dist(backThumb, homeThumb);
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
check(errs.length === 0, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
await b.close(); server.close();
process.exit(failures.length ? 1 : 0);
