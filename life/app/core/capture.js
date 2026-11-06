// Turns a quick capture ("renew passport before March", "להתקשר לסבתא מחר") into a task or note.
// Pure functions, no DOM: shared by the web app, the Android app and the tests.

const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };

const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const DAYS_EN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const VERBS_EN = ["call", "pay", "renew", "buy", "fix", "book", "send", "email", "clean", "check", "schedule", "cancel", "return", "order", "submit", "sign", "change", "replace", "water", "take", "pick", "visit", "finish", "prepare", "write", "read", "go", "meet", "remind"];
const VERBS_HE = ["להתקשר", "לשלם", "לחדש", "לקנות", "לתקן", "לקבוע", "לשלוח", "לנקות", "לבדוק", "לבטל", "להחזיר", "להזמין", "להגיש", "לחתום", "להחליף", "להשקות", "לאסוף", "לסיים", "להכין", "לכתוב", "ללכת", "לפגוש", "להזכיר"];

// Hebrew has no \b in JS regexes, so word edges are spelled out.
const HE_START = "(?:^|\\s)", END = "(?=$|[\\s.,!?;:)])";
const HE_PREFIX = "[ובלמהשכ]?";

function nextYearIfPast(y, m, d, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let dt = new Date(y, m, d);
  if (dt < today) dt = new Date(y + 1, m, d);
  return dt;
}

// Returns { due: Date|null, spans: [[start, end], ...] } — spans are the date words to strip from the title.
function findDue(text, now) {
  const t = text.toLowerCase();
  const hits = [];
  const take = (re, fn) => { const m = re.exec(t); if (m) { const d = fn(m); if (d) hits.push({ d, s: m.index, e: m.index + m[0].length }); } };
  // Relative words.
  take(/\b(?:by |on |until )?tomorrow\b/, () => addDays(now, 1));
  take(new RegExp(`${HE_START}(?:עד |ב)?מחר${END}`), () => addDays(now, 1));
  take(/\b(?:by |until )?today\b/, () => addDays(now, 0));
  take(new RegExp(`${HE_START}(?:עד )?היום${END}`), () => addDays(now, 0));
  take(/\bnext week\b/, () => addDays(now, 7));
  take(new RegExp(`${HE_START}(?:ב)?שבוע הבא${END}`), () => addDays(now, 7));
  // Weekdays.
  take(new RegExp(`\\b(?:on |by |next )?(${DAYS_EN.join("|")})\\b`), (m) => {
    const wd = DAYS_EN.indexOf(m[1]); let diff = (wd - now.getDay() + 7) % 7; if (diff === 0) diff = 7; return addDays(now, diff);
  });
  take(new RegExp(`${HE_START}(?:עד )?(?:ב?יום )(${DAYS_HE.join("|")})${END}`), (m) => {
    const wd = DAYS_HE.indexOf(m[1]); let diff = (wd - now.getDay() + 7) % 7; if (diff === 0) diff = 7; return addDays(now, diff);
  });
  // Numeric day/month(/year), Israeli order: 20/11, 20.11.2026
  take(/\b(?:by |on |until |due )?(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/, (m) => {
    const d = +m[1], mo = +m[2] - 1; if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    if (m[3]) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return new Date(y, mo, d); }
    return nextYearIfPast(now.getFullYear(), mo, d, now);
  });
  // English month with an optional day: "Nov 25", "25 November", "before March".
  const mon = `(${MONTHS_EN.join("|")})[a-z]*\\.?`;
  take(new RegExp(`\\b(?:by |on |until |due )?${mon} (\\d{1,2})\\b`), (m) => nextYearIfPast(now.getFullYear(), MONTHS_EN.indexOf(m[1]), +m[2], now));
  take(new RegExp(`\\b(?:by |on |until |due )?(\\d{1,2}) ${mon}`), (m) => nextYearIfPast(now.getFullYear(), MONTHS_EN.indexOf(m[2]), +m[1], now));
  take(new RegExp(`\\b(?:before|by|in|until|till)\\s+${mon}(?!\\s*\\d)`), (m) => {
    const mo = MONTHS_EN.indexOf(m[1]); let y = now.getFullYear(); if (mo <= now.getMonth()) y += 1; return new Date(y, mo, 1);
  });
  // Hebrew month: "25 בנובמבר", "עד מרץ", "במרץ".
  const hm = `(${MONTHS_HE.join("|")})`;
  take(new RegExp(`${HE_START}(\\d{1,2}) ב?${hm}${END}`), (m) => nextYearIfPast(now.getFullYear(), MONTHS_HE.indexOf(m[2]), +m[1], now));
  take(new RegExp(`${HE_START}(?:עד |לפני |ב|עד ה|ב-)?${hm}${END}`), (m) => {
    const mo = MONTHS_HE.indexOf(m[1]); let y = now.getFullYear(); if (mo <= now.getMonth()) y += 1; return new Date(y, mo, 1);
  });
  if (!hits.length) return { due: null, spans: [] };
  hits.sort((a, b) => (b.e - b.s) - (a.e - a.s));
  return { due: hits[0].d, spans: [[hits[0].s, hits[0].e]] };
}

function startsWithVerb(t) {
  const w = t.trim().toLowerCase().split(/\s+/)[0] || "";
  return VERBS_EN.includes(w) || VERBS_HE.some((v) => w === v || w === "ו" + v);
}

export function parseCapture(raw, now = new Date()) {
  const text = String(raw || "").trim();
  const tags = [...text.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1]);
  const { due, spans } = findDue(text, now);
  let title = text;
  for (const [s, e] of spans) title = title.slice(0, s) + " " + title.slice(e);
  title = title.replace(/#[\p{L}\p{N}_-]+/gu, "").replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim().replace(/[\s,;:-]+$/, "");
  if (/^[a-z]/.test(title)) title = title[0].toUpperCase() + title.slice(1);
  const isNote = /^(idea|note|thought|רעיון|הערה)\s*[:\-]/i.test(text);
  const type = !isNote && (due || startsWithVerb(text)) ? "task" : "note";
  return { title: title || text, type, due: due ? isoDate(due) : null, tags };
}
