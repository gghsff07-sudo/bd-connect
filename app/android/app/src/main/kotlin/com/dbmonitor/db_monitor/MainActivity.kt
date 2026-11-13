package com.dbmonitor.db_monitor

import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Build
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {
    private val channelName = "db_monitor/update"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "appVersion" -> result.success(BuildConfig.VERSION_NAME)
                    "cacheDir" -> result.success(cacheDir.absolutePath)
                    "installApk" -> {
                        val path = call.argument<String>("path")
                        if (path == null) {
                            result.error("NO_PATH", "path is required", null)
                            return@setMethodCallHandler
                        }
                        try {
                            installApk(File(path))
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("INSTALL_FAILED", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    /**
     * Hands the downloaded APK to the system package installer through a
     * FileProvider URI. Android 11+ uses ACTION_INSTALL_PACKAGE; older
     * versions use the classic ACTION_VIEW intent with the APK mime type.
     * Both need FLAG_GRANT_READ_URI_PERMISSION so the installer (a
     * different process) may read our cache file.
     */
    private fun installApk(file: File) {
        if (!file.name.endsWith(".apk")) {
            throw IllegalArgumentException("not an apk: ${file.name}")
        }
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent(Intent.ACTION_INSTALL_PACKAGE, uri).apply {
                putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } else {
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            // Some ROMs don't resolve ACTION_INSTALL_PACKAGE; fall back to
            // the classic VIEW intent on any API level.
            val fallback = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(fallback)
        }
    }
}
