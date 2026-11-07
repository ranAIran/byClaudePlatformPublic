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

const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ ...devices["Pixel 7"] });
const p = await ctx.newPage(); const errs = [];
p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
await p.goto(base); await p.waitForFunction(() => window.__life?.ready, null, { timeout: 120000 }); await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/v-map.png` });
check((await colours(p)) > 40, "R5 map frame is not blank");
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
// Complete a task for XP.
const xp0 = await p.evaluate(() => window.__life.store.xp());
const box = await p.$('#sheetBody [data-act="toggle"]'); if (box) { await box.tap(); await p.waitForTimeout(200); }
check((await p.evaluate(() => window.__life.store.xp())) > xp0, "R8 completing a task adds XP");
await p.screenshot({ path: `${out}/v-xp.png` });
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
