// How a district is doing, read from its tasks. The city shows it: tidy and festive when everything
// is done, scaffolding and a flickering lamp when something is overdue (R27).
import { isoDate } from "./capture.js";

export function districtMood(store, id, now = new Date()) {
  const today = isoDate(now), soonBy = isoDate(new Date(now.getTime() + 7 * 864e5));
  const tasks = store.openTasks(id);
  const overdue = tasks.filter((t) => t.due && t.due < today).length;
  const soon = tasks.filter((t) => t.due && t.due >= today && t.due <= soonBy).length;
  return { state: overdue ? "overdue" : tasks.length ? "open" : "clear", open: tasks.length, overdue, soon };
}
