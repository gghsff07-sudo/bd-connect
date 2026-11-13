# Release signing — DB Monitor

⚠️ **This folder contains the real release keystore and its passwords.**
Anyone with these files can sign updates that install over the installed app.
Keep the repo private if that matters to you — or move these files somewhere
safe and remove them from the repo.

## Files

- `dbmonitor.keystore` — release keystore (PKCS12, alias `dbmonitor`,
  validity 10000 days)
- `key.properties` — passwords + alias, as consumed by
  `app/android/app/build.gradle` (`signingConfigs.release`)
- `keystore-info.txt` — copy of the credentials + certificate fingerprints

Passwords are also documented in `keystore-info.txt` (they were generated for
this project; treat them as public now that they are in a repo).

## Building a signed release identical to the shipped APK

1. Copy the two files into the Android module:

   ```bash
   cp signing/dbmonitor.keystore app/android/app/
   cp signing/key.properties    app/android/
   ```

2. Build:

   ```bash
   cd app
   flutter pub get
   flutter build apk --release
   ```

The output `build/app/outputs/flutter-apk/app-release.apk` is signed with the
same key as `releases/db-monitor-v2.3.apk` (signer SHA-256
`bc90d1e17e1c6b498fae97b5262259ae69cb4d9021faebbbc3b0ab39490526c4`), so it
installs directly over v2.1/v2.2/v2.3.

## Generating a NEW key (if you want your own)

```bash
keytool -genkey -v -keystore new-release.keystore -alias dbmonitor \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then update `key.properties` and rebuild. Note: an app signed with a new key
cannot be installed over an existing installation signed with the old key.

## Verify a signature

```bash
keytool -printcert -jarfile releases/db-monitor-v2.3.apk
```
