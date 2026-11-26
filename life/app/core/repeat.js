// Repeating tasks (R35): how often, the next date, and reading "every 6 months" / "כל חצי שנה" from text.
import { isoDate } from "./capture.js";

const UNITS = ["day", "week", "month", "year"];
export const validRepeat = (r) => (r && UNITS.includes(r.unit) && Number.isInteger(+r.every) && +r.every >= 1 && +r.every <= 99 ? { every: +r.every, unit: r.unit } : null);
const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return { y, m: m - 1, d }; };
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

// The k-th date after `start`, counted from start (so a 31st stays the 31st where the month has one).
function step(start, { every, unit }, k) {
  const { y, m, d } = parse(start);
  if (unit === "day" || unit === "week") { const dt = new Date(y, m, d + k * every * (unit === "week" ? 7 : 1)); return isoDate(dt); }
  const months = unit === "month" ? k * every : k * every * 12, ny = y + Math.floor((m + months) / 12), nm = (m + months) % 12;
  return isoDate(new Date(ny, nm, Math.min(d, daysIn(ny, nm))));
}
// The next due date after finishing: one period on from `due`, or the first date on the same rhythm after today.
export function nextDue(due, repeat, today) {
  const r = validRepeat(repeat); if (!r || !due) return due;
  let k = 1, next = step(due, r, k);
  while (next <= today && k < 5000) next = step(due, r, ++k);
  return next;
}
export function describeRepeat(r) {
  r = validRepeat(r); if (!r) return "";
  return r.every === 1 ? `every ${r.unit}` : `every ${r.every} ${r.unit}s`;
}

// ----- reading a repeat from captured text -----
const N_HE = { "שני": 2, "שלושה": 3, "שלוש": 3, "ארבעה": 4, "ארבע": 4, "חמישה": 5, "חמש": 5, "שישה": 6, "שש": 6 };
const RULES = [
  [/\b(?:every\s+day|daily)\b/i, () => ({ every: 1, unit: "day" })],
  [/\b(?:every\s+other\s+week|biweekly)\b/i, () => ({ every: 2, unit: "week" })],
  [/\b(?:every\s+week|weekly)\b/i, () => ({ every: 1, unit: "week" })],
  [/\b(?:every\s+month|monthly)\b/i, () => ({ every: 1, unit: "month" })],
  [/\b(?:every\s+year|yearly|annually)\b/i, () => ({ every: 1, unit: "year" })],
  [/\bevery\s+(\d{1,2})\s+(day|week|month|year)s?\b/i, (m) => ({ every: +m[1], unit: m[2].toLowerCase() })],
  [/(?:^|\s)כל\s+חצי\s+שנה(?=$|[\s.,!?])/, () => ({ every: 6, unit: "month" })],
  [/(?:^|\s)כל\s+יום(?=$|[\s.,!?])/, () => ({ every: 1, unit: "day" })],
  [/(?:^|\s)כל\s+יומיים(?=$|[\s.,!?])/, () => ({ every: 2, unit: "day" })],
  [/(?:^|\s)כל\s+שבועיים(?=$|[\s.,!?])/, () => ({ every: 2, unit: "week" })],
  [/(?:^|\s)כל\s+שבוע(?=$|[\s.,!?])/, () => ({ every: 1, unit: "week" })],
  [/(?:^|\s)כל\s+חודשיים(?=$|[\s.,!?])/, () => ({ every: 2, unit: "month" })],
  [/(?:^|\s)כל\s+חודש(?=$|[\s.,!?])/, () => ({ every: 1, unit: "month" })],
  [/(?:^|\s)כל\s+שנתיים(?=$|[\s.,!?])/, () => ({ every: 2, unit: "year" })],
  [/(?:^|\s)כל\s+שנה(?=$|[\s.,!?])/, () => ({ every: 1, unit: "year" })],
  [/(?:^|\s)כל\s+(\d{1,2}|שני|שלושה|שלוש|ארבעה|ארבע|חמישה|חמש|שישה|שש)\s+(ימים|שבועות|חודשים|שנים)(?=$|[\s.,!?])/, (m) => ({ every: +m[1] || N_HE[m[1]], unit: { "ימים": "day", "שבועות": "week", "חודשים": "month", "שנים": "year" }[m[2]] })],
];
export function parseRepeat(text) {
  const t = String(text || "");
  for (const [re, make] of RULES) { const m = re.exec(t); if (m) return { repeat: validRepeat(make(m)), text: (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length)).replace(/\s{2,}/g, " ").trim() }; }
  return { repeat: null, text: t };
}
