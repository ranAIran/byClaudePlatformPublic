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
| `main.js` | Game loop, input (walk, pan, pinch), camera, dialogue, puzzles, Codex and saving. |
| `speech.js` | Narration: splits Hebrew and English runs and picks a voice for each. |

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

Then open `http://localhost:8000/quest/`. Add `?shot` for a frozen frame with no title screen, which is handy for thumbnails. Add `?webgl` to force the WebGL2 backend if a device has trouble with WebGPU.

- **Saved progress:** stored in `localStorage` under `latent-archipelago-v1`. "Start over" on the title screen clears it.
- **Controls:** tap or click to walk, tap a keeper (or press `E`) to talk, WASD or arrow keys to move, `Esc` to close panels.
- **Looking around:** drag to pan the map. Pinch or use the mouse wheel to zoom. The ⌖ button (or `C`) recenters on your character, and the view also drifts back while you walk. Tune it with `CONFIG.camera` (`panMargin`, `panReturn`, `minZoom`, `maxZoom`).

## Narration

Every written instruction has a 🔊 button: dialogue lines, puzzle explanations (plus the question or task), the title intro, Codex entries and the end screen. The HUD speaker button turns on auto narration, which reads each new line as it appears. Set the default with `CONFIG.narration.autoReadDefault`.

Narration uses the browser's built-in voices (Web Speech API) in the selected language. Hebrew text often contains English terms, so `speech.js` splits it into Hebrew and English runs and reads each with a voice of its own language. The two languages are never mixed in one utterance. Hebrew prefixes attached to English words (`ה-`, `ל-`, `ב-`...) get vowel marks so they're pronounced as syllables. If the device has no voice for a language, the game says so and falls back to the default voice.

A puzzle type can add its own narration text by calling `setSpeech(text)`, as `quiz`, `rag` and `agent` do.

## Look

`CONFIG.world.style` picks the island look: `"lush"` (organic coastline, hills, grass tufts, shallow water and foam) or `"classic"` (the original faceted islands). Sky gradient, sun, water, shallow-water opacity and grass density are all in `CONFIG.world`. Characters are built in `world.js` (`makeCharacter`), and each keeper picks a hat (`wizard`, `straw`, `cap`, `hood`, `goggles`, `crown`, `none`) and hair colour in `content.js`. `preview.html` shows one island in both styles side by side (`?island=embeddings`, `?close`, `?walk`).

## Install as an app (PWA)

The game is a Progressive Web App. On Android and desktop Chrome or Edge an "Install as an app" button appears on the title screen. On iPhone the title screen explains Share → Add to Home Screen. After the first visit it also works offline.

`sw.js` caches every game file under a cache named after `CONFIG.version`. Bumping the version installs a fresh copy and removes the old cache. If you add a new file to the game, add it to `FILES` in `sw.js` too.

## Deploying

The site is fully static. Bump `CONFIG.version` in `content.js` on every release; it's shown under the game title (title screen and top bar), so you can confirm which version is live.

- **GitHub Pages:** serve the branch from `/ (root)`. The game is at `/quest/`.
- **Vercel:** Framework "Other", no build command, Root Directory `./`.
- **Caching:** GitHub Pages caches files for about 10 minutes. If the corner still shows the old version, hard-refresh (Ctrl/Cmd+Shift+R).

three.js is MIT-licensed; its license is in `vendor/three-LICENSE`.
