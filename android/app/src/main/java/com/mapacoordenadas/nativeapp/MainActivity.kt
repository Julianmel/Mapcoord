package com.mapacoordenadas.nativeapp

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import android.provider.MediaStore
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private val permissionRequestCode = 721
    private val appUrl = "https://julianmel.github.io/Mapcoord/"
    private val fallbackAppUrl = "https://mapacoordenadas.manus.space"
    private var pendingIntervalSeconds: Int? = null
    private var pendingStationaryWaitSeconds: Int? = null
    private var triedFallbackUrl = false

    private val serviceStoppedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            runOnUiThread {
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('native-location-stopped'))", null)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    // A captura manual/permanência usa navigator.geolocation no WebView;
                    // solicite a permissão do Android antes do primeiro toque do usuário.
                    if (!hasForegroundLocationPermission()) ensureLocationPermissions()
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    super.onReceivedError(view, request, error)
                    if (!request.isForMainFrame) return
                    if (!triedFallbackUrl && request.url.toString().startsWith(appUrl)) {
                        triedFallbackUrl = true
                        view.loadUrl(fallbackAppUrl)
                    } else {
                        view.loadDataWithBaseURL(
                            appUrl,
                            "<html><body style='font-family:sans-serif;padding:24px'><h2>Sem conexão</h2><p>Não foi possível carregar o Mapa de Coordenadas. Verifique a internet e toque em tentar novamente.</p><button onclick=\"location.reload()\">Tentar novamente</button></body></html>",
                            "text/html",
                            "UTF-8",
                            null,
                        )
                    }
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String,
                    callback: android.webkit.GeolocationPermissions.Callback,
                ) {
                    // A permissão de localização do Android já é solicitada pela Activity;
                    // o WebView também precisa receber autorização explícita para navigator.geolocation.
                    callback.invoke(origin, true, false)
                }
            }
            addJavascriptInterface(NativeGpsBridge(), "AndroidGps")
        }
        setContentView(webView)
        webView.loadUrl(appUrl)

        val filter = IntentFilter(LocationForegroundService.ACTION_SERVICE_STOPPED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(serviceStoppedReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(serviceStoppedReceiver, filter)
        }
    }

    /** Foreground permission is requested in-app. Background permission is enabled from App Info on Android 11+. */
    private fun ensureLocationPermissions(): Boolean {
        val foregroundGranted = hasForegroundLocationPermission()
        if (!foregroundGranted) {
            val permissions = mutableListOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            ActivityCompat.requestPermissions(this, permissions.toTypedArray(), permissionRequestCode)
            return false
        }
        return true
    }

    private fun hasForegroundLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun hasBackgroundLocationPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun startNativeService(intervalSeconds: Int, stationaryWaitSeconds: Int? = null) {
        val intent = Intent(this, LocationForegroundService::class.java).apply {
            action = LocationForegroundService.ACTION_START
            putExtra(LocationForegroundService.EXTRA_INTERVAL_MS, intervalSeconds.coerceAtLeast(1) * 1000L)
            if (stationaryWaitSeconds != null) {
                putExtra(LocationForegroundService.EXTRA_STATIONARY_WAIT_SECONDS, stationaryWaitSeconds.coerceAtLeast(5))
            }
        }
        ContextCompat.startForegroundService(this, intent)
    }

    private fun startPendingServiceIfReady() {
        val interval = pendingIntervalSeconds ?: return
        if (!hasForegroundLocationPermission()) return
        val stationaryWait = pendingStationaryWaitSeconds
        pendingIntervalSeconds = null
        pendingStationaryWaitSeconds = null
        startNativeService(interval, stationaryWait)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasBackgroundLocationPermission()) {
            Toast.makeText(this, "Ative 'Permitir o tempo todo' para manter o GPS em background.", Toast.LENGTH_LONG).show()
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('native-location-background-permission-needed'))", null)
        }
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('native-location-active'))", null)
    }

    private fun openBackgroundLocationSettingsPage() {
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:$packageName")
        })
    }

    private inner class NativeGpsBridge {
        @JavascriptInterface
        fun start(intervalSeconds: Int) {
            runOnUiThread {
                pendingStationaryWaitSeconds = null
                pendingIntervalSeconds = intervalSeconds.coerceAtLeast(1)
                if (ensureLocationPermissions()) startPendingServiceIfReady()
            }
        }

        @JavascriptInterface
        fun startStationary(waitSeconds: Int) {
            runOnUiThread {
                pendingStationaryWaitSeconds = waitSeconds.coerceAtLeast(5)
                pendingIntervalSeconds = 1
                if (ensureLocationPermissions()) startPendingServiceIfReady()
            }
        }

        @JavascriptInterface
        fun stop() {
            runOnUiThread {
                val intent = Intent(this@MainActivity, LocationForegroundService::class.java)
                    .setAction(LocationForegroundService.ACTION_STOP)
                startService(intent)
                try {
                    val manager = getSystemService(android.app.NotificationManager::class.java)
                    manager?.cancel(LocationForegroundService.NOTIFICATION_ID)
                } catch (_: Exception) {}
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('native-location-stopped'))", null)
            }
        }

        @JavascriptInterface
        fun getPendingLocations(): String {
            val prefs = getSharedPreferences(LocationForegroundService.PREFS_NAME, MODE_PRIVATE)
            return prefs.getString(LocationForegroundService.KEY_PENDING, "[]") ?: "[]"
        }

        @JavascriptInterface
        fun clearPendingLocations() {
            getSharedPreferences(LocationForegroundService.PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(LocationForegroundService.KEY_PENDING, JSONArray().toString())
                .putInt(LocationForegroundService.KEY_PENDING_COUNT, 0)
                .remove(LocationForegroundService.KEY_LAST_LATITUDE)
                .remove(LocationForegroundService.KEY_LAST_LONGITUDE)
                .remove(LocationForegroundService.KEY_LAST_GPS_TIME)
                .remove(LocationForegroundService.KEY_LAST_LOCATION_TIME)
                .remove(LocationForegroundService.KEY_LAST_SEGMENT_DISTANCE_METERS)
                .remove(LocationForegroundService.KEY_ELAPSED_SINCE_PREVIOUS_SECONDS)
                .remove(LocationForegroundService.KEY_INSTANT_SPEED_KMH)
                .apply()
        }

        @JavascriptInterface
        fun saveTextFile(filename: String, content: String): Boolean {
            return try {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, filename)
                    put(MediaStore.Downloads.MIME_TYPE, "text/plain")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: return false
                contentResolver.openOutputStream(uri).use { output ->
                    output ?: return false
                    output.write(content.toByteArray(Charsets.UTF_8))
                    output.flush()
                }
                val completed = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
                contentResolver.update(uri, completed, null, null)
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun openBackgroundLocationSettings() = runOnUiThread { openBackgroundLocationSettingsPage() }

        @JavascriptInterface
        fun getStatus(): String {
            val prefs = getSharedPreferences(LocationForegroundService.PREFS_NAME, MODE_PRIVATE)
            return "{\"running\":${prefs.getBoolean(LocationForegroundService.KEY_RUNNING, false)},\"error\":${JSONObjectEscaper.quote(prefs.getString(LocationForegroundService.KEY_ERROR, "") ?: "")},\"lastTimestamp\":${JSONObjectEscaper.quote(prefs.getString(LocationForegroundService.KEY_LAST_TIMESTAMP, "") ?: "")}}"
        }

        @JavascriptInterface
        fun isAvailable(): Boolean = true

        @JavascriptInterface
        fun getDiagnostics(): String {
            val prefs = getSharedPreferences(LocationForegroundService.PREFS_NAME, MODE_PRIVATE)
            val running = prefs.getBoolean(LocationForegroundService.KEY_RUNNING, false)
            val error = prefs.getString(LocationForegroundService.KEY_ERROR, "") ?: ""
            val lastTimestamp = prefs.getString(LocationForegroundService.KEY_LAST_TIMESTAMP, "") ?: ""
            val lastLatitude = prefs.getString(LocationForegroundService.KEY_LAST_LATITUDE, "") ?: ""
            val lastLongitude = prefs.getString(LocationForegroundService.KEY_LAST_LONGITUDE, "") ?: ""
            val mode = if (prefs.getInt(LocationForegroundService.KEY_STATIONARY_WAIT_SECONDS, 0) > 0) "stationary" else "interval"
            return org.json.JSONObject().apply {
                put("bridge", true)
                put("foregroundLocation", hasForegroundLocationPermission())
                put("backgroundLocation", hasBackgroundLocationPermission())
                put("notifications", NotificationManagerCompat.from(this@MainActivity).areNotificationsEnabled())
                put("service", if (running) "active" else if (error.isNotBlank()) "error" else "stopped")
                put("mode", mode)
                put("error", error)
                put("lastTimestamp", lastTimestamp)
                put("lastLatitude", lastLatitude)
                put("lastLongitude", lastLongitude)
                put("pendingCount", prefs.getInt(LocationForegroundService.KEY_PENDING_COUNT, 0))
                put("intervalSeconds", prefs.getInt(LocationForegroundService.KEY_INTERVAL_SECONDS, 0))
                put("stationaryWaitSeconds", prefs.getInt(LocationForegroundService.KEY_STATIONARY_WAIT_SECONDS, 0))
                val instantSpeed = prefs.getFloat(LocationForegroundService.KEY_INSTANT_SPEED_KMH, Float.NaN)
                val lastSegmentDistance = prefs.getFloat(LocationForegroundService.KEY_LAST_SEGMENT_DISTANCE_METERS, Float.NaN)
                val elapsedSincePrevious = prefs.getFloat(LocationForegroundService.KEY_ELAPSED_SINCE_PREVIOUS_SECONDS, Float.NaN)
                put("instantSpeedKmh", if (instantSpeed.isFinite()) instantSpeed.toDouble() else JSONObject.NULL)
                put("lastSegmentDistanceMeters", if (lastSegmentDistance.isFinite()) lastSegmentDistance.toDouble() else JSONObject.NULL)
                put("elapsedSincePreviousSeconds", if (elapsedSincePrevious.isFinite()) elapsedSincePrevious.toDouble() else JSONObject.NULL)
                put("stationaryElapsedSeconds", prefs.getLong(LocationForegroundService.KEY_STATIONARY_ELAPSED_SECONDS, 0L))
            }.toString()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != permissionRequestCode) return
        if (hasForegroundLocationPermission()) {
            startPendingServiceIfReady()
        } else {
            Toast.makeText(this, "Permissão de localização negada; a captura não foi iniciada.", Toast.LENGTH_LONG).show()
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('native-location-error'))", null)
        }
    }

    override fun onResume() {
        super.onResume()
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('native-location-resumed'))", null)
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(serviceStoppedReceiver)
        } catch (_: Exception) {}
        webView.removeJavascriptInterface("AndroidGps")
        webView.destroy()
        super.onDestroy()
    }

    private object JSONObjectEscaper {
        fun quote(value: String): String = org.json.JSONObject.quote(value)
    }
}
