// R16 · Feedback from inside the app becomes a prefilled GitHub issue (or text to share).
export const FEEDBACK_REPO = "ranAIran/byClaudePlatformPublic";
const KINDS = {
  bug: { prefix: "Bug", label: "bug" },
  idea: { prefix: "Idea", label: "enhancement" },
  praise: { prefix: "Feedback", label: "feedback" },
};

export function buildFeedback({ kind = "idea", text = "", diag = {}, includeDetails = true } = {}, maxUrl = 7000) {
  const k = KINDS[kind] || KINDS.idea;
  const full = String(text || "").trim();
  const first = (full.split("\n")[0] || "").trim().slice(0, 70) || "(no description)";
  const title = `[Life ${diag.version || "?"}] ${k.prefix}: ${first}`;
  const details = includeDetails
    ? "\n\n---\n**Sent from the app**\n" + Object.entries(diag).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([key, v]) => `- ${key}: ${v}`).join("\n")
    : "";
  const labels = `${k.label},life-app`;
  const make = (desc) => `https://github.com/${FEEDBACK_REPO}/issues/new?` + new URLSearchParams({ title, body: desc + details, labels }).toString();
  let desc = full || "_No description_";
  let url = make(desc);
  // Browsers and GitHub reject very long URLs: shorten the description, keep the details.
  while (url.length > maxUrl && desc.length > 20) {
    desc = desc.slice(0, Math.floor(desc.length * 0.8)).trimEnd();
    url = make(desc + "\n\n…(truncated)");
  }
  if (desc !== (full || "_No description_")) desc += "\n\n…(truncated)";
  return { title, body: desc + details, url, text: `${title}\n\n${full || "(no description)"}${details}` };
}
