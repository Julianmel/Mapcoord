package com.mapacoordenadas.nativeapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.location.Location
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

class LocationForegroundService : Service() {
    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private val running = AtomicBoolean(false)
    private var intervalMs = DEFAULT_INTERVAL_MS
    private var stationaryWaitMs: Long? = null
    private var stationaryAnchor: Pair<Double, Double>? = null
    private var stationarySinceMs: Long? = null
    private var stationaryCaptured = false

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.locations.forEach { location ->
                    val waitMs = stationaryWaitMs
                    if (waitMs == null) {
                        storeLocation(location)
                    } else {
                        handleStationaryLocation(location, waitMs)
                    }
                }
            }
        }
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> stopTracking()
            ACTION_START, null -> {
                val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val requestedMs = intent?.getLongExtra(EXTRA_INTERVAL_MS, DEFAULT_INTERVAL_MS)
                    ?: (prefs.getInt(KEY_INTERVAL_SECONDS, 1).coerceAtLeast(1) * 1000L)
                val requestedStationaryWait = intent?.getIntExtra(EXTRA_STATIONARY_WAIT_SECONDS, 0)
                    ?: prefs.getInt(KEY_STATIONARY_WAIT_SECONDS, 0)
                startTracking(requestedMs.coerceAtLeast(1000L), requestedStationaryWait.takeIf { it >= 5 })
            }
        }
        return START_STICKY
    }

    private fun startTracking(requestedIntervalMs: Long, stationaryWaitSeconds: Int? = null) {
        intervalMs = requestedIntervalMs
        stationaryWaitMs = stationaryWaitSeconds?.coerceAtLeast(5)?.times(1000L)
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putInt(KEY_INTERVAL_SECONDS, (intervalMs / 1000L).toInt().coerceAtLeast(1))
            .putInt(KEY_STATIONARY_WAIT_SECONDS, stationaryWaitSeconds ?: 0)
            .apply()
        stationaryAnchor = null
        stationarySinceMs = null
        stationaryCaptured = false
        val wasRunning = running.getAndSet(true)
        writeStatus(running = true, error = "")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                buildNotification("Captura GPS ATIVA — aguardando posição"),
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            )
        } else {
            startForeground(NOTIFICATION_ID, buildNotification("Captura GPS ATIVA — aguardando posição"))
        }

        if (wasRunning) {
            fusedClient.removeLocationUpdates(locationCallback)
        }
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putInt(KEY_INTERVAL_SECONDS, (intervalMs / 1000L).toInt().coerceAtLeast(1))
            .apply()

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
            .setMinUpdateIntervalMillis(intervalMs)
            .setMaxUpdateDelayMillis(intervalMs)
            .setWaitForAccurateLocation(false)
            .build()

        try {
            fusedClient.requestLocationUpdates(request, locationCallback, mainLooper)
                .addOnSuccessListener {
                    // Tenta registrar imediatamente a última posição conhecida, sem esperar o próximo ciclo.
                    fusedClient.lastLocation.addOnSuccessListener { location ->
                        if (location != null && running.get()) {
                            storeLocation(location)
                        }
                    }
                }
                .addOnFailureListener { error ->
                    val message = error.message ?: "falha ao solicitar atualizações GPS"
                    writeStatus(running = false, error = message)
                    showStatusNotification("ERRO GPS — $message")
                    running.set(false)
                    stopSelf()
                }
        } catch (error: SecurityException) {
            writeStatus(running = false, error = "Permissão de localização ausente")
            showStatusNotification("ERRO — permita a localização para iniciar")
            running.set(false)
            stopSelf()
        }
    }

    private fun stopTracking() {
        if (running.getAndSet(false)) fusedClient.removeLocationUpdates(locationCallback)
        writeStatus(running = false, error = "")
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putInt(KEY_STATIONARY_WAIT_SECONDS, 0)
            .apply()
        stationaryWaitMs = null
        stationaryAnchor = null
        stationarySinceMs = null
        stationaryCaptured = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

        private fun storeLocation(location: Location) {
        val latitude = location.latitude
        val longitude = location.longitude
        val accuracy = location.accuracy
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val previousLatitude = prefs.getString(KEY_LAST_LATITUDE, "")?.toDoubleOrNull()
        val previousLongitude = prefs.getString(KEY_LAST_LONGITUDE, "")?.toDoubleOrNull()
        val previousGpsTime = prefs.getLong(KEY_LAST_GPS_TIME, 0L)
        val currentGpsTime = location.time.takeIf { it > 0L } ?: System.currentTimeMillis()
        val elapsedSeconds = if (previousGpsTime > 0L && currentGpsTime > previousGpsTime) (currentGpsTime - previousGpsTime) / 1000.0 else Double.NaN
        val segmentDistance = if (previousLatitude != null && previousLongitude != null) distanceMeters(previousLatitude, previousLongitude, latitude, longitude) else 0.0
        val segmentSpeedKmh = if (elapsedSeconds.isFinite() && elapsedSeconds > 0.0) segmentDistance / elapsedSeconds * 3.6 else 0.0
        val stationaryMode = stationaryWaitMs != null
        val stationaryElapsedSeconds = stationarySinceMs?.let { ((System.currentTimeMillis() - it) / 1000.0).coerceAtLeast(0.0) } ?: 0.0
        val stationaryAnchorDistance = stationaryAnchor?.let { distanceMeters(it.first, it.second, latitude, longitude) } ?: 0.0
        val stationaryDerivedSpeedKmh = if (stationaryElapsedSeconds > 0.0) stationaryAnchorDistance / stationaryElapsedSeconds * 3.6 else 0.0
        val instantSpeedKmh = if (location.hasSpeed()) location.speed.toDouble() * 3.6 else if (stationaryMode) stationaryDerivedSpeedKmh else segmentSpeedKmh
        if (stationaryMode && instantSpeedKmh > MAX_STATIONARY_SPEED_KMH) {
            updateDiagnostics(location, segmentDistance, elapsedSeconds, instantSpeedKmh)
            return
        }
        if (accuracy > MAX_ACCEPTED_ACCURACY_METERS || instantSpeedKmh < 0.0 || instantSpeedKmh > MAX_ACCEPTED_SPEED_KMH || segmentSpeedKmh > MAX_ACCEPTED_SPEED_KMH || (segmentDistance > 500.0 && segmentSpeedKmh > 100.0)) {
            updateDiagnostics(location, segmentDistance, elapsedSeconds, instantSpeedKmh)
            showStatusNotification("ATIVA — ponto anômalo descartado")
            return
        }
        val current = try { JSONArray(prefs.getString(KEY_PENDING, "[]")) } catch (_: Exception) { JSONArray() }
        val timestamp = timestamp()
        val item = JSONObject().apply {
            put("latitude", latitude)
            put("longitude", longitude)
            put("accuracy", accuracy)
            put("speedKmh", instantSpeedKmh)
            if (location.hasBearing()) put("bearingDegrees", location.bearing.toDouble())
            if (location.hasAltitude()) put("altitudeMeters", location.altitude)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O && location.hasSpeedAccuracy()) {
                put("speedAccuracyKmh", (location.speedAccuracyMetersPerSecond * 3.6f).toDouble())
            }
            put("gpsTimeMs", location.time)
            put("timestamp", timestamp)
            put("intervalSeconds", prefs.getInt(KEY_INTERVAL_SECONDS, (DEFAULT_INTERVAL_MS / 1000L).toInt()))
            put("mode", if (stationaryWaitMs != null) "stationary" else "interval")
            put("waitSeconds", stationaryWaitMs?.div(1000L)?.toInt() ?: 0)
        }
        current.put(item)
        val bounded = JSONArray()
        val start = (current.length() - MAX_PENDING).coerceAtLeast(0)
        for (index in start until current.length()) bounded.put(current.getJSONObject(index))
        prefs.edit()
            .putString(KEY_PENDING, bounded.toString())
            .putString(KEY_LAST_TIMESTAMP, timestamp)
            .putString(KEY_LAST_LATITUDE, latitude.toString())
            .putString(KEY_LAST_LONGITUDE, longitude.toString())
            .putInt(KEY_PENDING_COUNT, bounded.length())
            .putLong(KEY_LAST_LOCATION_TIME, System.currentTimeMillis())
            .putLong(KEY_LAST_GPS_TIME, currentGpsTime)
            .putFloat(KEY_INSTANT_SPEED_KMH, instantSpeedKmh.toFloat())
            .putFloat(KEY_LAST_SEGMENT_DISTANCE_METERS, segmentDistance.toFloat())
            .putFloat(KEY_ELAPSED_SINCE_PREVIOUS_SECONDS, if (elapsedSeconds.isFinite()) elapsedSeconds.toFloat() else 0f)
            .putLong(KEY_STATIONARY_ELAPSED_SECONDS, 0L)
            .apply()
        showStatusNotification("ATIVA — último ponto $timestamp — ${bounded.length()} pendente(s)")
    }

    private fun handleStationaryLocation(location: Location, waitMs: Long) {
        val latitude = location.latitude
        val longitude = location.longitude
        val anchor = stationaryAnchor
        if (anchor == null) {
            stationaryAnchor = latitude to longitude
            stationarySinceMs = System.currentTimeMillis()
            stationaryCaptured = false
            showStatusNotification("ATIVA — observando pausas no movimento")
            return
        }

        val movedMeters = distanceMeters(anchor.first, anchor.second, latitude, longitude)
        val since = stationarySinceMs ?: System.currentTimeMillis().also { stationarySinceMs = it }
        val elapsed = System.currentTimeMillis() - since
        val elapsedSeconds = (elapsed / 1000L).coerceAtLeast(0L)
        val movementSpeedKmh = if (elapsed > 0L) movedMeters / (elapsed / 1000.0) * 3.6 else 0.0
        val measuredSpeedKmh = if (location.hasSpeed()) location.speed.toDouble() * 3.6 else movementSpeedKmh
        if (movedMeters > STATIONARY_MOVEMENT_THRESHOLD_METERS || measuredSpeedKmh > MAX_STATIONARY_SPEED_KMH) {
            stationaryAnchor = latitude to longitude
            stationarySinceMs = System.currentTimeMillis()
            stationaryCaptured = false
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putLong(KEY_STATIONARY_ELAPSED_SECONDS, 0L)
                .putFloat(KEY_INSTANT_SPEED_KMH, measuredSpeedKmh.toFloat())
                .apply()
            showStatusNotification("ATIVA — deslocamento detectado; contagem reiniciada")
            return
        }

        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putLong(KEY_STATIONARY_ELAPSED_SECONDS, elapsedSeconds)
            .putFloat(KEY_INSTANT_SPEED_KMH, measuredSpeedKmh.toFloat())
            .apply()
        if (elapsed >= waitMs && !stationaryCaptured) {
            storeLocation(location)
            stationaryCaptured = true
        } else {
            showStatusNotification("ATIVA — pausa ${elapsedSeconds}s/${waitMs / 1000L}s")
        }
    }

    private fun distanceMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val earthRadius = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2)
        return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    private fun updateDiagnostics(location: Location, segmentDistance: Double, elapsedSeconds: Double, instantSpeedKmh: Double) {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putFloat(KEY_INSTANT_SPEED_KMH, instantSpeedKmh.toFloat())
            .putFloat(KEY_LAST_SEGMENT_DISTANCE_METERS, segmentDistance.toFloat())
            .putFloat(KEY_ELAPSED_SINCE_PREVIOUS_SECONDS, if (elapsedSeconds.isFinite()) elapsedSeconds.toFloat() else 0f)
            .apply()
    }

    private fun writeStatus(running: Boolean, error: String) {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_RUNNING, running)
            .putString(KEY_ERROR, error)
            .apply()
    }

    private fun showStatusNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun timestamp(): String = SimpleDateFormat("yyyyMMddHHmmss", Locale.getDefault()).format(Date())

    private fun buildNotification(text: String): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stopIntent = PendingIntent.getService(
            this, 1, Intent(this, LocationForegroundService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Mapa de Coordenadas — ${if (running.get()) "ATIVO" else "PARADO"}")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(running.get())
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_media_pause, "Parar", stopIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Captura de localização", NotificationManager.IMPORTANCE_LOW,
            ).apply { description = "Indica claramente quando a captura GPS está ativa em background." }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        if (running.getAndSet(false)) fusedClient.removeLocationUpdates(locationCallback)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_START = "com.mapacoordenadas.START_LOCATION"
        const val ACTION_STOP = "com.mapacoordenadas.STOP_LOCATION"
        const val EXTRA_INTERVAL_MS = "interval_ms"
        const val EXTRA_STATIONARY_WAIT_SECONDS = "stationary_wait_seconds"
        const val STATIONARY_MOVEMENT_THRESHOLD_METERS = 3.0
        const val PREFS_NAME = "mapa_coordenadas_native"
        const val KEY_PENDING = "pending_locations"
        const val KEY_LAST_LOCATION_TIME = "last_location_time"
        const val KEY_LAST_GPS_TIME = "last_gps_time"
        const val KEY_LAST_TIMESTAMP = "lastTimestamp"
        const val KEY_LAST_LATITUDE = "lastLatitude"
        const val KEY_LAST_LONGITUDE = "lastLongitude"
        const val KEY_PENDING_COUNT = "pending_count"
        const val KEY_INTERVAL_SECONDS = "interval_seconds"
        const val KEY_STATIONARY_WAIT_SECONDS = "stationary_wait_seconds"
        const val KEY_STATIONARY_ELAPSED_SECONDS = "stationary_elapsed_seconds"
        const val KEY_INSTANT_SPEED_KMH = "instant_speed_kmh"
        const val KEY_LAST_SEGMENT_DISTANCE_METERS = "last_segment_distance_meters"
        const val KEY_ELAPSED_SINCE_PREVIOUS_SECONDS = "elapsed_since_previous_seconds"
        const val KEY_RUNNING = "running"
        const val KEY_ERROR = "error"
        const val CHANNEL_ID = "location_capture"
        const val NOTIFICATION_ID = 4101
        const val DEFAULT_INTERVAL_MS = 5000L
        const val MAX_PENDING = 10000
        const val MAX_ACCEPTED_SPEED_KMH = 180.0
        const val MAX_ACCEPTED_ACCURACY_METERS = 150.0
        const val MAX_STATIONARY_SPEED_KMH = 2.5
    }
}
