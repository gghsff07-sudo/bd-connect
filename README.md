# DB Monitor — WhatsApp-style database monitor (Flutter / Android)

DB Monitor watches your database (Firebase Realtime Database or any REST API)
and delivers new records like chat messages: local-first SQLite storage,
WhatsApp-style cloud sync, Markdown message bodies, a real-time home-screen
widget, and styled notifications with a full permission flow — all in the warm
**Soft Day** theme (cream `#F0EAE2`, terracotta `#C0684F`, charcoal `#2E2A26`).

**Latest release: v2.6.0 (versionCode 8)** — install
`db-monitor-v2.6.0.apk` from the [v2.6.0 release](../../releases/tag/v2.6.0)
(Android 5.0+). The APK is built and attached automatically by GitHub Actions.

## Install

1. Download `db-monitor-v2.6.0.apk` from the
   [v2.6.0 release](../../releases/tag/v2.6.0) and copy it to your Android
   phone (Android 5.0+).
2. Tap it and allow "install from unknown sources" when asked. Installing over
   v2.4/v2.3/v2.2/v2.1 works directly (same signature, higher versionCode 8).
3. On first launch the app asks for **notification permission** — allow it so
   database alerts can reach you (Android 13+).
4. From v2.4 onward you never need to sideload again: **Settings → App
   updates → Check** looks up the latest GitHub release, downloads the APK
   and the system installer finishes the job.

## What's new in v2.6

- **Notices group by their original posted date** — TECMIS notices sit under
  the day the university actually posted them (read from the notice's
  "Posted:" line or the upload stamp in the id), not the day the scraper
  synced them. Non-TECMIS messages keep using their creation time.
- **New `tecmis` message type** — notices synced from
  [logging-into-TECMIS](https://github.com/dev-sandakelum/logging-into-TECMIS)
  keep their type, get their own colour, notification channel and the
  TECMIS logo on the card, list and detail views.
- **Countdown ring size is really variable now** — the S/M/L picker applies
  to the in-app card AND the home-screen widget, plus a **Hidden** option
  that swaps the ring for a compact time pill (in-app) / "next sync MM:SS"
  line (widget).
- **Widget reliability fix** — the update push called the provider by the
  wrong name (`DbMonitorWidget` vs `SoftDayWidgetProvider`), so changes
  only applied while the app process lived. Fixed; the widget now also
  honours a custom sync interval.
- **Full-width message cards** — bubbles stretch across the list (no more
  right-oriented chat look), with left-aligned titles and previews.
- **Personalisation settings, grouped into tabs** — Personalise (ring size,
  sync interval 5/15/30/60 min, bubble density, 12/24-hour clock), Sync &
  Alerts (per-type notification switches, TECMIS cleanup cadence), Storage
  & Updates, and Cloud.

## What's new in v2.5

- **TECMIS deletion endpoints are now used by the app** — deleting a TECMIS
  notice in the chat (long-press → Delete everywhere) calls the backend's
  dedicated `DELETE /api/tecmis-delete?id=…` (with a fallback to
  `DELETE /api/items/<id>`). Requires the
  [db-monitor-api](https://github.com/dev-sandakelum/db-monitor-api) with the
  TECMIS endpoints deployed.
- **Daily cloud cleanup (`tecmis-delete-old`)** — once a day, after a
  successful pull, the app sends the ids it still holds to
  `DELETE /api/tecmis-delete-old`, removing cloud copies of notices whose
  deletes previously failed. Safety rules: it never runs when the local list
  is empty or unreadable, so a fresh install or a cleared database can never
  wipe the cloud.
- **Authenticated writes** — the configured URL's query string (e.g.
  `?key=<API_TOKEN>`) is now kept on every PUT/DELETE request. Previously
  push and delete went out without it (and delete additionally hit a wrong
  URL), so on the db-monitor-api they always failed with 401.
- **Ids with spaces work** — item ids are percent-encoded in request URLs,
  so records like `tecmis-file-…-ICT - Exam Timetable.pdf` can now be pushed
  and deleted.
- **Install fix** — the APK is built again with the exact v2.3 toolchain
  (Flutter 3.24.5, AGP 8.1, minSdk 21, v1+v2 signatures), fixing the
  "package invalid" rejection on Android 5/6 devices.

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

Requirements: Flutter 3.24.5 (the toolchain the shipped APKs are built with),
Dart 3.5, Android SDK 34, JDK 17.

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

## Repository layout

```
app/        Flutter project (v2.6.0) — lib/, android/, assets/, test/
scripts/    make_logo.py (logo/icon generator), setup_keystore.py
signing/    release keystore + key.properties + instructions  ⚠ see SIGNING.md
```

Earlier versions and predecessor apps (DB Alert, Notice Tracker) live in
the project history before the cleanup.

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

   With the [db-monitor-api](https://github.com/dev-sandakelum/db-monitor-api)
   backend, put the API key straight into the URL:
   `https://<project>.vercel.app/api/items?key=<API_TOKEN>`. The key is kept
   on every request (pull / push / delete), and TECMIS notices additionally
   use the backend's `tecmis-delete` / `tecmis-delete-old` endpoints
   (see “What's new in v2.5”).

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

- Flutter 3.24.5, Dart 3.5, minSdk 21 (Android 5.0+), targetSdk 34, package
  `com.dbmonitor.db_monitor`, versionName 2.6.0, versionCode 8, signed with
  v1+v2 schemes (minSdk 21 keeps v1 so older devices accept the APK)
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
| v2.5.0 | TECMIS deletion endpoints, authenticated writes, percent-encoded ids, install fix (v2.3 toolchain) |
| v2.6.0 | Original-date grouping, TECMIS type + logo, variable ring sizes with hide option, widget fixes, full-width cards, grouped Settings tabs (current) |
| v2.4.0 | Compact side countdown (S/M/L sizes), in-app GitHub updates, full-width message detail |
| v2.3.0 | Real-time widget, Markdown bodies, SQLite storage + cloud sync |
| v2.2 | Sync hardening, storage screen |
| v2.1 / v2.0 | Widget + sync iterations |
| DB Alert v1–v2 | Predecessor app |
| Notice Tracker v1.0 | Original iteration |
