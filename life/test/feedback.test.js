// R16 · Send feedback: a GitHub issue form opens prefilled with the text, version and device details.
import { describe, it, expect } from "vitest";
import { buildFeedback, FEEDBACK_REPO } from "../app/core/feedback.js";

const diag = { version: "0.1.2", platform: "Android 0.1.2", renderer: "WebGPU", screen: "412×915 @2.6", view: "home › kitchen" };
const params = (url) => new URL(url).searchParams;

describe("R16 · send feedback", () => {
  it("opens a new-issue form on the project's GitHub with the text and device details", () => {
    const f = buildFeedback({ kind: "idea", text: "Let me add rooms\nlike a balcony", diag });
    expect(f.url.startsWith(`https://github.com/${FEEDBACK_REPO}/issues/new?`)).toBe(true);
    const p = params(f.url);
    expect(p.get("title")).toBe("[Life 0.1.2] Idea: Let me add rooms");
    expect(p.get("body")).toContain("Let me add rooms\nlike a balcony");
    for (const v of Object.values(diag)) expect(p.get("body")).toContain(v);
    expect(p.get("labels")).toContain("enhancement");
  });
  it("labels bugs as bugs", () => {
    const f = buildFeedback({ kind: "bug", text: "Scanner closes", diag });
    expect(params(f.url).get("title")).toBe("[Life 0.1.2] Bug: Scanner closes");
    expect(params(f.url).get("labels")).toContain("bug");
  });
  it("still works with no text", () => {
    const f = buildFeedback({ kind: "praise", text: "  ", diag });
    expect(params(f.url).get("title")).toBe("[Life 0.1.2] Feedback: (no description)");
  });
  it("keeps the URL short enough for browsers and says when text was cut", () => {
    const f = buildFeedback({ kind: "bug", text: "word ".repeat(5000), diag }, 6000);
    expect(f.url.length).toBeLessThanOrEqual(6000);
    expect(params(f.url).get("body")).toContain("(truncated)");
    expect(f.text).toContain("word word");
  });
  it("can leave device details out", () => {
    const f = buildFeedback({ kind: "idea", text: "Dark mode", diag, includeDetails: false });
    expect(params(f.url).get("body")).not.toContain("WebGPU");
  });
});
