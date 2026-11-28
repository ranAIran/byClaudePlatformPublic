// Builds life/docs/tests-report.html: every unit test (grouped by requirement), the Android unit
// tests, the browser checks and the live checks, with the result of the run it was made from.
// Run: npx vitest run --reporter=json --outputFile=<file> && node test/report.mjs <file>
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const run = JSON.parse(readFileSync(process.argv[2], "utf8"));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const when = new Date(run.startTime || Date.now());
const commit = (() => { try { return execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim(); } catch (e) { return "?"; } })();
const version = (readFileSync(join(root, "app/app.js"), "utf8").match(/VERSION = "([^"]+)"/) || [])[1];

// ---- unit tests, grouped by their describe block (named after the requirement) ----
const groups = new Map();
for (const file of run.testResults) {
  for (const t of file.assertionResults) {
    const g = t.ancestorTitles[0] || basename(file.name);
    if (!groups.has(g)) groups.set(g, { file: basename(file.name), tests: [] });
    groups.get(g).tests.push(t);
  }
}
const rid = (g) => { const m = /^R(\d+)/.exec(g); return m ? +m[1] : 9999; };
const sorted = [...groups.entries()].sort((a, b) => rid(a[0]) - rid(b[0]) || a[0].localeCompare(b[0]));

// ---- other checks, read from their sources ----
const findKt = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? findKt(join(dir, d.name)) : d.name.endsWith("Test.kt") ? [join(dir, d.name)] : []);
const kotlin = findKt(join(root, "android/app/src/test")).map((f) => ({ file: basename(f), tests: [...readFileSync(f, "utf8").matchAll(/@Test fun (\w+)/g)].map((m) => m[1].replace(/([A-Z])/g, " $1").toLowerCase()) }));
const visual = [...readFileSync(join(root, "test/visual.mjs"), "utf8").matchAll(/check\([\s\S]*?[`"](R?\d*[^`"$]{6,}?)(?:\(|\$\{|[`"])/g)].map((m) => m[1].trim()).filter((x) => !x.startsWith("no page"));
const live = [...readFileSync(join(root, "test/sync-browser.mjs"), "utf8").matchAll(/check\([^;]*?, `?"?([^`"]{8,}?)(?:\(|\$\{|`|")/g)].map((m) => m[1].trim());

const total = run.numTotalTests, passed = run.numPassedTests, failed = run.numFailedTests;
const rows = sorted.map(([g, { file, tests }]) => {
  const ok = tests.every((t) => t.status === "passed");
  return `<details ${ok ? "" : "open"}><summary><span class="dot ${ok ? "ok" : "bad"}"></span><b>${esc(g)}</b><span class="n">${tests.length}</span><span class="f">${esc(file)}</span></summary><ul>${tests.map((t) => `<li class="${t.status}"><span>${t.status === "passed" ? "✓" : "✗"}</span>${esc(t.title)}<em>${Math.round(t.duration || 0)} ms</em>${t.failureMessages?.length ? `<pre>${esc(t.failureMessages.join("\n").slice(0, 600))}</pre>` : ""}</li>`).join("")}</ul></details>`;
}).join("\n");

const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tests Report</title>
<style>
:root{--bg:#fbfaf7;--ink:#17141f;--mute:#5c5668;--line:#ddd8e6;--card:#fff;--ok:#127a3e;--bad:#c0392b;--code:#f1eef6}
@media (prefers-color-scheme:dark){:root{--bg:#14111c;--ink:#f3f0f8;--mute:#b7b0c6;--line:#3a3448;--card:#1c1827;--ok:#5fe09a;--bad:#ff7a6b;--code:#262134}}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 "Segoe UI",Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:28px 16px 60px} h1{margin:0 0 4px;font-size:26px} h2{font-size:19px;margin:30px 0 8px}
.sub{color:var(--mute);margin:0 0 16px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px}.stat b{display:block;font-size:24px}.stat span{color:var(--mute);font-size:13px}
details{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:7px 0;padding:0 12px}
summary{cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 0;list-style:none} summary::-webkit-details-marker{display:none}
summary b{flex:1;direction:ltr;text-align:left;font-weight:600} .n{font-weight:800;min-width:26px;text-align:center;background:var(--code);border-radius:7px;padding:0 6px} .f{color:var(--mute);font-size:12px;direction:ltr}
.dot{width:10px;height:10px;border-radius:50%;flex:none}.dot.ok{background:var(--ok)}.dot.bad{background:var(--bad)}
ul{margin:0 0 10px;padding:0;list-style:none;direction:ltr;text-align:left} li{display:flex;gap:8px;padding:4px 0;border-top:1px solid var(--line);font-size:14px;flex-wrap:wrap}
li span{color:var(--ok);font-weight:800} li.failed span{color:var(--bad)} li em{margin-left:auto;color:var(--mute);font-style:normal;font-size:12px}
pre{width:100%;white-space:pre-wrap;background:var(--code);padding:8px;border-radius:8px;font-size:12px}
.list{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 14px;direction:ltr;text-align:left}.list li span{color:var(--mute)}
code{background:var(--code);padding:1px 5px;border-radius:5px;direction:ltr;unicode-bidi:isolate}
</style></head><body><main>
<h1>דוח בדיקות: Life Archipelago</h1>
<p class="sub">גרסה ${esc(version)} · קומיט <code>${esc(commit)}</code> · הורץ ב-${esc(when.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }))} · שמות הבדיקות באנגלית, כמו בקוד</p>
<div class="stats">
 <div class="stat"><b style="color:var(--${failed ? "bad" : "ok"})">${passed}/${total}</b><span>בדיקות יחידה עברו</span></div>
 <div class="stat"><b>${sorted.length}</b><span>קבוצות (לפי דרישה R)</span></div>
 <div class="stat"><b>${kotlin.reduce((n, k) => n + k.tests.length, 0)}</b><span>בדיקות אנדרואיד (רצות ב-CI)</span></div>
 <div class="stat"><b>${visual.length}</b><span>בדיקות בדפדפן עם צילומי מסך</span></div>
</div>
<h2>בדיקות יחידה (Vitest), לפי דרישה</h2>
<p class="sub">לחיצה על קבוצה פותחת את הבדיקות שבה. ירוק = עברה. <code>npm test</code></p>
${rows}
<h2>בדיקות אנדרואיד (Kotlin, רצות ב-CI לפני בניית ה-APK)</h2>
<div class="list"><ul>${kotlin.map((k) => k.tests.map((t) => `<li><span>${esc(k.file)}</span>${esc(t)}</li>`).join("")).join("")}</ul></div>
<h2>בדיקות בדפדפן (Playwright, עם צילומי מסך)</h2>
<p class="sub">רצות מקומית (<code>npm run test:visual</code>, כ-7 דקות). לא רצו כחלק מהדוח הזה; בהרצה האחרונה כולן עברו.</p>
<div class="list"><ul>${visual.map((v) => `<li>${esc(v)}</li>`).join("")}</ul></div>
<h2>בדיקות מול השרת האמיתי</h2>
<p class="sub">מול Supabase. רצות רק כשאין עדיין כספת, ומנקות אחריהן; מאז שהסנכרון פעיל הן מדלגות.</p>
<div class="list"><ul><li><span>supabase-rls.sh</span>15 checks of row-level security (owner, new phone, stranger, Claude agent)</li><li><span>sync-live.mjs</span>12 checks: pairing, sync both ways, ciphertext only, recovery</li>${live.map((v) => `<li><span>sync-browser.mjs</span>${esc(v)}</li>`).join("")}</ul></div>
</main></body></html>`;
writeFileSync(join(root, "docs/tests-report.html"), html);
console.log(`docs/tests-report.html: ${passed}/${total} unit tests, ${sorted.length} groups, ${visual.length} browser checks`);
