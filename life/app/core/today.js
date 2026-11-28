// Today (R34): the one list that answers "what now". Open tasks, by when they are due.
import { isoDate } from "./capture.js";
import { goalsOfTask } from "./goals.js";

export function todayList(store, now = new Date()) {
  const today = isoDate(now), weekEnd = isoDate(new Date(now.getTime() + 7 * 864e5));
  const where = (n) => store.path(n.id).map((id) => store.get(id)?.title || id).join(" › ");
  const open = store.all().filter((n) => n.type === "task" && !n.done && n.due && n.parent !== "bag");
  const pick = (f) => open.filter(f).sort((a, b) => a.due.localeCompare(b.due) || (b.effort || 1) - (a.effort || 1) || a.title.localeCompare(b.title))
    .map((n) => ({ id: n.id, title: n.title, due: n.due, effort: n.effort || 1, where: where(n), path: store.path(n.id), steps: n.steps,
      goals: goalsOfTask(store, n.id).map((g) => ({ id: g.id, title: g.title, stakes: g.goal.stakes, due: g.due, time: g.goal.time })) })); // R60
  const overdue = pick((n) => n.due < today), todays = pick((n) => n.due === today), week = pick((n) => n.due > today && n.due <= weekEnd);
  const bagDays = store.unplaced().reduce((m, n) => Math.max(m, Math.floor((now - Date.parse(n.created)) / 864e5)), 0);
  return { overdue, today: todays, week, bag: store.unplaced().length, bagDays, empty: !overdue.length && !todays.length && !week.length };
}
