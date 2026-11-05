# Latent Archipelago

A short 3D quest (10–15 minutes) across seven islands, each built around one AI concept: **Tokens, Embeddings, Attention, Training, RAG, Agents, Alignment**. On each island a keeper explains the concept and gives you a challenge. Each challenge you solve earns a shard and builds a bridge to the next island. Once you hold all the shards, the **Alignment Gate** opens a **Codex** that maps each island to the real companies, papers and sites behind it.

- **Graphics:** three.js `WebGPURenderer` with bloom. If the browser has no WebGPU, it falls back to WebGL2 automatically.
- **Languages:** Hebrew and English, with a toggle. Only explanations and dialogue are translated. Names and terms stay in English.
- **No build step.** three.js is bundled in `vendor/`, so the game doesn't depend on any CDN.

## Files

| File | What it holds |
|---|---|
| `content.js` | **Everything editable.** `CONFIG` (camera, colours, fog, bloom, speed), `UI` (interface strings in each language) and `ISLANDS` (each island's data). |
| `puzzles.js` | The challenge types (`tokens`, `embed`, `attention`, `gradient`, `rag`, `agent`, `quiz`). |
| `world.js` | 3D builders: islands, water, bridges, characters and the `PROPS` decoration sets. |
| `main.js` | Game loop, input, camera, dialogue, puzzles, Codex and saving. |

## Adding or changing content

**Edit text or puzzle data:** change the island's entry in `ISLANDS` in `content.js`. Bilingual fields look like `{ he: "...", en: "..." }`.

**Add an island:** add an object to `ISLANDS`. Bridges link islands in array order, so put it where it belongs in the path.

```js
{
  id: "evals", name: "Eval Observatory", concept: "Evals",
  pos: [-14, -6], radius: 5.5,
  theme: { grass: "#8fc47a", sand: "#e6d4a2", accent: "#58c4dd" },
  props: "library",                       // any key from PROPS in world.js
  keeper: { name: "Iris", role: { he: "...", en: "..." }, colors: ["#335", "#eac", "#ccc"] },
  dialogue: { he: ["...", "..."], en: ["...", "..."] },
  puzzle: { type: "quiz", explain: { he: "...", en: "..." }, questions: [ /* see the Alignment Gate */ ] },
  codex: { allegory: { he, en }, text: { he, en }, links: [{ label: "...", url: "https://..." }] },
}
```

Keep the island marked `requires: "all"` (the gate) last.

**Add a quick screen without code:** use `type: "quiz"`. It takes any number of multiple-choice questions straight from `content.js`.

**Add a new challenge type:** add a function to `PUZZLES` in `puzzles.js`. It receives `{ root, p, tr, ui, feedback, done }`. Render into `root`, read your parameters from `p`, and call `done()` when the challenge is solved.

**Add a decoration set:** add a builder to `PROPS` in `world.js`. It receives `(group, island, config, rng)` and can return an `update(t, dt)` function for animation.

## Running it

Serve the folder over HTTP, because ES modules don't load from `file://`. For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/quest/`. Add `?shot` for a frozen frame with no title screen, which is handy for thumbnails.

- **Saved progress:** stored in `localStorage` under `latent-archipelago-v1`. "Start over" on the title screen clears it.
- **Controls:** tap or click to walk, tap a keeper (or press `E`) to talk, WASD or arrow keys to move, mouse wheel to zoom, `Esc` to close panels.

## Deploying

The site is fully static.

- **GitHub Pages:** serve the branch from `/ (root)`. The game is at `/quest/`.
- **Vercel:** Framework "Other", no build command, Root Directory `./`.

three.js is MIT-licensed; its license is in `vendor/three-LICENSE`.
