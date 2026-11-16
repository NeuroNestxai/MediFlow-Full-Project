package om.qabnah.android.push

import android.util.Log
import om.qabnah.core.api.ApiException
import om.qabnah.core.api.QabnahApi

/**
 * Supplies the device push token. The apps ship WITHOUT Firebase (no google-services.json in the repo), so the
 * default provider returns null and nothing is registered.
 *
 * To enable FCM:
 * 1. Add the Firebase project's `google-services.json` to `consumer/` and/or `captain/` (never commit it).
 * 2. Apply `com.google.gms.google-services` and add `com.google.firebase:firebase-messaging` to that app module.
 * 3. Implement this interface with `FirebaseMessaging.getInstance().token.await()` and pass it to
 *    [PushRegistration.register]; also call it from `FirebaseMessagingService.onNewToken`.
 */
fun interface PushTokenProvider {
    suspend fun token(): String?
}

object NoPushTokenProvider : PushTokenProvider {
    override suspend fun token(): String? = null
}

object PushRegistration {
    /** `POST /me/devices` with platform=android. Never throws: push is best-effort. */
    suspend fun register(api: QabnahApi, app: String, provider: PushTokenProvider) {
        val token = try {
            provider.token()
        } catch (e: Exception) {
            Log.w("PushRegistration", "Push token unavailable", e)
            null
        } ?: return
        try {
            api.registerDevice(app, token)
        } catch (e: ApiException) {
            Log.w("PushRegistration", "Device registration failed: ${e.code}")
        }
    }
}
