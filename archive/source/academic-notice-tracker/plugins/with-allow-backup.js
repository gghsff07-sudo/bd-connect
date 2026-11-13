/**
 * Local Expo config plugin: disable Android full-data backups.
 *
 * Privacy requirement from the build plan: no cloud backup of app data
 * (the cached notices and the Firebase session stay on-device only).
 * expo-build-properties does not expose allowBackup, so we patch the
 * generated AndroidManifest.xml directly.
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const withAllowBackupDisabled = (config) => {
  return withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app.$['android:allowBackup'] = 'false';
    return config;
  });
};

module.exports = withAllowBackupDisabled;
