// Categories (R42): the islands of the life map. Every one can be renamed; new ones can be added and
// removed again (their things go back to the bag). The built-in ones and the bag always stay.
export const categories = (store) => store.all().filter((n) => n.type === "place" && n.kind === "island");
const clean = (name) => String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
const taken = (store, name, except) => store.all().some((n) => n.type === "place" && n.id !== except && (n.title.toLowerCase() === name.toLowerCase() || n.id === name.toLowerCase()));

export function renameCategory(store, id, name) {
  const n = store.get(id), t = clean(name);
  if (!n || n.type !== "place" || id === "world") return { ok: false, error: "place" };
  if (!t) return { ok: false, error: "name" };
  if (taken(store, t, id)) return { ok: false, error: "taken" };
  store.update(id, { title: t }); return { ok: true };
}
export function addCategory(store, name) {
  const t = clean(name);
  if (!t) return { ok: false, error: "name" };
  if (taken(store, t)) return { ok: false, error: "taken" };
  const id = store.add({ type: "place", kind: "island", title: t, parent: "world", custom: true });
  return { ok: true, id };
}
export function removeCategory(store, id) {
  const n = store.get(id);
  if (!n || !n.custom) return { ok: false, error: "builtin" };
  for (const c of store.children(id)) store.place(c.id, "bag");
  store.remove(id); return { ok: true };
}
