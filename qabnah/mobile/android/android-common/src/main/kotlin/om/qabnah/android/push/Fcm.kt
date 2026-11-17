package om.qabnah.android.push

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

/** Firebase project settings baked into BuildConfig (`FCM_*`). Any blank value disables push. */
data class FcmConfig(val projectId: String, val appId: String, val apiKey: String, val senderId: String) {
    val isComplete: Boolean get() = listOf(projectId, appId, apiKey, senderId).all { it.isNotBlank() }
}

/**
 * Manual Firebase initialisation: no google-services.json and no google-services Gradle plugin. Firebase's own
 * FirebaseInitProvider finds no resources and does nothing; [initialize] creates the default FirebaseApp from
 * [FcmConfig] instead, and is a no-op (push disabled) when the config is empty.
 */
object Fcm {
    private const val TAG = "Fcm"

    @Volatile
    var enabled: Boolean = false
        private set

    /** Call from Application.onCreate before anything touches Firebase. */
    fun initialize(context: Context, config: FcmConfig): Boolean {
        if (!config.isComplete) {
            Log.i(TAG, "FCM is not configured (FCM_* BuildConfig fields are empty): push notifications are disabled")
            enabled = false
            return false
        }
        enabled = try {
            if (FirebaseApp.getApps(context).isEmpty()) {
                val options = FirebaseOptions.Builder()
                    .setProjectId(config.projectId)
                    .setApplicationId(config.appId)
                    .setApiKey(config.apiKey)
                    .setGcmSenderId(config.senderId)
                    .build()
                FirebaseApp.initializeApp(context, options)
            }
            true
        } catch (e: Exception) {
            Log.w(TAG, "Firebase initialisation failed: push notifications are disabled", e)
            false
        }
        return enabled
    }

    /** The FCM registration token, or null when push is disabled. */
    val tokenProvider: PushTokenProvider = PushTokenProvider {
        if (!enabled) null else FirebaseMessaging.getInstance().token.await()
    }

    /** Best effort; FCM issues a new token (and calls onNewToken) on next use. */
    suspend fun deleteToken() {
        if (!enabled) return
        try {
            FirebaseMessaging.getInstance().deleteToken().await()
        } catch (e: Exception) {
            Log.w(TAG, "deleteToken failed", e)
        }
    }
}
