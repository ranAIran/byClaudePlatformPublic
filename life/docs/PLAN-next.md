# Life Archipelago: next work plan (approved by the owner, 17 Nov 2026)

For the agent who picks this up. Read `CLAUDE.md` first: it has the way of working (tests first, small pushed
steps, look at screenshots, answer the owner in Hebrew) and the lessons. Work on branch `claude/life-archipelago`.
Do the steps in this order; each step is one or more pushes with its tests green (`npm test`, `npm run test:visual`).
Add each new requirement to `life/docs/requirements.html` (Hebrew) when it passes.

Why this order: the game layer (city, walking, physics) is ahead of the usefulness layer. Steps 1–4 make the app
worth opening every day; 5–7 make it nicer; 8 is graphics for desktop only.

## Step 1 · R33 Edit an item
Today an item can only be added, ticked and deleted.
- Tap an item's text (not its checkbox) opens an edit view inside the sheet: title, due date (date input plus
  chips: today, tomorrow, next week, none), notes, effort 1–5, type, place (move to any island or room), steps
  (add, rename, remove, reorder), link URL.
- Delete moves into this view (with the existing undo toast). Remove the ✕ from every row.
- Store: `store.update(id, patch)` already exists; add `moveStep`/step editing helpers in `core/store.js` if needed.
- Tests first: unit (editing keeps id, created, XP flags; moving to another place; steps edit never re-awards XP);
  visual (open edit, change title and date, row shows them).

## Step 2 · R34 Today screen
One list that answers "what now".
- Pure function `core/today.js`: `todayList(store, now)` → sections `overdue`, `today`, `week` (next 7 days),
  `bag` (count of unplaced), each task with its place path. Sorted by due date, then effort.
- UI: tapping the date in the HUD or a new "Today" pill at the start of the quests strip opens the Today sheet.
  Tasks can be ticked there (same celebration through `finish()`); tapping a row's text opens edit (R33).
- Empty state: "Nothing due. Enjoy the evening." plus the bag count if not zero.
- On app start, if anything is overdue, open Today once per day (remember the date in localStorage).
- Tests: unit for the sections with a fixed `now`; visual for opening it and ticking a task.

## Step 3 · R35 Repeating tasks, then R11 Reminders
**R35 repeat.** New node field `repeat`: `{ every: n, unit: "day"|"week"|"month"|"year" }` or null (add to
`normalize()` in `core/store.js`, and to export/import).
- Completing a repeating task awards XP once for that occurrence, then reopens it with the next due date
  (from the due date, not from today, unless that is still in the past: then the next date after today).
- Capture parsing (`core/capture.js`): "every week", "every 6 months", "כל שבוע", "כל חצי שנה", "כל חודש".
- Edit view (R33) gets a repeat picker.
- Tests: unit for next-date maths (month ends, leap years), XP once per occurrence, Hebrew and English parsing.

**R11 reminders (Android).** A task with a due date gets a notification at 09:00 that day (time configurable later).
- Kotlin: `AlarmManager` + a `BroadcastReceiver` that posts the notification; reschedule on boot
  (`RECEIVE_BOOT_COMPLETED`); `POST_NOTIFICATIONS` runtime permission on Android 13+, asked the first time a due
  date is set, with one sentence explaining why. Tapping the notification opens the app on that task (use the
  deep link from R21 below).
- Bridge: web sends the full list of `{ id, title, dueISO }` to `LifeAndroid.setReminders(json)` whenever tasks
  change; Kotlin diffs and schedules. Keep `bridge.js` the only Android-aware web file.
- Web fallback: none for now (say so in the About toast).
- Tests: unit for the list the web sends; Kotlin unit test for the schedule diff. Real delivery must be checked
  on a phone: tell the owner exactly what to try.

## Step 4 · R19 + R20 Safe data
- R19: move nodes from localStorage to IndexedDB with a schema version and tombstones (`deleted: true`,
  kept 30 days) so later sync is possible. Migrate v1 data on first start without losing an item. The store stays
  synchronous for callers: load everything at start, write behind.
- R20: automatic daily backup. Android: write `life-backup-YYYY-MM-DD.json` to a folder the owner picks once
  (Storage Access Framework, persisted permission), keep the last 14. Web: remind monthly to export.
  Restore = the existing import.
- Tests: unit for migration (v1 fixture → v2, same nodes), tombstones, backup rotation.

## Step 5 · R36 Coins that buy something
Coins vanish today and XP is only a number.
- Each finished task adds coins to a wallet in `state` (task 1, quest step 1, quest 5; never removed).
  Show the count next to XP in the HUD. Walking into a 3D coin adds +1 bonus (max 5 per burst).
- A small shop sheet ("Decorate") per district: bench, flower bed, tree, fountain, flag, house colour.
  Bought decorations are placed at preset spots in that district and saved in the store.
- Pure rules in `core/shop.js` (prices, what is owned, cannot overspend). Scenes: decorations are built at start
  from the saved list and baked with the district.
- No penalties, no streaks. Tests: unit for wallet and shop rules; visual for buying one item and seeing it.

## Step 6 · R37 Hebrew interface
- `core/i18n.js` with `t(key, vars)` and two dictionaries (en, he). Language follows the device, with a menu
  switch. Set `dir="rtl"` on the document for Hebrew; check HUD, sheets, chips, labels and the edit view in RTL.
- District and room names are data (store titles): translate the seed names when the language is Hebrew and the
  user has not renamed them.
- Tests: unit (every key exists in both dictionaries); visual screenshot in Hebrew, checked by eye for overflow.

## Step 7 · R38 Shortcuts on the phone (and R21 deep links)
The owner asked for quick shortcuts on the phone. Build, in this order:
1. **R21 deep links**: `lifearchipelago://add?text=…`, `…://open?place=paperwork`, `…://today`, `…://scan`.
   Intent filter in `AndroidManifest.xml`, handled in `MainActivity.kt`, passed to the web through `lifeBridge`.
2. **App shortcuts** (long-press the app icon): "Add to bag", "Scan a document", "Today", "Speak". Static
   `res/xml/shortcuts.xml` pointing at the deep links.
3. **Home-screen widget**: today's first 3 tasks and a "+" button that opens capture (`AppWidgetProvider`,
   refreshed when reminders are set).
4. **Quick Settings tile** "Add to Life" (`TileService`) that opens capture.
5. **In-app gestures**: swipe a row right to tick, left to open edit; long-press the bag to start voice capture.
6. Desktop keyboard: `/` search, `n` new capture, `t` Today, `g` then a letter to open a district, Esc closes.
Tests: unit for parsing deep links into actions; the Android parts need a phone check, list the steps for the owner.

## Step 8 · R39 Enhanced graphics on computers only
Decision by the owner: computers get enhanced graphics by default, with a menu switch back to the current light
graphics. Phones never change.
- Quality setting: `light` | `enhanced`. Default `enhanced` when the pointer is fine (not coarse) and the screen is
  wide (≥ 900 px); otherwise `light`. Saved in localStorage; the menu item is hidden on phones.
- Start from the study in `life/proto/?shot=dusk` (`shotDusk()`, `surf()` textures with relief). First compare,
  on the Home block only, drawn textures against ready CC0 models (Kenney, Quaternius; check that the files can be
  downloaded from this environment and vendor them in the repo, glTF + three's GLTFLoader vendored like three.js).
  Show the owner both pictures and let him choose before converting the whole city.
- Keep one scene description; quality only changes materials, lights (lamps as real lights), tree detail and
  water. State signs (R27), walking solids (R31) and `bake()` must keep working in both.
- Tests: visual in both qualities (not blank, R27 signs visible), and that a phone profile stays `light`.

## Also keep in mind
- Interface notes agreed with the owner: the home needs two steps to tick a simple task (Today fixes most of it);
  the bag should nudge when items are older than 3 days (badge colour and a line in Today).
- References (ideas; check each licence before copying code): Habitica, Super Productivity (Today and daily
  review), Tasks.org (Android reminders, repeat, widget), Loop Habit Tracker (habit strength that forgives a
  missed day), Vikunja (API for the sync phase).
- Not verified on a real phone yet: camera gestures, walk mode, frame rate. Ask the owner for feedback after
  each APK.
