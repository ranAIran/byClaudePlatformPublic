// Deep links (R21): lifearchipelago://add?text=…, ://open?id=…, ://open?place=…, ://today, ://scan, ://voice.
// Used by app shortcuts, the widget, the quick-settings tile, reminders, NFC tags and QR codes.
// Anything else is ignored, so a link can never delete or change data by itself.
export function parseDeepLink(raw) {
  if (typeof raw !== "string" || !raw.startsWith("lifearchipelago://")) return null;
  let u; try { u = new URL(raw); } catch (e) { return null; }
  const what = (u.host || u.pathname.replace(/^\/+/, "")).toLowerCase(), q = u.searchParams;
  if (what === "add") { const text = (q.get("text") || "").trim().slice(0, 500); return text ? { action: "add", text } : { action: "capture" }; }
  if (what === "goal") { const text = (q.get("text") || "").trim().slice(0, 500); return text ? { action: "goal", text } : { action: "goals" }; } // R58
  if (what === "open" && q.get("id")) return { action: "open", id: q.get("id").slice(0, 80) };
  if (what === "open" && q.get("place")) return { action: "place", id: q.get("place").slice(0, 40) };
  if (["today", "scan", "voice"].includes(what)) return { action: what };
  return null;
}

// R58 · the website has no lifearchipelago:// links, so it reads ?add=… and ?goal=… instead.
// Like the phone links, these can only add, never change or delete.
export function linkFromPage(search) {
  const q = new URLSearchParams(search || "");
  for (const action of ["add", "goal"]) {
    const text = (q.get(action) || "").trim().slice(0, 500);
    if (text) return { action, text };
  }
  return null;
}
export const pageLink = (base, action, text) => `${base}?${action}=${encodeURIComponent(text)}`;
export const appLink = (action, text) => `lifearchipelago://${action}?text=${encodeURIComponent(text)}`;
