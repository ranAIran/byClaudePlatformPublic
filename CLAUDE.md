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
npm test                 # Vitest: life/test/*.test.js, 122 tests (R1–R3, R7, R8, R11, R16, R19–R21, R26, R27, R29, R31–R45, R49, R51–R54, R56)
npm run test:visual      # Playwright: life/test/visual.mjs, about 6 minutes (city, golden hour, signs, turning, middle-drag, walking, coins, edit, Today, repeats, deep links, shop, keys and swipe, Hebrew, IndexedDB, desktop quality)
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
- **Life-only Android parts live in the `life` flavor** (`life/android/app/src/life/`): shortcuts, widget, tile, deep-link intent filter. Main code talks to them only by broadcast (`com.lifearchipelago.app.UPDATE_WIDGET`), so the quest APK still compiles.
- **Never check or build calendar dates through UTC** (`toISOString()` on a local date): in Israel (UTC+2) every date in the edit view was refused as "doesn't exist" (0.6.0). Compare year/month/day numbers. The visual test runs in `Asia/Jerusalem`, and the unit test R40 sets `TZ`.
- **Measure the 3D picture with the HTML overlays hidden** (labels, HUD, hint): they float over the city at varying moments and made the golden-hour test flaky.
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
- **Done (0.3.2):** a more spacious city (street grid 7.5 instead of 6, wide sandstone sidewalks, street trees along every block; lighthouse, marina, boats, balloon and camera moved out to match) and a new main bag: an illustrated leather satchel with a brass buckle that wiggles while things wait in it.
- **Preview (awaiting the owner's verdict):** enhanced-graphics study at `life/proto/?shot=dusk` (`shotDusk()` in `life/proto/proto.js`): one block at dusk with drawn textures and relief (`surf()`), fuller trees, lamps as real lights, a lighthouse beam, foam, a boat. Not in the app yet.
- **Not yet verified on a real phone:** the new camera gestures, walk mode and frame rate with the bigger world; also scanner, camera, voice, share-in, WebGPU performance.
- **Done (0.4.0–0.6.0), the whole plan in `life/docs/PLAN-next.md`:** middle mouse button pans; R33 edit an item (`core/edit.js`); R34 Today (`core/today.js`, opens once a day when something is late); R35 repeating tasks (`core/repeat.js`, Hebrew and English phrases); R11 reminders (Android `Reminders.kt`, 09:00 on the due day, Kotlin unit test runs in CI); R21 deep links (`core/links.js`); R19 IndexedDB with tombstones (`app/storage.js`); R20 daily backups to a folder on Android (`Backups.kt`), monthly export reminder on the web; R36 coins buy decorations (`core/shop.js`); R37 Hebrew interface (`core/i18n.js`, RTL); R38 app shortcuts, home-screen widget and quick-settings tile (Android `src/life/` flavor only), swipe gestures, keyboard shortcuts; R39 enhanced graphics on computers only (`core/quality.js`, drawn surfaces, street lights; menu switch; phones stay light).
- **Done (0.6.1):** R40 date fix above; R41 Shopping category (the shops block is now a district, with shopping words in English and Hebrew); R42 Categories in the menu: rename any category or room, add new ones (the first new one gets the park block on the map, the rest appear in lists), remove new ones (their things go back to the bag).
- **Not possible from this environment:** ready-made CC0 models (Kenney, Quaternius, Poly Pizza are blocked; npm has no city kit). Enhanced graphics use drawn textures instead.
- **Must be checked on a real phone (cannot be tested here):** reminders arriving, the widget, the tile, app shortcuts, the backup folder picker, notifications permission.
- **Done (0.7.0):** Goals Board, R43 + R49 (manual and plan: `life/docs/goals-manual.html`). Flag button → sheet "goals": write a done-state sentence (Hebrew/English, "עד שבת בערב…", morning 08:00 / evening 18:00 / clock times) → card with a drawing (object + scene, `life/app/goalart.js`), countdown, one first step with a time, Started / Done, "achieved this week". Logic in `core/goals.js` (`parseGoal`, `goalBoard`, `timeLeft`); goals are nodes `type: "goal"`, `parent: null`, extra fields in `node.goal`. Owner's decisions: no levels or unlock conditions (the owner adds sub-steps as they like); about 3 open goals is only a suggestion. Next per the manual: R44 plan backward, R45 stuck questions, R46 windows, R47 important/urgent, R48 wish shelf.
- **Done (0.8.0):** R44 plan backward (card → "Plan backward" opens sheet `goal:<id>`: path drawn from the goal at the top to "you are here"; "what must be true just before…?" puts each answer in front; dates spread back from the deadline unless the owner moved them (`spreadDates`, `fixed`); tick a station (+XP, +1 coin); "I can do this now" sets the first step; one obstacle with an if–then plan; progress shows done-so-far early, left-to-go late (`progressView`)). R45 stuck questions (`stuckReason`: the step's time passed without Started, or a third of the time went by with nothing done; at most once a day per goal via `goal.asked`; six answers → actions in `store.answerStuck`; stakes none/soft/hard; "not important" releases the goal, kept apart from achieved). Colours: dark high contrast is the default (`html:not([data-theme="faded"])` tokens in `index.html`), menu → "Colours" switches to the original "faded" look (`localStorage` `life-theme`).
- **Lesson (0.8.0):** the visual test's `thumb()` now hides all overlays before the screenshot (`bare()`); the darker sheet fade was still fading out and failed R29 "turning back". Also: a downscaled side-by-side image can make Hebrew look reversed; check a full-size crop before chasing a bidi bug.
- **Data plan agreed (see `life/docs/DATA-PLAN.md`):** end-to-end encryption on Supabase (option C), recovery key on paper, Claude as an approved device (read-only, 24 h), no Vercel, AI chat later via an OpenAI-compatible API, phases A–D.
- **Done (0.9.0), phase A:** R51 action log: the store compares every node with its last saved form on each change (`record()` in `core/store.js`), so every add/update/remove (and score changes) gets an entry `{seq, at, op, id, type, fields, after, by, device}`; `store.as("claude"|"app"|"me")` sets who; device id per install (`localStorage` `life-device`). Raw inputs `{seq, at, kind, text, result, device, by}` for typed/voice/link captures, goals, plan answers, steps, stuck answers, photos, scans, shares. R52 profile (`core/profile.js`: workWeek, restTimes, focusTimes, lowTimes, errands, placeHours, people; Israeli defaults; each value keeps source me/learned/default, time and history; learned values are suggestions until accepted). Saved data is version 3 (`profile`, `suggestions`, `journal`, `inputs`); version 2 moves over with a "migrate" entry; `core/sealable.js` splits records into server-visible metadata and content. Menu: "My week & memory…", "Activity log…" (actions / raw inputs tabs).
- **Done (0.10.0), phase B:** end-to-end encrypted sync on Supabase (see `life/docs/DATA-PLAN.md` and `life/docs/phase-b-db-report.html`). Menu → "Sync & devices…": the first device turns sync on and shows the paper recovery code once; another device asks to join and shows a 6-digit code; an approved device approves the matching code (Claude requests are approved read-only for 24 h); revoke; recover with the paper code. Background sync 4 s after a change, every minute, and when the app comes back. Nothing contacts the server until sync is turned on. A joining device drops its own example items first. Server SQL lives in `supabase/migrations/` and is applied with `supabase/apply.sh` (Management API).
- **Lessons (0.10.0):** Node's built-in fetch ignores HTTPS_PROXY here: run Node scripts that call outside hosts with `NODE_USE_ENV_PROXY=1`. Playwright against outside hosts: `launch({ proxy: { server: HTTPS_PROXY, bypass: "localhost,127.0.0.1" } })` plus `ignoreHTTPSErrors` in the context. The live sync checks run only while the project has no vault: once the owner turns sync on, they print SKIP.
- **Done (0.10.1):** R56 app icon, option A chosen by the owner (the city island at golden hour with a goal flag). Android: adaptive icon only in the `life` flavour (`src/life/res/mipmap-anydpi-v26/ic_launcher.xml` + background/foreground PNGs in every density, legacy `ic_launcher.png`); the quest keeps its own. Web: `life/app/icons/` (icon.svg, favicon-32, icon-180, icon-512). The art source is `life/app/icons/icon.svg`.
- **Done (0.10.2):** R57 phone top bar and menu (owner's screenshot: in Hebrew the bar ran off the left edge and the menu button was cut). The bar now shrinks (`.hud-mid` grid column `minmax(0,1fr)`, the date truncates, tighter sizes under 430 px); in right-to-left the menu opens under its button on the left; a tap outside the open menu closes it and is swallowed. Visual check R57 at 360 px in Hebrew.
- **Done (0.10.3):** installing the website as an app uses the new icon: `life/app/manifest.webmanifest` (standalone, icons 192/512 + maskable 512, dark theme colour); Chrome reports no installability errors. No service worker on purpose (see the network-first lessons); add one only with a network-first strategy.
- **Done (0.10.4):** sync fixes found on the owner's real vault (only 1 of the computer's items had gone up): a device's first sync now sends everything it already had (`store.syncMarkAll()`, once per vault, flag `fullPush:<vault>` in the key store), except untouched built-in places and an untouched score/profile, so a new device's defaults never overwrite the vault; untouched built-in places always accept the vault's version; each sync pulls before it pushes; the server keeps the newest version (`records_keep_newest` trigger, migration 3). A read-only device (the agent) never does the full send.
- **Pending (owner approved, "later"):** fast-forward `claude/latent-archipelago` to the current quest (it is quest v1.3.4 and fully contained in `claude/life-archipelago`, which has quest 1.4.2).
- **Lesson (0.10.2):** a layout check that measures `getBoundingClientRect()` must also check the element is visible: a hidden element measures 0–0 and passes "inside the screen".
- **Open issues to handle later (owner asked to note them):**
  - The first commit `397f4e7` "Initial commit" (4 Nov 2026) carries the owner's personal email as author; it is public in the history. Options: GitHub setting "Keep my email addresses private" for future commits; rewriting history needs a force-push and the owner's explicit approval.
  - This session ran in the cloud environment "AndroidAnchor" (made for another project). The Supabase personal access token (api.supabase.com) and the host `uuamddvxaownewcfpczt.supabase.co` were saved there. Create a separate environment for Life Archipelago, move them, and remove them from AndroidAnchor; revoke the token in Supabase after setup rounds.
- **Later candidates:** sync between devices (R24) and the MCP server (R23/R25) from the data plan; walking inside the house; first-person view; collect coins by walking into them; more toys; device check of the latest APK and fixes; R9 read bill fields from scans (ML Kit text recognition); R11 reminders (notifications); R10 item recognition; Hebrew UI toggle; better 3D assets (CC0 packs); merge to `main`; GitHub Issues per requirement.
