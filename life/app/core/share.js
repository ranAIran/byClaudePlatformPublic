// Content shared into the app (Android share sheet, or the web share target) becomes a bag node.
import { parseCapture } from "./capture.js";
import { suggestPlaces } from "./places.js";

const URL_RE = /https?:\/\/[^\s<>"']+/i;

export function shareToNode({ text = "", subject = "", images = [] } = {}, now = new Date()) {
  const all = `${subject} ${text}`.trim();
  if (images && images.length) {
    return { type: "photo", title: subject || text || "Shared photo", images: [...images], parent: "bag", suggest: suggestPlaces(all) };
  }
  const m = URL_RE.exec(text) || URL_RE.exec(subject);
  if (m) {
    const url = m[0].replace(/[).,]+$/, "");
    const rest = all.replace(url, "").replace(/\s+/g, " ").trim();
    let host = url; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (e) { /* keep raw */ }
    return { type: "link", url, title: subject || rest || host, parent: "bag", suggest: suggestPlaces(`${all} ${url.replace(/[/._-]+/g, " ")}`) };
  }
  const c = parseCapture(all, now);
  return { ...c, parent: "bag", suggest: suggestPlaces(all) };
}
