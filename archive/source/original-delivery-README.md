# DB Monitor v2.3 — Soft Day themed database messenger

WhatsApp-style database monitor: local-first SQLite storage, cloud sync,
Markdown message bodies (styles, images, inline video), a real-time
home-screen widget, styled notifications with permission flow — all in the
warm Soft Day theme (cream #F0EAE2, terracotta #C0684F, charcoal #2E2A26).

## Install

1. Copy `db-monitor-v2.3.apk` to your Android phone (Android 5.0+).
2. Tap it and allow "install from unknown sources" when asked.
   Installing over v2.2/v2.1 works directly (same signature, higher
   versionCode 5).
3. On first launch the app asks for **notification permission** — allow it
   so database alerts can reach you (Android 13+).

## What's new in v2.3

- **Real-time home-screen widget** — the widget now re-renders every second
  by itself (native Handler tick), even with the app closed:
  - live countdown to the next 15-minute sync,
  - terracotta ring that drains in real time,
  - **"updated Ns ago"** label counting up from the last data change,
  - pending count and the latest message title; tap opens the app.
- **Markdown message bodies** — the database `body` field may contain
  Markdown and it renders properly in the detail view:
  headings, **bold**, *italic*, lists, code blocks, tables, links,
  `![images](url)` with Soft Day rounded corners and placeholders, and
  `[video](url.mp4)` / any `.mp4 .mov .webm .m3u8 .mkv` link as an inline
  player with play/pause and scrubbing. Relative media URLs resolve against
  your Firebase base URL.
- **WhatsApp-style local storage management (SQLite)**:
  - every message is stored locally in `dbmonitor.db` (messages, outbox,
    tombstones, meta tables) — the app is fully usable offline;
  - chat list with bubbles, day dividers (TODAY / date), unread bolding,
    long-press actions (mark done, delete everywhere);
  - delivery ticks: clock = queued offline, single tick = uploading,
    double tick = synced with cloud, warning = failed after retries;
  - Settings → Storage and data: message count, pending uploads, DB size,
    last sync, "Free up space" (trim 30+ days) and "Clear all messages".
- **Cloud sync engine** — WhatsApp-style outbox pattern:
  1. local changes (done/seen/delete) queue in the outbox and upload first;
  2. then remote items are pulled and merged (last-write-wins on updatedAt,
     tombstones prevent deleted items from resurrecting);
  3. new remote messages trigger styled notifications;
  4. widget + UI refresh in real time via the DataBus event stream.
  Works with **Firebase Realtime Database** (REST) or any **REST API** that
  returns a JSON list. Configure in Settings → Cloud sync.
- 6 unit tests, all passing (remote JSON mapping, roundtrip, copyWith,
  Markdown detection, delivery-state parsing).

## Connecting a cloud (optional)

Open **Settings → Cloud sync** and enter either:

1. **Firebase Realtime Database URL** — e.g.
   `https://your-project.firebaseio.com` plus a path (default `items`).
   The app reads AND writes items at `<url>/<path>/<id>.json` (PUT/DELETE),
   so your done/seen/delete changes sync back up.
2. **REST API URL** — any endpoint returning a JSON list (read + best-effort
   write at `/{id}`). Common field names are recognized
   (`id`/`key`/`_id`, `title`/`name`/`subject`, `body`/`message`/`markdown`,
   `type`/`severity`, `createdAt`/`timestamp`…; envelopes `items`/`data`/
   `results`/`rows`/`records` are unwrapped).

Without a cloud the app runs in **local mode** — everything stored on the
device, sync waits until you configure one.

## Message body Markdown cheat-sheet (for your DB records)

```markdown
# Heading
**bold**, *italic*, `inline code`
- bullet list
[link](https://example.com)
![image](https://example.com/chart.png)      → rendered image
[video](https://example.com/clip.mp4)        → inline video player
```

## Applying the git patch (developers)

`db-monitor-v2.3.patch` contains the **entire project folder** as a patch
against an **empty repository state**:

```bash
mkdir my-repo && cd my-repo && git init
git apply --stat path/to/db-monitor-v2.3.patch   # preview
git apply path/to/db-monitor-v2.3.patch          # apply
git add -A && git commit -m "DB Monitor v2.3.0"
```

It adds `app/` (Flutter project: SQLite storage, sync engine, markdown
renderer, widget, logo assets, tests) and `scripts/make_logo.py`.
Build artifacts, keystore, `local.properties`, `key.properties` are
intentionally excluded (.gitignore'd).

Build after applying (Flutter 3.24.x, Android SDK 34):

```bash
cd app
flutter pub get
flutter build apk --release
```

To sign, create `android/key.properties` (see signingConfigs in
`app/android/app/build.gradle`) and your own keystore via `keytool`.

## Technical

- Flutter 3.24.5, Dart 3.4+, minSdk 21, targetSdk 34, package
  `com.dbmonitor.db_monitor`, versionName 2.3.0, versionCode 5
- Storage: `sqflite` SQLite (messages / outbox / tombs / meta)
- Sync: `http` REST client + WorkManager 15-min periodic task + foreground
  timer + resume-triggered sync; exponential backoff via attempt counters
- Markdown: `flutter_markdown` + custom image builder + `video_player`
- Widget: `home_widget` + native `SoftDayWidgetProvider` (Kotlin) with a
  1-second Handler tick for real-time updates
- Notifications: `flutter_local_notifications`, 4 per-type channels,
  Android 13+ runtime permission flow, BigText style, terracotta color

## Files

- `db-monitor-v2.3.apk` — the installable app (v2.3.0, versionCode 5)
- `db-monitor-v2.3-project.zip` — the complete project (Flutter sources,
  Android host, logo assets, tests, signing keystore, logo generator script);
  unzip and build with `cd app && flutter pub get && flutter build apk --release`
- `db-monitor-v2.3.patch` — full project as a git patch from empty state
- `README.md` — this file
