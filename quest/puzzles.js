// Puzzle registry. Each entry renders one challenge type into `root`.
// Signature: (ctx) => void, where ctx = { root, p, tr, ui, done, feedback }
//   p        the island's `puzzle` object from content.js
//   tr(x)    picks the current language from a { he, en } object (strings pass through)
//   ui       UI strings for the current language
//   feedback(text, kind)  shows a message under the puzzle ("ok" | "bad" | "info")
//   done()   call once when the challenge is solved
// To add a new challenge type, add a function here and set `puzzle.type` to its key.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

export const PUZZLES = {
  // Cut words into tokens by toggling the gaps between letters.
  tokens({ root, p, ui, feedback, done }) {
    const state = p.words.map(() => new Set());
    const list = h("div", { class: "pz-tokens", dir: "ltr" });
    function render() {
      list.replaceChildren(...p.words.map((w, wi) => {
        const row = h("div", { class: "tk-row" });
        const letters = [...w.word];
        letters.forEach((ch, i) => {
          row.append(h("span", { class: "tk-letter" }, ch));
          if (i < letters.length - 1) {
            const on = state[wi].has(i + 1);
            row.append(h("button", { type: "button", class: "tk-gap" + (on ? " on" : ""), "aria-label": `cut after ${ch}`, "aria-pressed": String(on),
              onclick: () => { on ? state[wi].delete(i + 1) : state[wi].add(i + 1); render(); } }));
          }
        });
        const parts = split(w.word, state[wi]);
        const chips = h("div", { class: "tk-chips" }, parts.map((t, k) => h("span", { class: "chip c" + (k % 4) }, t)));
        return h("div", { class: "tk-word" }, row, chips);
      }));
    }
    function split(word, cuts) { const out = []; let last = 0; [...cuts].sort((a, b) => a - b).forEach((c) => { out.push(word.slice(last, c)); last = c; }); out.push(word.slice(last)); return out; }
    const check = h("button", { type: "button", class: "btn primary", onclick: () => {
      const wrong = p.words.filter((w, i) => split(w.word, state[i]).join("|") !== w.answer.join("|"));
      if (!wrong.length) { feedback("✓", "ok"); done(); }
      else feedback(`✗ ${wrong.map((w) => w.word).join(", ")}`, "bad");
    } }, ui.check);
    render();
    root.append(list, h("div", { class: "actions" }, check));
  },

  // Plant word seeds into the bed with the closest meaning.
  embed({ root, p, feedback, done }) {
    let selected = null;
    const planted = new Map(); // seed word -> bed id
    const field = h("div", { class: "pz-field", dir: "ltr" });
    const tray = h("div", { class: "pz-tray", dir: "ltr" });
    function render() {
      field.replaceChildren(...p.beds.map((b) => {
        const words = [...b.words.map((w) => h("span", { class: "fw" }, w)), ...[...planted].filter(([, id]) => id === b.id).map(([w]) => h("span", { class: "fw new" }, w))];
        return h("button", { type: "button", class: "bed" + (selected ? " ready" : ""), style: { left: b.x + "%", top: b.y + "%", "--c": b.color },
          onclick: () => plant(b) }, h("b", {}, b.label), h("span", { class: "fws" }, words));
      }));
      tray.replaceChildren(...p.seeds.filter((s) => !planted.has(s.word)).map((s) =>
        h("button", { type: "button", class: "seed" + (selected === s ? " sel" : ""), "aria-pressed": String(selected === s), onclick: () => { selected = s; render(); } }, "🌱 " + s.word)));
    }
    function plant(bed) {
      if (!selected) return;
      if (selected.bed === bed.id) {
        planted.set(selected.word, bed.id); feedback(`✓ ${selected.word} → ${bed.label}`, "ok"); selected = null; render();
        if (planted.size === p.seeds.length) done();
      } else { feedback(`✗ ${selected.word} ≠ ${bed.label}`, "bad"); }
    }
    render();
    root.append(field, tray);
  },

  // Aim attention: tap the word the query token refers to.
  attention({ root, p, ui, feedback, done }) {
    let idx = 0;
    const box = h("div", { class: "pz-attn", dir: "ltr" });
    const nav = h("div", { class: "actions" });
    function render(revealed = false) {
      const it = p.items[idx];
      const weights = it.tokens.map((_, i) => i === it.answer ? 0.62 : i === it.rival ? 0.18 : i === it.query ? 0 : 0.2 / (it.tokens.length - 3));
      box.replaceChildren(
        h("div", { class: "attn-count" }, `${idx + 1} / ${p.items.length}`),
        h("div", { class: "attn-row" }, it.tokens.map((tok, i) => {
          const isQ = i === it.query;
          const w = revealed ? weights[i] : 0;
          return h("button", { type: "button", class: "attn-tok" + (isQ ? " q" : ""), disabled: isQ || revealed,
            style: { "--w": w.toFixed(3) }, onclick: () => pick(i) }, tok, revealed && !isQ ? h("small", {}, Math.round(w * 100) + "%") : null);
        })));
      nav.replaceChildren();
      if (revealed) nav.append(h("button", { type: "button", class: "btn primary", onclick: () => { idx++; if (idx < p.items.length) { feedback("", "info"); render(); } else done(); } }, ui.next));
    }
    function pick(i) {
      const it = p.items[idx];
      if (i === it.answer) { feedback(`✓ "${it.tokens[it.query]}" → "${it.tokens[i]}"`, "ok"); render(true); }
      else feedback(`✗ "${it.tokens[i]}"`, "bad");
    }
    render();
    root.append(box, nav);
  },

  // Gradient descent on a 1D loss valley.
  gradient({ root, p, ui, feedback, done }) {
    const f = (x) => 0.5 * (x - p.minimum) ** 2;
    const grad = (x) => x - p.minimum;
    let x = p.start, steps = 0, trail = [x], finished = false;
    const X0 = -7, X1 = 11, W = 360, H = 180;
    const sx = (v) => ((v - X0) / (X1 - X0)) * W;
    const sy = (v) => H - 14 - Math.min(v, 40) / 40 * (H - 30);
    let path = ""; for (let i = 0; i <= 80; i++) { const v = X0 + (X1 - X0) * i / 80; path += (i ? "L" : "M") + sx(v).toFixed(1) + " " + sy(f(v)).toFixed(1); }
    const svg = h("div", { class: "pz-grad", dir: "ltr" });
    const lrIn = h("input", { type: "range", id: "lr", min: p.lr.min, max: p.lr.max, step: p.lr.step, value: p.lr.initial });
    const lrOut = h("output", { for: "lr" }, p.lr.initial);
    const info = h("div", { class: "grad-info", dir: "ltr" });
    lrIn.addEventListener("input", () => { lrOut.textContent = (+lrIn.value).toFixed(2); });
    function draw() {
      const dots = trail.map((v, i) => `<circle cx="${sx(Math.max(X0, Math.min(X1, v)))}" cy="${sy(f(v))}" r="${i === trail.length - 1 ? 8 : 3.5}" class="${i === trail.length - 1 ? "ball" : "trail"}"/>`).join("");
      svg.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Loss valley"><path d="${path}" class="curve"/><line x1="${sx(p.minimum)}" x2="${sx(p.minimum)}" y1="${sy(0) + 4}" y2="${sy(0) + 12}" class="goal"/>${dots}<text x="6" y="14">Loss</text><text x="${W - 6}" y="${H - 2}" text-anchor="end">x</text></svg>`;
      info.textContent = `Step ${steps}/${p.maxSteps} · x = ${x.toFixed(2)} · Loss = ${f(x).toFixed(3)}`;
    }
    const stepBtn = h("button", { type: "button", class: "btn primary", onclick: () => {
      if (finished) return;
      if (steps >= p.maxSteps || Math.abs(x) > 40) { feedback("↺", "bad"); return; }
      x = x - (+lrIn.value) * grad(x); steps++; trail.push(x); draw();
      if (Math.abs(x - p.minimum) < p.tolerance) { finished = true; feedback(`✓ Learning Rate ${(+lrIn.value).toFixed(2)}`, "ok"); done(); }
      else if (Math.abs(x - p.minimum) > 12) feedback("💥 Learning Rate ↑↑", "bad");
      else if (steps >= p.maxSteps) feedback("⏳ Learning Rate ↓", "bad");
    } }, "Step");
    const reset = h("button", { type: "button", class: "btn", onclick: () => { x = p.start; steps = 0; trail = [x]; finished = false; feedback("", "info"); draw(); } }, ui.retry);
    draw();
    root.append(svg, h("label", { class: "lr", dir: "ltr" }, "Learning Rate ", lrIn, lrOut), info, h("div", { class: "actions" }, reset, stepBtn));
  },

  // Retrieve exactly the relevant documents, then ask the oracle.
  rag({ root, p, tr, feedback, done }) {
    const chosen = new Set();
    const q = h("div", { class: "oracle" }, h("b", {}, "Oracle"), h("p", {}, tr(p.question)), h("p", { class: "muted" }, tr(p.noContext)));
    const shelf = h("div", { class: "pz-shelf" });
    function render() {
      shelf.replaceChildren(...p.docs.map((d, i) => h("button", { type: "button", class: "scroll-doc" + (chosen.has(i) ? " sel" : ""), "aria-pressed": String(chosen.has(i)),
        onclick: () => { chosen.has(i) ? chosen.delete(i) : chosen.add(i); render(); } }, h("b", { dir: "ltr" }, "📜 " + d.title), h("span", {}, tr(d.text)))));
    }
    const ask = h("button", { type: "button", class: "btn primary", onclick: () => {
      if (chosen.size !== p.need) { feedback(`${chosen.size} / ${p.need}`, "bad"); return; }
      const ok = [...chosen].every((i) => p.docs[i].relevant);
      if (ok) { feedback(tr(p.grounded), "ok"); done(); }
      else feedback("✗ " + [...chosen].filter((i) => !p.docs[i].relevant).map((i) => p.docs[i].title).join(", "), "bad");
    } }, "Ask the Oracle");
    render();
    root.append(q, shelf, h("div", { class: "actions" }, ask));
  },

  // Build an ordered tool plan for an agent and run it.
  agent({ root, p, tr, ui, feedback, done }) {
    let plan = [];
    const task = h("div", { class: "oracle" }, h("b", {}, "Task"), h("p", {}, tr(p.task)));
    const tools = h("div", { class: "pz-tools" });
    const planEl = h("ol", { class: "pz-plan", dir: "ltr" });
    const log = h("div", { class: "pz-log", dir: "ltr", "aria-live": "polite" });
    function render() {
      tools.replaceChildren(...p.tools.map((t) => h("button", { type: "button", class: "tool", onclick: () => { plan.push(t.name); render(); } },
        h("code", { dir: "ltr" }, t.name), h("span", {}, tr(t.desc)))));
      planEl.replaceChildren(...plan.map((n, i) => h("li", {}, h("button", { type: "button", class: "step", onclick: () => { plan.splice(i, 1); render(); } }, n, " ✕"))));
    }
    let running = false;
    const run = h("button", { type: "button", class: "btn primary", onclick: async () => {
      if (running || !plan.length) return;
      running = true; log.replaceChildren(); feedback("", "info");
      let doneSteps = 0, error = null;
      for (const name of plan) {
        const pos = p.solution.indexOf(name);
        if (pos === -1) error = tr(p.errors.extra);
        else if (pos !== doneSteps) error = tr(p.errors[name] || p.errors.missing);
        log.append(h("div", { class: error ? "bad" : "ok" }, (error ? "✗ " : "✓ ") + name + "()"));
        await new Promise((r) => setTimeout(r, 380));
        if (error) break;
        doneSteps++;
      }
      if (!error && doneSteps < p.solution.length) error = tr(p.errors.missing);
      running = false;
      if (error) feedback(error, "bad"); else { feedback("✓", "ok"); done(); }
    } }, "Run agent");
    const clear = h("button", { type: "button", class: "btn", onclick: () => { plan = []; log.replaceChildren(); feedback("", "info"); render(); } }, ui.retry);
    render();
    root.append(task, tools, h("div", { class: "plan-wrap" }, planEl, log), h("div", { class: "actions" }, clear, run));
  },

  // Generic multiple-choice quiz. Handy for quickly adding new screens from content alone.
  quiz({ root, p, tr, ui, feedback, done }) {
    let idx = 0;
    const box = h("div", { class: "pz-quiz" });
    function render() {
      const q = p.questions[idx];
      box.replaceChildren(h("div", { class: "attn-count" }, `${idx + 1} / ${p.questions.length}`), h("p", { class: "quiz-q" }, tr(q.q)),
        h("div", { class: "quiz-opts" }, q.options.map((o, i) => h("button", { type: "button", class: "btn opt", onclick: (e) => {
          if (i === q.correct) { e.currentTarget.classList.add("right"); feedback("✓", "ok"); setTimeout(() => { idx++; feedback("", "info"); idx < p.questions.length ? render() : done(); }, 650); }
          else { e.currentTarget.classList.add("wrong"); feedback("✗", "bad"); }
        } }, tr(o)))));
    }
    render();
    root.append(box);
  },
};
