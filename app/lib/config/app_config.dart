/// Optional compile-time configuration. NEVER required: the app must start
/// and work with all of these empty (local/preview mode). Users can also set
/// values at runtime in Settings.
class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const String firebaseDbUrl = String.fromEnvironment('FIREBASE_DB_URL');

  static bool get hasApiConfig => apiBaseUrl.isNotEmpty;
  static bool get hasFirebaseConfig => firebaseDbUrl.isNotEmpty;

  static List<String> get missingKeys {
    final missing = <String>[];
    if (!hasApiConfig) missing.add('API_BASE_URL');
    if (!hasFirebaseConfig) missing.add('FIREBASE_DB_URL');
    return missing;
  }
}
