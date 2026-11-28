// Reminders (R11, R59): what the phone schedules. Open tasks with a date (at their own time, or 09:00),
// goals at their deadline, and a goal's first step at its chosen time. Each has a kind: a notification
// with sound, or an alarm that rings until it is stopped. Moments that already passed are left out.
import { isoDate } from "./capture.js";
import { goalDeadline } from "./goals.js";
export const MAX_REMINDERS = 64;
const pad = (n) => String(n).padStart(2, "0");
export function reminderList(store, now = new Date(), horizonDays = 120) {
  const today = isoDate(now), last = isoDate(new Date(now.getTime() + horizonDays * 864e5)), nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const out = [];
  const keep = (r) => r.due >= today && r.due <= last && !(r.due === today && r.time <= nowHM) && r.kind !== "none";
  for (const n of store.all()) {
    if (n.done) continue;
    if (n.type === "task" && n.due && n.parent !== "bag") out.push({ id: n.id, title: n.title, due: n.due, time: n.time || "09:00", kind: n.remind });
    if (n.type === "goal" && n.due && !n.goal?.released) {
      out.push({ id: n.id, title: n.title, due: n.due, time: n.goal.time || "09:00", kind: n.remind, open: n.id });
      // R60 · each open task connected to this goal also reminds a while before the goal's deadline.
      const before = new Date(goalDeadline(n).getTime() - n.goal.lead * 60000);
      for (const tid of n.goal.links) { const t = store.get(tid); if (t && !t.done && t.type !== "goal") out.push({ id: tid + ":before", title: t.title, due: isoDate(before), time: `${pad(before.getHours())}:${pad(before.getMinutes())}`, kind: t.remind, open: tid }); }
      const st = n.goal.step;
      if (st?.at && st.day && !n.goal.started) out.push({ id: n.id + ":step", title: st.title, due: st.day, time: st.at, kind: n.remind, open: n.id });
    }
  }
  return out.filter(keep).sort((a, b) => (a.due + a.time).localeCompare(b.due + b.time) || a.title.localeCompare(b.title)).slice(0, MAX_REMINDERS)
    .map((r) => ({ open: r.id, ...r }));
}
