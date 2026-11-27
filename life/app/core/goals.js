// Goals Board (R43, R49): "what will be true, and by when" instead of "what to do".
// A done-state sentence ("עד יום שבת בערב הארגז יהיה במחסן") becomes a goal with a deadline,
// a time of day, and an object + scene for its drawing. Pure functions, no DOM.
import { parseCapture } from "./capture.js";

// Times of day become clock times; the reminder uses them (manual §3).
const TIMES = { morning: "08:00", noon: "12:00", afternoon: "15:00", evening: "18:00", night: "21:00" };
const TIME_EN = [[/\btonight\b/, "night", true], [/\b(?:in the |this )?(morning|noon|afternoon|evening|night)\b/, null, false]];
const TIME_HE = [["אחר הצהריים", "afternoon"], ['אחה"צ', "afternoon"], ["בבוקר", "morning"], ["בצהריים", "noon"], ["בצהרים", "noon"], ["בערב", "evening"], ["בלילה", "night"]];
const CLOCK = /(?:^|\s)(?:at\s+|בשעה\s+|ב-?)?(\d{1,2}):(\d{2})(?=$|[\s.,!?])/i;
const pad = (n) => String(n).padStart(2, "0");

// Drawings are an object placed in a scene (manual §2). Unknown words get a star in a room.
const OBJECTS = {
  box: { en: ["box", "carton", "package", "parcel"], he: ["ארגז", "קרטון", "קופסה", "חבילה"] },
  chocolate: { en: ["chocolate", "cake", "snack", "cookies"], he: ["שוקולד", "עוגה", "חטיף", "עוגיות"] },
  key: { en: ["key", "keys"], he: ["מפתח", "מפתחות"] },
  doc: { en: ["form", "bill", "document", "passport", "letter", "invoice", "tax", "taxes"], he: ["טופס", "חשבון", "מסמך", "דרכון", "מכתב", "חשבונית", "מס"] },
  plant: { en: ["plant", "plants", "flowers", "terrarium"], he: ["עציץ", "צמח", "צמחים", "פרחים", "טרריום"] },
  gift: { en: ["gift", "present"], he: ["מתנה"] },
};
const SCENES = {
  storage: { en: ["storage", "storeroom", "shed"], he: ["מחסן"] },
  fridge: { en: ["fridge", "refrigerator"], he: ["מקרר"] },
  car: { en: ["car", "trunk"], he: ["רכב", "אוטו", "מכונית"] },
  desk: { en: ["desk", "computer", "office"], he: ["שולחן", "מחשב"] },
  shop: { en: ["shop", "store", "supermarket"], he: ["סופר", "חנות"] },
};
const PREFIX = "ובלמהשכ";
const words = (t) => String(t || "").toLowerCase().split(/[\s.,!?;:()"'״׳-]+/).filter(Boolean);
const heHit = (ws, w) => ws.some((x) => x === w || (x.length === w.length + 1 && PREFIX.includes(x[0]) && x.slice(1) === w) || (x.length === w.length + 2 && PREFIX.includes(x[0]) && PREFIX.includes(x[1]) && x.slice(2) === w));
const enHit = (ws, w) => ws.includes(w) || ws.includes(w + "s");
function pick(table, text, fallback) {
  const ws = words(text);
  for (const [id, { en, he }] of Object.entries(table)) if (en.some((w) => enHit(ws, w)) || he.some((w) => heHit(ws, w))) return id;
  return fallback;
}
export const artFor = (text) => ({ object: pick(OBJECTS, text, "star"), scene: pick(SCENES, text, "room") });

const FILLER = /^(?:by|until|till|before|עד|לפני)$/i;
export function parseGoal(raw, now = new Date()) {
  let text = String(raw || "").trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, error: "what" };
  let time = null, tonight = false;
  const clock = CLOCK.exec(text);
  if (clock && +clock[1] < 24 && +clock[2] < 60) { time = `${pad(+clock[1])}:${clock[2]}`; text = (text.slice(0, clock.index) + " " + text.slice(clock.index + clock[0].length)).trim(); }
  if (!time) {
    for (const [re, fixed, today] of TIME_EN) {
      const m = re.exec(text.toLowerCase());
      if (m) { time = TIMES[fixed || m[1]]; tonight = today; text = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).trim(); break; }
    }
  }
  if (!time) {
    for (const [w, k] of TIME_HE) {
      const m = new RegExp(`(?:^|\\s)${w.replace(/"/g, '\\"')}(?=$|[\\s.,!?])`).exec(text);
      if (m) { time = TIMES[k]; text = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).trim(); break; }
    }
  }
  const c = parseCapture(text, now);
  let due = c.due;
  let title = due && c.title === text ? "" : c.title; // parseCapture falls back to the whole text when nothing is left
  title = title.split(" ").filter((w, i, a) => !(FILLER.test(w) && (i === 0 || i === a.length - 1))).join(" ");
  title = title.replace(/(^|\s)(?:יהיה|יהיו|תהיה|תהיינה)(?=\s|$)/g, "$1").replace(/\bwill be\b/gi, "is").replace(/\s{2,}/g, " ").trim();
  if (/^[a-z]/.test(title)) title = title[0].toUpperCase() + title.slice(1);
  if (!due && (time || tonight)) due = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (!title) return { ok: false, error: "what" };
  if (!due) return { ok: false, error: "when" };
  return { ok: true, title, due, time, ...artFor(raw) };
}

// The moment a goal is due, in local time. A day without a time ends at 23:59.
export function goalDeadline(g) {
  const [y, m, d] = g.due.split("-").map(Number), [hh, mm] = (g.goal?.time || "23:59").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}
export function timeLeft(g, now = new Date()) {
  const ms = goalDeadline(g) - now, a = Math.abs(ms);
  return { late: ms < 0, ms, days: Math.floor(a / 864e5), hours: Math.floor((a % 864e5) / 36e5), minutes: Math.floor((a % 36e5) / 6e4) };
}

// The board: open goals by deadline; what came true in the last 7 days. About 3 open goals is a
// suggestion while learning the board, not a lock (R49: nothing is locked).
export const SUGGESTED_OPEN = 3;
export function goalBoard(store, now = new Date()) {
  const all = store.all().filter((n) => n.type === "goal");
  const open = all.filter((n) => !n.done).sort((a, b) => goalDeadline(a) - goalDeadline(b));
  const since = now.getTime() - 7 * 864e5;
  const done = all.filter((n) => n.done && Date.parse(n.updated) > since).sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));
  return { open, done, suggestMore: open.length < SUGGESTED_OPEN };
}
