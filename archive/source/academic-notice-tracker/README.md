# Notice Tracker

A personal Android app that shows university notices (exam registration,
semester registration, submissions, results) as live items with a status and
a deadline, and alerts you before deadlines. Exactly one user: **the owner**.

This is the **mobile app only**. The backend (pollers, LLM extraction, push
sending) is a separate project. The app is a thin client: it reads notices
from Firestore and writes only its own state and settings. It never calls
Moodle, Gmail, Outlook, TECMIS or any LLM, and it contains **no secrets**.

Built with Expo (development build, not Expo Go) + React Native + TypeScript
(strict mode). English UI. Free tiers only (Firebase Spark, EAS free plan).
Works offline via Firestore's local cache. Light/dark theme follows the
system setting.

---

## How it fits together

```
 Pollers (Azure VM)                       This app (Android)
 ──────────────────                       ─────────────────
 Moodle/Gmail/Outlook/TECMIS              Firestore live listeners (read-only)
        │                                        notices/  sources/
        ▼                                        ▼
 Groq LLM extraction  ──►  Firestore  ◄──  users/{uid}/state|settings|devices
        │                   (Admin SDK)         ▲ (read + write, owner only)
        ▼                                        │
 FCM push  ──────────────►  notifee channels + deep link to /notice/{id}
```

- **Read-only**: `notices/{dedupeKey}`, `sources/{name}`.
- **Read/write (owner only)**: `users/{uid}/state/{noticeId}`,
  `users/{uid}/settings/prefs`, `users/{uid}/devices/{token}`.
- Security rules in [`firestore.rules`](./firestore.rules) deny the app every
  write to `notices` and `sources`.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Expo SDK 58 (development build) + React Native 0.88 + TypeScript strict |
| Navigation | Expo Router (file-based), scheme `notices://` |
| Firebase | React Native Firebase v27 (app, auth, firestore, messaging) |
| Sign-in | @react-native-google-signin/google-signin → Firebase credential |
| Notifications | @notifee/react-native (channels `notices` + `reminders`) |
| State | Zustand (UI + cached data); Firestore live listeners feed the store |
| Lists | @shopify/flash-list |
| Dates | date-fns v4 (display in the device's local time zone) |
| Network | @react-native-community/netinfo (offline banner) |
| Tests | Jest (jest-expo) + React Native Testing Library |
| Lint/format | ESLint (eslint-config-expo) + Prettier |

## Project structure

```
app/
  _layout.tsx            auth gate, theme, data/notification lifecycle, banners
  sign-in.tsx            Google sign-in + not-allowed / retry states
  (tabs)/_layout.tsx     bottom tabs
  (tabs)/index.tsx       Home (Open / Closing soon / Closed, search, banners)
  (tabs)/done.tsx        Done list with Undo
  (tabs)/settings.tsx    reminders, quiet hours, muted types, sources, account
  notice/[id].tsx        notice detail + actions
src/
  features/notices/      selectors, hooks, NoticeCard, StatusBadge, TypeChip,
                         SkeletonCard, EmptyState
  features/settings/     usePrefs, settings components
  services/              firebase, auth, dataSync, notifications, calendar
  store/                 auth.ts, data.ts, ui.ts (Zustand)
  theme/                 tokens.ts (slate + teal, light/dark), theme.tsx
  components/            AppButton, InlineBanner, SegmentedControl, SwitchRow
  utils/                 types, date, deeplink, env, logger
plugins/                 with-allow-backup.js (allowBackup=false)
__tests__/               selectors, date, deeplink, prefs, components
firestore.rules          deploy these rules
```

---

## Setup

### 1. Prerequisites

- Node.js LTS (20+) and npm
- A physical Android device with USB debugging enabled
  (Settings → About → tap Build number 7× → Developer options → USB debugging)
- For local builds: Android Studio + SDK + JDK 17 (skip if you only use EAS)
- A free [Firebase](https://console.firebase.google.com) project on the
  **Spark plan**

### 2. Firebase project

1. Create a project (e.g. `notice-tracker`) on the Spark plan.
2. **Firestore**: create the database. Start in *production mode* (locked),
   then deploy the rules from this repo (step 3).
3. **Authentication** → Sign-in method → enable **Google**
   (set a support email). Expand *Web SDK configuration* and copy the
   **Web client ID** — you need it for `.env`.
4. **Project settings → Your apps → Android app**:
   - Package name: `com.noticetracker.app`
   - App nickname: Notice Tracker
   - Download `google-services.json` and place it in the project root
     (see [`google-services.example.json`](./google-services.example.json)
     for the expected shape). It is gitignored — never commit it.
5. **SHA-1 fingerprints** (Project settings → Your apps → the Android app →
   Add fingerprint). Google Sign-In refuses to work without them:
   - **Local/debug builds**: run the app once via `npx expo run:android`
     (or `cd android && ./gradlew signingReport` after prebuild) and copy the
     debug keystore SHA-1 from the output.
   - **EAS builds**: run `eas credentials -p android` and copy the SHA-1 of
     the EAS-managed upload keystore.
   Add both if you use both paths.
6. Deploy the security rules: install the Firebase CLI
   (`npm i -g firebase-tools`), then
   ```bash
   firebase login
   firebase init firestore   # choose the project, keep rules path firestore.rules
   firebase deploy --only firestore:rules
   ```
   **Important:** replace `OWNER_EMAIL` in `firestore.rules` with your Google
   account email before deploying, and use the same value in `.env` below.

### 3. App configuration

```bash
cp .env.example .env
```

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_OWNER_EMAIL` | Your Google account email (same as `OWNER_EMAIL` in the rules) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Web client ID from Firebase Auth → Google → Web SDK configuration |

These are inlined into the JS bundle at build time — they must be present
whenever you run `expo start` or build. They are not secrets.

### 4. Install and run on your device

```bash
npm install
npx expo run:android
```

The first run generates the `android/` folder (prebuild), compiles the native
app and installs it. Leave the terminal running for the Metro dev server, or
press `q` and reopen the installed app for a standalone dev build.

Day-to-day: `npm start` then press `a`, or `npm run android`.

### 5. Sign in and verify the gate

Sign in with your owner account. To test the gate, sign in with any other
Google account: the app shows **"This account isn't allowed"** with a sign-out
button (the client-side email check plus the Firestore probe both enforce it).
The session persists across restarts.

---

## Testing the app

```bash
npm test          # Jest suite (selectors, dates, deep links, components)
npm run typecheck # tsc --noEmit (strict)
npm run lint      # ESLint
```

All three are green as delivered (58 tests).

### Manual acceptance checks

From the build plan, quick pointers for each acceptance item:

- **Live updates**: add/edit a `notices` document in the Firebase console —
  it appears within seconds, no refresh (live `onSnapshot` listeners).
- **Done/snooze/pin survive restarts**: written to
  `users/{uid}/state/{noticeId}` with merge; visible in the Firestore console.
- **Null deadline / missing fields**: the mapping code (`mapNotice`) is
  defensive; unit tests cover both cases.
- **needsVerify**: shows the *Verify* badge on cards and the warning banner on
  the detail screen.
- **Airplane mode**: cached notices render with the offline banner; state
  changes queue locally and sync when back online.
- **Stale sync**: the Home header banner appears when the newest
  `sources.lastPolledAt` is older than 2 hours, or when any source has
  `ok: false`.
- **Prefs**: changing reminder chips/quiet hours updates
  `users/{uid}/settings/prefs` in the console.
- **Rules**: the app never writes to `notices`/`sources` (rules deny it).

### Testing push notifications

Send a test from the Firebase console (Grow → Cloud Messaging → new campaign):

- **Notification title/body**: e.g. "New notice" / "Exam registration opens"
- **Custom data** (all required for deep linking):
  - `kind` = `new` (or `status_change` / `deadline_change` / `reminder`)
  - `noticeId` = the document id of an existing notice

Verify the tap opens `notice/{noticeId}` from **killed**, **background** and
**foreground** app states. In the foreground you should also see the in-app
banner plus a heads-up notification on the correct channel.

Two channels exist: `notices` (new notices, status/deadline changes) and
`reminders` (deadline reminders). While the app is backgrounded/killed,
Android auto-displays FCM *notification* payloads, so **the backend should set
`android.channel_id: "notices" | "reminders"`** in its FCM requests to route
them correctly. Data-only messages are displayed by the app itself with the
right channel.

Quiet hours are enforced **by the backend**; the app only edits the setting.

---

## Building the release APK

### Option A — EAS Build (free plan, no Android SDK needed)

```bash
npm i -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

`eas.json` ships with `development`, `preview` and `production` profiles, all
producing APKs (not AABs) so they can be sideloaded directly. Download the
APK from the EAS dashboard, transfer it to your phone (or
`adb install app.apk`) and open it to install.

Remember to add the EAS keystore SHA-1 to the Firebase Android app (step 2.5)
or Google Sign-In will fail with `DEVELOPER_ERROR` on release builds.

### Option B — local Gradle build

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease   # APK at android/app/build/outputs/apk/release/
```

#### About the pre-built APK delivered with this project

`NoticeTracker-v1.0.0-android-release.apk` was produced locally with this path
so you can install and explore the UI immediately. Know what is baked into it:

- **Placeholder Firebase config.** It was built with a structurally valid but
  fake `google-services.json` and `.env` placeholders
  (`EXPO_PUBLIC_OWNER_EMAIL=owner@example.com`). It will install and launch,
  but **Google Sign-In cannot succeed** until you rebuild with your real
  config (steps below). Use it to check layout, theming and offline states.
- **arm64-v8a only** (`reactNativeArchitectures=arm64-v8a`), which covers any
  modern phone. To ship all four ABIs, restore
  `reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64` in
  `android/gradle.properties`.
- **R8 minification disabled** (`android.enableMinifyInReleaseBuilds=false`)
  because the build machine had only 4 GB RAM. On a normal dev machine keep
  it enabled for a smaller APK.
- Signed with the dedicated release keystore in `NoticeTracker-signing/`
  (details below).

#### Release signing

The `NoticeTracker-signing/` folder shipped next to this repo contains
`notice-tracker-release.keystore` plus its credentials. Every future APK must
be signed with this same keystore, or Android will refuse to install it as an
update over the existing app.

Certificate fingerprints (also add these to your Firebase Android app, next
to the debug SHA-1 from step 2.5, or Google Sign-In fails with
`DEVELOPER_ERROR` on release builds):

| Fingerprint | Value |
| --- | --- |
| SHA-1 | `36be59df0249de4c4f41c2a9f74fa42e7b67dff9` |
| SHA-256 | `2d3e56e0ae15660525a13722c44d09a6687ed1fa7f2d570c652e7c5e4d000818` |

To wire the keystore into a fresh prebuild, copy it to
`android/app/notice-tracker-release.keystore` and append to
`android/gradle.properties`:

```properties
NOTICE_TRACKER_RELEASE_STORE_FILE=notice-tracker-release.keystore
NOTICE_TRACKER_RELEASE_KEY_ALIAS=notice-tracker
NOTICE_TRACKER_RELEASE_STORE_PASSWORD=<from NoticeTracker-signing/SIGNING.txt>
NOTICE_TRACKER_RELEASE_KEY_PASSWORD=<from NoticeTracker-signing/SIGNING.txt>
```

A fresh `expo prebuild` generates an `android/app/build.gradle` whose release
build signs with the debug keystore. Replace its `signingConfigs { … }` and
the release `signingConfig` line with the block below so release builds use
your keystore (it falls back to the debug keystore when the properties are
absent, so debug builds keep working):

```groovy
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
    release {
        def releaseStoreFile = project.findProperty('NOTICE_TRACKER_RELEASE_STORE_FILE')
        if (releaseStoreFile != null) {
            storeFile file(releaseStoreFile)
            storePassword project.findProperty('NOTICE_TRACKER_RELEASE_STORE_PASSWORD')
            keyAlias project.findProperty('NOTICE_TRACKER_RELEASE_KEY_ALIAS')
            keyPassword project.findProperty('NOTICE_TRACKER_RELEASE_KEY_PASSWORD')
        }
    }
}
// … inside buildTypes.release:
//     signingConfig project.hasProperty('NOTICE_TRACKER_RELEASE_STORE_FILE') ? signingConfigs.release : signingConfigs.debug
```

#### Known issue: Kotlin metadata mismatch (RNFB + Firebase BOM 35)

`@react-native-firebase` v27.1.1 defaults to Firebase BOM 35.0.2, whose
artifacts are compiled with Kotlin 2.4 metadata, while React Native 0.88
builds with Kotlin 2.2.0. The RNFB modules then fail with
"Module was compiled with an incompatible version of Kotlin". The build that
produced the delivered APK fixed this by adding to the `allprojects` block of
the root `android/build.gradle`:

```groovy
tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
  it.compilerOptions.freeCompilerArgs.add("-Xskip-metadata-version-check")
}
```

Re-apply this after `expo prebuild` if your build hits the same error (or
pin an older `firebase.bom` version in `android/gradle.properties`).

#### Rebuild with your real config

1. Put your **real** `google-services.json` at the project root (replacing
   the placeholder), and fill `.env` with your owner email and Web client ID.
2. Add both the debug SHA-1 (step 2.5) **and** the release SHA-1 above to the
   Firebase Android app.
3. `npx expo prebuild --platform android`, then apply the signing properties
   and (if needed) the Kotlin flag above.
4. `cd android && ./gradlew assembleRelease`.
5. Install: `adb install -r app/build/outputs/apk/release/app-release.apk`
   (or copy the APK to the phone and open it).

---

## Design decisions & assumptions

Documented interpretations where the build plan left room (or said to ask):

1. **Postponed/info notices appear on the Open tab** (owner decision). Open
   shows every non-closed status so nothing active is ever hidden. A notice
   can therefore appear on both Open and Closing soon — the tabs are views
   (status-based / deadline-based), not partitions.
2. **Closed tab follows the letter of the plan**: status `closed` OR deadline
   in the past; done/snooze do **not** filter it. Done is a separate archive
   view sorted by the state's `updatedAt`, newest first.
3. **Confidence labels**: Low < 0.7, Medium 0.7–0.89, High ≥ 0.9 (the plan
   only pinned the 0.7 Low threshold). Missing confidence shows "Unknown".
4. **Malformed documents are treated with caution**: a notice without
   `needsVerify` renders as needing verification; unknown `status`/`type`
   values map to `info`/`other`. Nothing crashes on missing fields.
5. **Reminder offsets may be emptied** — that simply disables reminder pushes
   (a valid preference).
6. **Muted types silence pushes only** (enforced by the backend); muted types
   still appear in the app's lists.
7. **The notices query orders by `updatedAt` desc, limit 200**, so the
   backend must always write `updatedAt` (documents missing the field would
   be skipped by Firestore's orderBy).
8. **Sign-in errors**: a cancelled Google picker returns to the sign-in
   screen; network failures during owner verification show a retry.
9. **iOS is out of scope** but the code stays cross-platform where free. For
   an iOS build, add the
   `@react-native-google-signin/google-signin` config plugin with your
   `iosUrlScheme` (`com.googleusercontent.apps.…`) plus
   `GoogleService-Info.plist` — on Android the React Native Firebase plugin
   already applies everything Google Sign-In needs.

## Security & privacy

- No secrets in the repo; `google-services.json`, `.env`, `android/`, `ios/`
  are gitignored. If you publish the repo, keep it that way.
- The app holds no university credentials — it only talks to your own
  Firebase project.
- Firestore rules pin every read/write to `OWNER_EMAIL` and the matching uid.
- No analytics, no crash-reporting SDK, logs go through a console-only
  logger wrapper.
- Android cloud backup of app data is disabled (`allowBackup=false` via
  `plugins/with-allow-backup.js`).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Google Sign-In fails with `DEVELOPER_ERROR` (10) | SHA-1 of the build's keystore is missing in Firebase → Project settings → Android app. Add debug **and** EAS SHA-1s. |
| `A network error has occurred` on sign-in | Wrong `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (use the *Web client* ID, not the Android one). |
| "This account isn't allowed" for the right account | `OWNER_EMAIL` in the deployed rules ≠ `EXPO_PUBLIC_OWNER_EMAIL` (case-sensitive in the rules; deploy rules again). |
| Sign-in screen flashes then goes back out | `google-services.json` missing or its `package_name` ≠ `com.noticetracker.app`. |
| Empty lists forever | Check the Firestore rules deployment and that `notices` documents exist and have `updatedAt`. |
| Pushes arrive but tapping doesn't navigate | The FCM message must include `noticeId` in **custom data** (console: "Custom data" section). |
| Build fails after adding a native package | `npx expo prebuild --platform android --clean` and rebuild. |
