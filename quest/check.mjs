// Quest checks in a real browser. Run from the repo root: node quest/check.mjs
// Q1 every bridge connects to both islands (no walkable gap on the way).
// Q2 the player can walk from the last puzzle island to the Gate keeper and talk to her.
// Q3 tapping the version 5 times opens the admin PIN, the PIN opens the skip panel.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const root = normalize(join(fileURLToPath(import.meta.url), "../.."));
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  try { const p = normalize(join(root, decodeURIComponent(req.url.split("?")[0]))); if (!p.startsWith(root)) throw 0; const f = p.endsWith("/") ? join(p, "index.html") : p; res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream" }); res.end(await readFile(f)); }
  catch (e) { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/quest/?webgl`;
const failures = [];
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) failures.push(msg); };

const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" });
await ctx.addInitScript(() => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("latent-archipelago-v1", JSON.stringify({ solved: ["tokens", "embeddings", "attention", "training", "rag", "agents"], elapsed: 10, lang: "en" })); } });
const p = await ctx.newPage(); const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(base); await p.waitForFunction(() => window.__quest, null, { timeout: 120000 }); await p.waitForTimeout(1500);

const gaps = await p.evaluate(() => {
  const q = window.__quest, out = [];
  for (let i = 0; i < q.isl.length - 1; i++) {
    const A = q.isl[i].data.pos, B = q.isl[i + 1].data.pos, L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (let d = 0; d <= L; d += 0.01) { const x = A[0] + (B[0] - A[0]) * d / L, z = A[1] + (B[1] - A[1]) * d / L; if (!q.walkable(x, z)) { out.push(`${q.isl[i].data.id}->${q.isl[i + 1].data.id} at ${d.toFixed(2)}`); break; } }
  }
  return out;
});
check(gaps.length === 0, `Q1 every bridge connects both islands${gaps.length ? ": gap " + gaps.join(", ") : ""}`);

// Walk from the centre of the last puzzle island to the Gate keeper, with the same rule the game uses.
const walk = await p.evaluate(() => {
  const q = window.__quest, n = q.isl.length, A = q.isl[n - 2].data.pos, npc = q.isl[n - 1].npc.position;
  let x = A[0], z = A[1];
  for (let i = 0; i < 4000; i++) {
    const dx = npc.x - x, dz = npc.z - z, d = Math.hypot(dx, dz); if (d <= 1.3) return { ok: true, steps: i };
    const nx = x + dx / d * 0.05, nz = z + dz / d * 0.05;
    if (q.walkable(nx, nz)) { x = nx; z = nz; } else if (q.walkable(nx, z)) x = nx; else if (q.walkable(x, nz)) z = nz; else return { ok: false, at: [x.toFixed(2), z.toFixed(2)], left: d.toFixed(2) };
  }
  return { ok: false, timeout: true };
});
check(walk.ok, `Q2 the player reaches the Gate keeper from the last island ${JSON.stringify(walk)}`);

// Admin: 5 taps on the version under the title, then the PIN.
for (let i = 0; i < 5; i++) await p.tap("#titleVersion");
await p.waitForTimeout(300);
const pinOpen = await p.evaluate(() => !document.getElementById("modal").hidden && !!document.querySelector("#modal input"));
check(pinOpen, "Q3 five taps on the version open the admin PIN");
if (pinOpen) {
  await p.fill("#modal input", "12321"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  const txt = await p.evaluate(() => document.getElementById("modal").innerText);
  check(/Skip to the gate/.test(txt), "Q3 the right PIN opens the skip panel");
}
check(errs.length === 0, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
await b.close(); server.close();
process.exit(failures.length ? 1 : 0);
