# DB Monitor — WhatsApp-style database monitor (Flutter / Android)

DB Monitor watches your database (Firebase Realtime Database or any REST API)
and delivers new records like chat messages: local-first SQLite storage,
WhatsApp-style cloud sync, Markdown message bodies, a real-time home-screen
widget, and styled notifications with a full permission flow — all in the warm
**Soft Day** theme (cream `#F0EAE2`, terracotta `#C0684F`, charcoal `#2E2A26`).

**Latest release: v2.4.0 (versionCode 6)** — install
`db-monitor-v2.4.0.apk` from the [v2.4.0 release](../../releases/tag/v2.4.0)
(Android 5.0+). The APK is built and attached automatically by GitHub Actions.

## Install

1. Download `db-monitor-v2.4.0.apk` from the
   [v2.4.0 release](../../releases/tag/v2.4.0) and copy it to your Android
   phone (Android 5.0+).
2. Tap it and allow "install from unknown sources" when asked. Installing over
   v2.3/v2.2/v2.1 works directly (same signature, higher versionCode 6).
3. On first launch the app asks for **notification permission** — allow it so
   database alerts can reach you (Android 13+).
4. From v2.4 onward you never need to sideload again: **Settings → App
   updates → Check** looks up the latest GitHub release, downloads the APK
   and the system installer finishes the job.

## What's new in v2.4

- **Compact side countdown on the widget** — the countdown ring now sits on
  the right side of the widget in a smaller size, so the message lines get
  the full width. Three sizes (S 40dp / M 48dp / L 58dp) adjustable in
  **Settings → Home-screen widget → Countdown ring size**; the widget
  re-renders within a second after changing.
- **In-app updates from GitHub releases** — the app checks
  `github.com/gghsff07-sudo/bd-connect/releases` for a newer version, shows
  the release notes, downloads the APK with a progress bar and launches the
  system installer (Android 8+ via session-based install intent, older
  devices via the classic VIEW intent). Android 8+ asks once for "install
  unknown apps" permission for DB Monitor.
- **Full-width message detail** — the message popup no longer hugs the right
  edge like a chat bubble: it opens as a full-width card, giving Markdown
  bodies (tables, code blocks, videos) the whole screen width.

## What's new in v2.3

- **Real-time home-screen widget** — the widget re-renders every second by
  itself (native Handler tick), even with the app closed:
  - live countdown to the next 15-minute sync,
  - terracotta ring that drains in real time,
  - **"updated Ns ago"** label counting up from the last data change,
  - pending count and the latest message title; tap opens the app.
- **Markdown message bodies** — the database `body` field may contain Markdown
  and it renders in the detail view: headings, **bold**, *italic*, lists, code
  blocks, tables, links, `![images](url)` with Soft Day rounded corners and
  placeholders, and `[video](url.mp4)` / any `.mp4 .mov .webm .m3u8 .mkv` link
  as an inline player with play/pause and scrubbing. Relative media URLs
  resolve against your Firebase base URL.
- **WhatsApp-style local storage (SQLite)**:
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
  2. remote items are pulled and merged (last-write-wins on updatedAt,
     tombstones prevent deleted items from resurrecting);
  3. new remote messages trigger styled notifications;
  4. widget + UI refresh in real time via the DataBus event stream.
- 6 unit tests, all passing (remote JSON mapping, roundtrip, copyWith,
  Markdown detection, delivery-state parsing).

## Building from source

Requirements: Flutter 3.47.x (built and tested with 3.47.9), Dart 3.4+, Android SDK 34, JDK 17.

```bash
cd app
flutter pub get
flutter build apk --release
```

The APK appears at `app/build/app/outputs/flutter-apk/app-release.apk`.
For a signed build matching the released APK, see
[`signing/SIGNING.md`](signing/SIGNING.md).

**CI:** publishing a GitHub release (tag `v*`) automatically builds the
signed APK and attaches it (plus a SHA-256 checksum) to that release —
see [`.github/workflows/release-build.yml`](.github/workflows/release-build.yml).
The workflow can also be run manually from the **Actions** tab.

To reproduce the full project as originally delivered (sources + keystore +
build config), unzip `releases/db-monitor-v2.3-project.zip`, or apply
`releases/db-monitor-v2.3.patch` to an empty git repo:

```bash
mkdir my-repo && cd my-repo && git init
git apply path/to/db-monitor-v2.3.patch
git add -A && git commit -m "DB Monitor v2.3.0"
```

## Repository layout

```
app/        Flutter project (v2.4.0) — lib/, android/, assets/, test/
scripts/    make_logo.py (logo/icon generator), setup_keystore.py
signing/    release keystore + key.properties + instructions  ⚠ see SIGNING.md
releases/   db-monitor-v2.4.apk, project zip, git patch
archive/    earlier versions & predecessor apps (DB Alert, Notice Tracker)
```

## Connecting a cloud (optional)

Open **Settings → Cloud sync** in the app and enter either:

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

## Technical

- Flutter 3.47, Dart 3.4+, minSdk 21, targetSdk 34, package
  `com.dbmonitor.db_monitor`, versionName 2.4.0, versionCode 6
- Storage: `sqflite` SQLite (messages / outbox / tombs / meta)
- Sync: `http` REST client + WorkManager 15-min periodic task + foreground
  timer + resume-triggered sync; exponential backoff via attempt counters
- Markdown: `flutter_markdown` + custom image builder + `video_player`
- Widget: `home_widget` + native `SoftDayWidgetProvider` (Kotlin) with a
  1-second Handler tick for real-time updates; three size layouts
  (S/M/L, selectable in Settings)
- Updates: GitHub releases API + `http` streaming download + FileProvider
  install intent (`db_monitor/update` method channel)
- Notifications: `flutter_local_notifications`, 4 per-type channels,
  Android 13+ runtime permission flow, BigText style, terracotta color

## Version history

| Version | Notes |
| --- | --- |
| v2.4.0 | Compact side countdown (S/M/L sizes), in-app GitHub updates, full-width message detail (current) |
| v2.3.0 | Real-time widget, Markdown bodies, SQLite storage + cloud sync |
| v2.2 | Sync hardening, storage screen (see `archive/apk/`) |
| v2.1 / v2.0 | Widget + sync iterations (see `archive/apk/`) |
| DB Alert v1–v2 | Predecessor app (see `archive/`) |
| Notice Tracker v1.0 | Original iteration (see `archive/`) |
