package om.qabnah.android.push

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import om.qabnah.core.api.ApiClient
import om.qabnah.core.api.ApiException
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.push.ClientApp

/** Supplies the device push token; [Fcm.tokenProvider] when FCM is configured, otherwise [NoPushTokenProvider]. */
fun interface PushTokenProvider {
    suspend fun token(): String?
}

object NoPushTokenProvider : PushTokenProvider {
    override suspend fun token(): String? = null
}

/**
 * Keeps `POST /me/devices` in sync with the FCM token:
 * - [registerCurrent] after sign-in (and at app start while signed in),
 * - [onNewToken] from `FirebaseMessagingService.onNewToken` (registered only while signed in),
 * - [unregister] before signing out (`POST /me/devices/unregister`, needs the still-valid session),
 * - [forget] when the session is already gone (expired, account deleted).
 * Push is best-effort: nothing here throws.
 */
class PushManager(
    context: Context,
    private val api: QabnahApi,
    private val apiClient: ApiClient,
    private val app: ClientApp,
    private val provider: PushTokenProvider,
    private val scope: CoroutineScope,
) {
    private val prefs = context.applicationContext.getSharedPreferences("qabnah_push", Context.MODE_PRIVATE)

    val enabled: Boolean get() = provider !== NoPushTokenProvider

    suspend fun registerCurrent() {
        if (!enabled || !apiClient.signedIn.value) return
        val token = try {
            provider.token()
        } catch (e: Exception) {
            Log.w(TAG, "Push token unavailable", e)
            null
        } ?: return
        register(token)
    }

    fun onNewToken(token: String) {
        if (token.isBlank()) return
        scope.launch { if (apiClient.signedIn.value) register(token) }
    }

    suspend fun unregister() {
        if (!enabled) return
        val token = prefs.getString(KEY_TOKEN, null) ?: return
        try {
            api.unregisterDevice(token)
        } catch (e: ApiException) {
            Log.w(TAG, "Device unregister failed: ${e.code}")
        }
        forget()
        Fcm.deleteToken() // the next account on this device gets a fresh token
    }

    fun forget() {
        prefs.edit().remove(KEY_TOKEN).apply()
    }

    private suspend fun register(token: String) {
        // Always (re-)register: after a sign-in the server must tie the token to the new user.
        try {
            api.registerDevice(app.wire, token)
            prefs.edit().putString(KEY_TOKEN, token).apply()
        } catch (e: ApiException) {
            Log.w(TAG, "Device registration failed: ${e.code}")
        }
    }

    private companion object {
        const val TAG = "PushManager"
        const val KEY_TOKEN = "registered_token"
    }
}
