// Coins buy decorations for the city (R36). Gentle: nothing is ever lost, there are no streaks.
export const DISTRICTS = ["home", "family", "paperwork", "work", "health", "shopping"];
export const SLOTS = 3; // spots per district (the corners of its sidewalk)
export const CATALOG = [
  { id: "flowers", name: "Flower bed", price: 3 },
  { id: "bench", name: "Bench", price: 4 },
  { id: "tree", name: "Tree", price: 5 },
  { id: "lamp", name: "Lantern", price: 6 },
  { id: "flag", name: "Flag", price: 6 },
  { id: "fountain", name: "Fountain", price: 12 },
];
export const decorationsFor = (store, district) => store.decorations().filter((d) => d.district === district);

export function buy(store, district, itemId) {
  const item = CATALOG.find((c) => c.id === itemId);
  if (!DISTRICTS.includes(district) && !store.get(district)?.custom) return { ok: false, reason: "place" };
  if (!item) return { ok: false, reason: "item" };
  const used = new Set(decorationsFor(store, district).map((d) => d.slot));
  let slot = 0; while (used.has(slot)) slot++;
  if (slot >= SLOTS) return { ok: false, reason: "full" };
  if (!store.spendCoins(item.price, `${item.name} for ${district}`)) return { ok: false, reason: "coins" };
  store.decorate({ district, slot, item: item.id });
  return { ok: true, slot, item };
}
