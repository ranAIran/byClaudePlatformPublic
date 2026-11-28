// R53/R54 end to end in two browsers against the real Supabase project: the phone turns sync on and
// gets its recovery code, the computer asks to join, the phone approves the matching code, and the
// computer receives the phone's data. Runs only on an empty project; removes everything it made.
// Run: node test/sync-browser.mjs <screenshot dir>   (serves the repo itself; needs the Supabase token for cleanup)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const root = normalize(join(fileURLToPath(import.meta.url), "../../.."));
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => { try { const p = normalize(join(root, decodeURIComponent(req.url.split("?")[0]))); const f = p.endsWith("/") ? join(p, "index.html") : p; res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream" }); res.end(await readFile(f)); } catch (e) { res.writeHead(404); res.end(); } }).listen(0);
const base = `http://localhost:${server.address().port}/life/app/?notoday`, out = process.argv[2] || ".";
const REF = "uuamddvxaownewcfpczt";
const sql = async (query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: "Bearer proxy-injected", "Content-Type": "application/json" }, body: JSON.stringify({ query }) }); if (!r.ok) throw new Error(await r.text()); return r.json(); };
const fails = []; const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) fails.push(msg); };

const [{ n }] = await sql("select count(*)::int as n from public.vaults;");
if (n > 0) { console.log("SKIP sync is already on in this project; this check needs an empty one"); server.close(); process.exit(0); }
const started = new Date().toISOString();
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
const b = await chromium.launch({ proxy, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errs = [];
const open = async (opts) => { const ctx = await b.newContext({ ...opts, ignoreHTTPSErrors: true, timezoneId: "Asia/Jerusalem" }); const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); await p.goto(base); await p.waitForFunction(() => window.__life?.ready, null, { timeout: 120000 }); return p; };
const menu = async (p, act) => { await p.evaluate(() => window.__life.ui.closeSheet()); await p.click("#menuBtn"); await p.click(`#menu [data-act="${act}"]`); };
try {
  const phone = await open({ ...devices["Pixel 7"], deviceScaleFactor: 1 });
  const pc = await open({ viewport: { width: 1100, height: 760 } });
  await phone.fill("#capInput", "לשלם ארנונה עד יום ראשון"); await phone.press("#capInput", "Enter"); await phone.waitForTimeout(300);
  await menu(phone, "devices"); await phone.waitForSelector('[data-act="dvon"]');
  await phone.screenshot({ path: `${out}/s-off.png` });
  await phone.click('[data-act="dvon"]'); await phone.waitForSelector(".dvcode", { timeout: 60000 });
  const code = (await phone.textContent(".dvcode")).trim();
  await phone.screenshot({ path: `${out}/s-recovery.png` });
  check(/^([A-Z2-9]{4}-){6}[A-Z2-9]{2}$/.test(code), "the phone turns sync on and shows a recovery code once");
  await phone.click('[data-act="dvwrote"]'); await phone.waitForSelector('[data-act="dvsync"]', { timeout: 60000 });

  await menu(pc, "devices"); await pc.click('[data-act="dvon"]'); await pc.waitForSelector('[data-act="dvjoin"]', { timeout: 60000 });
  await pc.click('[data-act="dvjoin"]'); await pc.waitForSelector(".dvcode", { timeout: 60000 });
  const pcCode = (await pc.textContent(".dvcode")).trim();
  await pc.screenshot({ path: `${out}/s-join.png` });
  check(/^\d{3} \d{3}$/.test(pcCode), `the computer asks to join and shows its code (${pcCode})`);

  await menu(phone, "devices"); await phone.waitForSelector('[data-act="dvok"]', { timeout: 60000 });
  const seen = (await phone.textContent(".dvcode.small")).trim();
  await phone.screenshot({ path: `${out}/s-approve.png` });
  check(seen === pcCode, "the phone shows the same code next to the request");
  await phone.click('[data-act="dvok"]'); await phone.waitForTimeout(1500);

  await menu(pc, "devices"); await pc.waitForSelector('[data-act="dvsync"]', { timeout: 60000 });
  await pc.evaluate(() => window.__life.doSync()); await pc.waitForTimeout(500);
  const got = await pc.evaluate(() => window.__life.store.inputs().some((x) => x.text === "לשלם ארנונה עד יום ראשון") && window.__life.store.all().some((x) => /ארנונה/.test(x.title)));
  await menu(pc, "devices"); await pc.waitForSelector(".dvdev", { timeout: 60000 }); await pc.waitForTimeout(400);
  await pc.screenshot({ path: `${out}/s-devices.png` });
  check(got, "after approval the computer has the phone's item and raw input");
  const ex = await Promise.all([phone, pc].map((p) => p.evaluate(() => window.__life.store.all().filter((x) => x.tags.includes("example")).length)));
  check(ex[0] > 0 && ex[0] === ex[1], `examples are not doubled when a device joins (phone ${ex[0]}, computer ${ex[1]})`);
  await pc.evaluate(() => window.__life.store.capture("Computer note for the phone")); await pc.evaluate(() => window.__life.doSync());
  await phone.evaluate(() => window.__life.doSync());
  check(await phone.evaluate(() => window.__life.store.all().some((x) => x.title === "Computer note for the phone")), "a note added on the computer reaches the phone");
  const [{ c }] = await sql("select coalesce(string_agg(ciphertext, ''), '') as c from public.records;");
  check(c.length > 100 && !/ארנונה|Computer note/.test(c), "the server holds only ciphertext");
} catch (e) { check(false, "error: " + e.message); }
finally {
  await b.close(); server.close();
  await sql("delete from public.vaults; delete from public.pairing_requests;");
  await sql(`delete from auth.users where is_anonymous and created_at >= '${started}';`);
  const [{ v, u }] = await sql("select (select count(*) from public.vaults)::int as v, (select count(*) from auth.users)::int as u;");
  check(v === 0 && u === 0, `cleaned up (vaults ${v}, users ${u})`);
}
check(errs.length === 0, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
process.exit(fails.length ? 1 : 0);
