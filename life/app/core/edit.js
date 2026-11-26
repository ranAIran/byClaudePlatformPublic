// Editing an item (R33): turn what the edit form holds into a safe patch for the store.
// Only the fields given are changed; XP flags, id and creation time are never touched here.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (v) => ISO.test(v) && new Date(v + "T00:00:00").toISOString().slice(0, 10) === v;

// Places an item can live in: the bag, the islands and the rooms, in that order.
export function placeChoices(store) {
  const places = store.all().filter((n) => n.type === "place" && n.id !== "world");
  const rank = (n) => (n.id === "bag" ? 0 : n.kind === "island" ? 1 : 2);
  return places.sort((a, b) => rank(a) - rank(b)).map((n) => ({ id: n.id, title: n.title, kind: n.kind, parent: n.parent }));
}

export function applyEdit(store, id, form) {
  const n = store.get(id); if (!n) return { ok: false, field: "id", error: "That item no longer exists." };
  const patch = {};
  if ("title" in form) { const t = String(form.title ?? "").trim(); if (!t) return { ok: false, field: "title", error: "Give it a name." }; patch.title = t; }
  if ("due" in form) { const d = form.due || null; if (d && !realDate(d)) return { ok: false, field: "due", error: "That date doesn't exist." }; patch.due = d; }
  if ("notes" in form) patch.notes = String(form.notes ?? "");
  if ("url" in form) patch.url = String(form.url ?? "").trim() || null;
  if ("effort" in form) patch.effort = Math.min(5, Math.max(1, Math.round(+form.effort || 1)));
  if ("type" in form) patch.type = form.type;
  if ("repeat" in form) patch.repeat = form.repeat || null;
  if ("parent" in form) {
    const p = store.get(form.parent);
    if (!p || p.type !== "place" || p.id === "world" || p.id === id) return { ok: false, field: "parent", error: "Choose a place." };
    patch.parent = p.id; patch.suggest = [];
  }
  if ("steps" in form) {
    const old = n.steps || [];
    const steps = (form.steps || []).map((st) => ({ title: String(st.title || "").trim(), done: st.from != null && !!old[st.from]?.done })).filter((st) => st.title);
    patch.steps = steps.length ? steps : null;
  }
  store.update(id, patch);
  return { ok: true };
}
