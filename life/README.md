# Life Archipelago

A second brain and life organizer as a 3D game: your life as islands (Home, Work, Health, Family, Paperwork), rooms inside Home, and a bag that captures anything in seconds. The plan, critique, market review and requirements live in the "Life Archipelago Plan" doc.

## One codebase, two apps

```
life/app/          the app: same files on the web and inside the Android APK
  core/            pure logic, no DOM: store, capture parsing, place suggestions, XP, export, share
  scenes.js        3D map and home interior (built on quest/world.js and three.js WebGPU)
  app.js           interface: HUD, bag, island and room sheets, search, menu
  media.js         photos and scans in IndexedDB
  bridge.js        the only Android-aware file; falls back to web features when not on Android
life/android/      thin Kotlin shell: WebView + scanner, camera, voice, shares in and out
life/test/         tests: core.test.js (Vitest) and visual.mjs (Playwright, real browser)
life/proto/        the five rendered prototype screens
```

About 95% of the code is shared. Android adds only `MainActivity.kt`: it loads the bundled web app through `WebViewAssetLoader` and exposes `window.LifeAndroid` (scanDocument, voiceInput, shareText, saveFile, openExternal). Native results come back through `window.lifeBridge` (onShare, onScanResult, onVoice, onError, back).

## Run it

- **Web:** serve the repository root (`python3 -m http.server 8000`) and open `http://localhost:8000/life/app/`. Add `?webgl` to force WebGL2.
- **Android:** every push to `claude/life-archipelago` runs `.github/workflows/life-android.yml`: tests, then the APK, published as a pre-release named "Life Archipelago 0.1.N" with `life-archipelago.apk` attached. Builds are signed with the committed test key (`life/android/debug.keystore`, not for the Play Store), so each one installs over the last.
- **Build the APK locally:** `bash life/android/copy-web.sh`, then `cd life/android && ./gradlew :app:assembleDebug` (needs the Android SDK).

## Tests (requirements first)

```bash
cd life && npm install
npm test               # R1 capture, R2 place suggestions, R3 places, R7 export/import, R8 XP, R16 feedback, sharing
npm run test:visual    # R4 fly into Home under 1.2 s, R5 never a blank frame, the capture flow, XP on completion
```

## What v0.1 does

- Life map with live badges per island; tap Home to fly into the rooms.
- The bag: type, speak or snap a photo; dates in English and Hebrew ("tomorrow", "20/11", "עד מרץ", "מחר") become due dates; each capture gets a suggested place.
- Tasks and multi-step quests with XP and levels; items, pets, notes, links, photos and scans in rooms and islands.
- Search, share a summary, export and import a JSON backup.
- Send feedback (menu): opens a prefilled GitHub issue with the version and device details, or shares it by email or chat.
- Android: scan documents (ML Kit), take photos, voice input, and "Share" from any app into the bag.
