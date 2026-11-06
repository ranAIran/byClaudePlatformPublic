// Export and import: JSON (exact) and Markdown (one file per node, readable in Obsidian or any editor).
// Markdown files carry their fields as front matter, one JSON value per line, so nothing is lost.

export const exportJSON = (store) => JSON.stringify(store.snapshot(), null, 2);
export function importJSON(store, text, opts) { store.restore(typeof text === "string" ? JSON.parse(text) : text, opts); }

const FIELDS = ["id", "type", "title", "parent", "kind", "due", "done", "effort", "tags", "steps", "url", "created", "updated", "awarded", "bossAwarded"];
const safe = (s) => String(s || "untitled").replace(/[\\/:*?"<>|#\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "untitled";

export function exportMarkdown(store) {
  const files = {};
  const titleOf = (id) => store.get(id)?.title || id;
  for (const n of store.all()) {
    if (n.system) continue;
    const folder = n.parent === "bag" ? ["Bag"] : [...store.path(n.id).map(titleOf)];
    const name = `${safe(n.title)} (${n.id.slice(0, 8)}).md`;
    const front = FIELDS.filter((k) => n[k] !== undefined).map((k) => `${k}: ${JSON.stringify(n[k])}`).join("\n");
    const body = [`# ${n.title}`, n.url ? `\n<${n.url}>` : "", n.steps ? "\n" + n.steps.map((s) => `- [${s.done ? "x" : " "}] ${s.title}`).join("\n") : "", n.notes ? `\n${n.notes}` : ""].join("");
    files[[...folder, name].join("/")] = `---\n${front}\nnotes: ${JSON.stringify(n.notes || "")}\n---\n${body}\n`;
  }
  return files;
}

export function importMarkdown(store, files, { merge = true } = {}) {
  const nodes = [];
  for (const text of Object.values(files)) {
    const m = /^---\n([\s\S]*?)\n---/.exec(text);
    if (!m) continue;
    const n = {};
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(": "); if (i < 0) continue;
      try { n[line.slice(0, i)] = JSON.parse(line.slice(i + 2)); } catch (e) { /* skip a broken line */ }
    }
    if (n.id) nodes.push(n);
  }
  store.restore({ nodes }, { merge });
  return nodes.length;
}

// One readable file for "email it to someone" or pasting into notes.
export function exportDigest(store) {
  const lines = ["# Life Archipelago export", ""];
  for (const isl of store.children("world")) {
    lines.push(`## ${isl.title}`);
    const items = store.descendants(isl.id).filter((n) => !n.system);
    if (!items.length) lines.push("_nothing yet_");
    for (const n of items) lines.push(`- ${n.type === "task" ? (n.done ? "[x] " : "[ ] ") : ""}${n.title}${n.due ? ` (due ${n.due})` : ""}${n.url ? ` <${n.url}>` : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}
