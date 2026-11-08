# מתמטיקה ו׳ – Math practice app for 6th grade (Android)

Hebrew-first (RTL) Android app for practising 6th-grade math. Students can practise
built-in topics, or **photograph / upload a worksheet or test** and the app extracts the
exercises so they can solve them on the phone, with instant feedback or as a graded test.

## Features

- **Upload a worksheet** – take a photo, pick an image from the gallery, upload a **PDF** (up to 6
  pages, all read together), or *Share* an image/PDF into the app from any other app.
- **Built-in class sheets** – "דף תרגול שבועי – מס׳ 4" ships with the app with a full answer key,
  hints and solutions (`core/.../BuiltInSheets.kt`). Add future weekly sheets there the same way.
- **Two ways to extract the content**
  - **✨ Smart (Claude AI)** – the photo is sent to Claude (vision), which reads Hebrew, handwriting,
    word problems, tables and drawings, and returns structured exercises with an answer key,
    a hint and a step-by-step solution in Hebrew. Requires an Anthropic API key (Settings).
  - **📱 On-device (offline)** – ML Kit text recognition + a built-in parser. Free and private, and it
    computes the answers to arithmetic items such as `3/4 + 1/8 = ___` automatically.
    *Limitation:* ML Kit has no Hebrew model, so it only reads digits/Latin text – use the smart mode
    for Hebrew word problems.
- **Review & edit** what was extracted (fix OCR mistakes, add/delete questions, set answers or
  multiple-choice options) and save it to *My worksheets*.
- **Two modes**
  - **Exercises (תרגול)** – check each answer, hints, retries, solution after two wrong tries.
  - **Test (מבחן)** – timer, move between questions, submit, then a score and a full review.
- **Smart answer checking** – `1/2`, `0.5`, `2/4` and `50%` are all accepted; mixed numbers (`2 1/2`),
  `x = 7`, units (`24 ס״מ`), `כן/לא` and Israeli notation (`·` and `:`) are understood.
- **Built-in practice generator** for: fractions, decimals, percentages, ratio, negative numbers,
  order of operations, divisibility (GCD/LCM), area & perimeter, simple equations – plus a mixed test.
- **Progress history**, "practise my mistakes", works fully offline without a key.

## Web version

`web/index.html` is a browser version of the same app (Hebrew, RTL, no install), published as a
claude.ai page: https://claude.ai/artifact/LDQX1f5gjozmUBtjp52ZwY . Uploaded images/PDFs are read
by Claude on the viewer's own Claude account (no API key). Progress is kept in the browser.
`web/index.src.html` is the source; `index.html` = source + the built-in sheets JSON exported by
`CORE_ONLY=1 ./gradlew :core:test` (`core/build/builtins.json`), injected at `/*BUILTINS*/`.

## Project layout

| Module | What it contains |
|---|---|
| `core/` | Pure Kotlin/JVM: exact `Rational` arithmetic, expression evaluator, answer checker, OCR worksheet parser, Hebrew exercise generator, `ClaudeExtractor` (Anthropic Java SDK, structured JSON output). Unit-tested. |
| `app/`  | Android app: Jetpack Compose + Material 3 UI, ML Kit OCR, image picker / camera, JSON storage. |

## Build

Requirements: JDK 17+, Android SDK (compileSdk 35).

```bash
./gradlew :core:test            # unit tests
./gradlew :app:assembleDebug    # APK -> app/build/outputs/apk/debug/
```

Without an Android SDK you can still test the core: `CORE_ONLY=1 ./gradlew :core:test`.

Every push runs `.github/workflows/android.yml`, which runs the tests and uploads the APK as the
`math6-debug-apk` artifact – download it from the Actions run and install it on the phone
(allow "install unknown apps").

Every push also publishes a GitHub Release. Permanent link to the newest APK:
https://github.com/ranAIran/byClaudePlatformPublic/releases/latest/download/math6.apk

## Claude API key

Settings → paste an Anthropic API key (from console.anthropic.com). The default model is
`claude-opus-5-5`; you can change the model id in Settings. Each extraction sends one downscaled
image (~1600px) and is billed to that key. The key is stored only on the device.
