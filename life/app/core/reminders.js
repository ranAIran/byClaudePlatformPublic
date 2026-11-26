// Reminders (R11): the list the phone schedules notifications for. Open tasks with a date from today on.
import { isoDate } from "./capture.js";
export const MAX_REMINDERS = 64;
export function reminderList(store, now = new Date(), horizonDays = 120) {
  const today = isoDate(now), last = isoDate(new Date(now.getTime() + horizonDays * 864e5));
  return store.all().filter((n) => n.type === "task" && !n.done && n.due && n.due >= today && n.due <= last && n.parent !== "bag")
    .sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title)).slice(0, MAX_REMINDERS)
    .map((n) => ({ id: n.id, title: n.title, due: n.due }));
}
