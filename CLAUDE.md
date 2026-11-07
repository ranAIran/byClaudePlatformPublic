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
npm test                 # Vitest: life/test/*.test.js (R1–R3, R7, R8, R16, sharing)
npm run test:visual      # Playwright: life/test/visual.mjs (R4 fly < 1.2 s, R5 no blank frame, capture flow, XP, R16 feedback)
bash life/android/copy-web.sh   # copies life/app + quest engine into the APK assets (CI does this)
```

The quest has its own checks (Playwright scripts used in earlier sessions; see `quest/README.md`).

## Environment limits (cloud session)

- No Android SDK locally and `dl.google.com` is blocked: the APK can only be built by GitHub Actions (`.github/workflows/life-android.yml`). Read failures with the GitHub MCP `get_job_logs`.
- Public CDNs (jsdelivr, unpkg, cdnjs) are blocked: three.js 0.170.0 is vendored in `quest/vendor/`. npm registry and Maven Central work.
- Headless Chromium can't present WebGPU to a canvas here; tests run the WebGL2 fallback (`?webgl` or no GPU flags). Real WebGPU must be checked on a device.

## Lessons (do not repeat)

- **Never call `renderer.compileAsync()` before the first frame** with the post-processing pass: it left the whole scene blank (quest v1.3.2).
- **Service workers must be network-first** for game files. Cache-first plus a versioned registration URL froze phones on an old version (quest v1.3.2 → fixed in 1.3.4).
- **Quest version bump = 3 places:** `CONFIG.version` in `quest/content.js`, the two `v…` texts in `quest/index.html`, `SW_BUILD` in `quest/sw.js`.
- **Life version:** `VERSION` in `life/app/app.js`; the APK `versionName` is `0.1.<CI run number>`.
- WebGL/WebGPU `scene.background` textures are not drawn under this setup: use a backdrop mesh (`backdrop()` in `life/proto/proto.js`).
- Hebrew keyword matching must be whole-word with optional one-letter prefixes (ו ב ל מ ה ש כ), not substring (`life/app/core/places.js`).
- The APK is signed with the committed test key `life/android/debug.keystore` so updates install over each other. Not for the Play Store.

## Life Archipelago architecture

- `life/app/core/`: pure logic, no DOM, fully unit-tested (store, capture/date parsing, place suggestions, XP, export, share).
- `life/app/scenes.js`: 3D map + home interior, built on `quest/world.js`.
- `life/app/app.js`: UI. `life/app/media.js`: images in IndexedDB. `life/app/bridge.js`: the only Android-aware web file.
- `life/android/.../MainActivity.kt`: WebView + `WebViewAssetLoader`, ML Kit document scanner, camera, voice, share in/out. JS ↔ Kotlin through `window.LifeAndroid` and `window.lifeBridge`.

## Status (update at the end of every session)

- **Done:** v0.1 web app and APK 0.1.1 (CI green). Tests R1–R5, R7, R8 and sharing pass.
- **Done:** R16 Send feedback (menu → Send feedback…): opens a prefilled GitHub issue with version and device details, or shares the text. App version 0.1.2. Not yet added to the requirements table in the doc.
- **Done:** quest 1.4.0: Hebrew words in the tokens puzzle (player picks English/עברית); admin shortcut (tap the version 5 times, PIN in `CONFIG.admin.pin`, skip islands; not security, the PIN is in the source).
- **Done:** two independent APKs from `life/android` via product flavors `life` (com.lifearchipelago.app) and `quest` (com.latentarchipelago.quest); CI publishes both in each release.
- **Not yet verified on a real phone:** scanner, camera, voice, share-in, WebGPU performance.
- **Next candidates:** device check of APK 0.1.1 and fixes; R9 read bill fields from scans (ML Kit text recognition); R11 reminders (notifications); R10 item recognition; Hebrew UI toggle; better 3D assets (CC0 packs); merge to `main`; GitHub Issues per requirement.
