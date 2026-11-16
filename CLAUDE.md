# Project guide for Claude sessions

Read this first. It carries the decisions and lessons from earlier sessions so a new session can continue without the old conversation.

## What is in this repo

| Product | Folder | What it is | Live |
|---|---|---|---|
| Life Archipelago | `life/` | Second brain / life organizer as a 3D game. Web app + Android APK from one codebase. | Site root and `/life/app/` on GitHub Pages; APK on the Releases page |
| Latent Archipelago | `quest/` | 10–15 min 3D quest about AI concepts, Hebrew/English, PWA | `/quest/` on GitHub Pages |
| Driftlight | branch `claude/bold-brown-gxnmau` | 60-second WebGPU particle game (first experiment) | not deployed |

- **Plan, requirements and market review:** the "Life Archipelago Plan" Claude Doc: https://claude.ai/artifact/S4iKLptxgowCdSQWM56CXW (requirements R1–R15 with status, prototypes, roadmap).
- **APK downloads:** https://github.com/ranAIran/byClaudePlatformPublic/releases (pre-releases "Life + Latent Archipelago 0.1.N" with life-archipelago.apk and latent-archipelago.apk).
- **GitHub Pages** serves branch `claude/life-archipelago` from the root. Vercel can serve the same repo (production branch set in Vercel settings).

## Branches

- `claude/life-archipelago`: current main line (contains quest + life). Pages deploys from it.
- `claude/latent-archipelago`: older quest-only line, superseded by the branch above.
- `claude/upbeat-babbage-iebtc7`: a separate math-practice Android app from another session; do not touch.
- Goal: merge `claude/life-archipelago` into `main` and point Pages/Vercel at `main`.

## How to work (agreed with the owner)

1. **Requirements first, as tests.** Every feature has an R-id (see the doc). Write or update the failing test first, then the code. Name tests after the R-id.
2. **Small steps, each pushed.** Every push to `claude/life-archipelago` that touches `life/**` or `quest/**` runs CI: unit tests, then builds and publishes the APK.
3. **Look at the result.** Render screenshots with Playwright and check them before saying something works. Passing logic tests did not catch a blank 3D scene once.
4. **Previews before big visual changes.** The owner likes to approve a rendered preview first.
5. **Answer in the owner's language** (often Hebrew). App UI is English for now; capture parsing handles Hebrew and English.

## Commands

```bash
cd life && npm install
npm test                 # Vitest: life/test/*.test.js (R1–R3, R7, R8, R16, sharing, R26 rewards, R27 moods, R29 orbit, R31 walking and routes, R32 physics)
npm run test:visual      # Playwright: life/test/visual.mjs, about 4 minutes (R4, R5, R16–R18, R26–R32: city, golden hour, state signs, turning, horizon, walking, coins)
bash life/android/copy-web.sh   # copies life/app + quest engine into the APK assets (CI does this)
```

```bash
node quest/check.mjs           # Quest: Q1 bridges connect, Q2 reach the Gate keeper, Q3 admin taps + PIN, Q4 loads once on SW update
```

## Environment limits (cloud session)

- No Android SDK locally and `dl.google.com` is blocked: the APK can only be built by GitHub Actions (`.github/workflows/life-android.yml`). Read failures with the GitHub MCP `get_job_logs`.
- Public CDNs (jsdelivr, unpkg, cdnjs) are blocked: three.js 0.170.0 is vendored in `quest/vendor/`. npm registry and Maven Central work.
- Headless Chromium can't present WebGPU to a canvas here; tests run the WebGL2 fallback (`?webgl` or no GPU flags). Real WebGPU must be checked on a device.

## Lessons (do not repeat)

- **Never call `renderer.compileAsync()` before the first frame** with the post-processing pass: it left the whole scene blank (quest v1.3.2).
- **Bridge walk zones must reach a fixed distance into islands**, not a percentage of the bridge length: irregular coastlines left a gap (quest 1.4.0). `quest/check.mjs` Q1 scans every bridge.
- **Never reload the page when a new service worker takes over** (quest 1.4.1 did on the title screen: the game loaded twice and swallowed the Start tap). Network-first already serves the current files. `quest/check.mjs` Q4.
- **Service workers must be network-first** for game files. Cache-first plus a versioned registration URL froze phones on an old version (quest v1.3.2 → fixed in 1.3.4).
- **Quest version bump = 3 places:** `CONFIG.version` in `quest/content.js`, the two `v…` texts in `quest/index.html`, `SW_BUILD` in `quest/sw.js`.
- **Life version:** `VERSION` in `life/app/app.js`; the APK `versionName` is `0.1.<CI run number>`.
- WebGL/WebGPU `scene.background` textures are not drawn under this setup: use a backdrop mesh (`backdrop()` in `life/proto/proto.js`).
- Hebrew keyword matching must be whole-word with optional one-letter prefixes (ו ב ל מ ה ש כ), not substring (`life/app/core/places.js`).
- **Do not use `THREE.PostProcessing` for more than one scene** (r170): all instances share one quad/material, so the last one built wins (map showed the house). `app.js` uses `screenPass()`, a private QuadMesh per world, and warms up the other world at frame 10.
- **An `InstancedMesh` must keep the instance count it had on its first frame** (r170 sizes the instance buffer then): the reward coins were invisible when the pool started at `count = 0`. Keep a fixed pool and scale unused instances to zero.
- **Greedy "slide along the wall" steering gets trapped in corners** (porch + house wall). Walking uses a grid route (`route()` in `life/app/core/walk.js`), then straightens it.
- **Animations that must finish (camera turns, confetti) use real elapsed time**, not the capped frame delta: the software renderer in tests runs at 2–5 fps, and slow phones exist.
- The APK is signed with the committed test key `life/android/debug.keystore` so updates install over each other. Not for the Play Store.

## Life Archipelago architecture

- `life/app/core/`: pure logic, no DOM, fully unit-tested (store, capture/date parsing, place suggestions, XP, export, share).
- `life/app/core/` also holds the game rules that are easy to get wrong: `mood.js` (district state), `reward.js` (celebration size), `orbit.js` (camera maths), `walk.js` (walkable area, routes), `physics.js` (balls and coins).
- `life/app/scenes.js`: the 3D city (districts, signs, toys, coins, door marks) + home interior, built on `quest/world.js`. Static geometry is merged with `bake()`.
- `life/app/fx.js`: 2D celebrations (confetti, +XP flying to the bar, chime, level-up).
- `life/app/app.js`: UI, the orbit camera, walk mode (follow camera with a spring arm) and the physics loop. `life/app/media.js`: images in IndexedDB. `life/app/bridge.js`: the only Android-aware web file.
- `life/android/.../MainActivity.kt`: WebView + `WebViewAssetLoader`, ML Kit document scanner, camera, voice, share in/out. JS ↔ Kotlin through `window.LifeAndroid` and `window.lifeBridge`.

## Status (update at the end of every session)

- **Done:** v0.1 web app and APK 0.1.1 (CI green). Tests R1–R5, R7, R8 and sharing pass.
- **Done:** R16 Send feedback (menu → Send feedback…): opens a prefilled GitHub issue with version and device details, or shares the text. App version 0.1.2. Not yet added to the requirements table in the doc.
- **Done:** quest 1.4.0: Hebrew words in the tokens puzzle (player picks English/עברית); admin shortcut (tap the version 5 times, PIN in `CONFIG.admin.pin`, skip islands; not security, the PIN is in the source).
- **Done:** two independent APKs from `life/android` via product flavors `life` (com.lifearchipelago.app) and `quest` (com.latentarchipelago.quest); CI publishes both in each release.
- **Done (0.1.3):** bedroom redesign: bed, computer table, two terrariums 60×60×45 and 60×45×45 cm (`terrarium()` and `cm()` in `life/app/scenes.js`, 1 unit ≈ 80 cm; test R17). Fixed back-to-map showing the house (test "R4 back to map").
- **Approved and built:** R18 life map as a city (first previewed at `life/proto/?shot=city`). Requirements doc in Hebrew with live statuses, the city preview and the market review: `life/docs/requirements.html` (R16–R18 are only there, not yet in the Claude Doc).
- **Done (life 0.1.4, quest 1.4.1):** small gecko (22 cm) in the big terrarium; quest bridge walk zone reaches 1.6 units into each island (the Alignment Gate entrance had a gap and blocked the player); admin taps window 5 s with a countdown toast after the 3rd tap; renderers ask for the high-performance GPU.
- **Done (life 0.2.0):** the main map is now a city at golden hour (`buildMapInto` in `life/app/scenes.js`; the islands are gone). Districts are merged into few meshes with `bake()`; anything animated or toggled sits under a group with `userData.live`. Each district shows its state (`core/mood.js`, R27): crane/scaffolding/cones and a flickering lamp when a task is overdue, a festoon when all clear. Tests R18, R27, R28 in `life/test/`.
- **Done (0.2.1–0.2.2):** R26 celebrations (`fx.js`, `core/reward.js`); the interface redesign in a warm dusk palette (compact HUD, labels with state badges, animated sheet, splash, first-run hint).
- **Done (0.3.0):** R29/R30 a true 3D world: perspective orbit camera (drag moves, twist or right-drag turns and tilts, pinch zooms, Q/E and two buttons turn 45°), sky, sun, sea to the horizon, hills, lighthouse, marina; the house stands in a garden.
- **Done (0.3.1):** R31 walk mode (walk button; tap the ground or a building; routes round buildings; chase camera; reaching a door opens that place); R32 physics (two balls you can kick or tap, the balloon bobs when tapped, reward coins burst from a place's door when its sheet closes, splashes in the water).
- **Not yet verified on a real phone:** the new camera gestures, walk mode and frame rate with the bigger world; also scanner, camera, voice, share-in, WebGPU performance.
- **Next candidates:** walking inside the house; first-person view; collect coins by walking into them; more toys; device check of the latest APK and fixes; R9 read bill fields from scans (ML Kit text recognition); R11 reminders (notifications); R10 item recognition; Hebrew UI toggle; better 3D assets (CC0 packs); merge to `main`; GitHub Issues per requirement.
