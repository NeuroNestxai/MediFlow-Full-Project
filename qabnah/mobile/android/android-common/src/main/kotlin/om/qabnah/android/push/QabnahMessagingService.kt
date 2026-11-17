package om.qabnah.android.push

import android.app.Activity
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import om.qabnah.core.push.ClientApp
import om.qabnah.core.push.PushPayload

/**
 * Base FCM service; each app declares a subclass in its manifest (`com.google.firebase.MESSAGING_EVENT`).
 * Only invoked when Firebase was initialised ([Fcm.initialize]); with an empty FCM config it never runs.
 *
 * Data messages and notification messages received in the foreground arrive in [onMessageReceived]. Notification
 * messages received in the background are displayed by FCM itself; tapping them launches the app's launcher activity
 * with the data map as extras, which [DeepLinkIntents.parse] turns into the same deep link.
 */
abstract class QabnahMessagingService : FirebaseMessagingService() {
    protected abstract val clientApp: ClientApp
    protected abstract val pushManager: PushManager
    protected abstract val launchActivity: Class<out Activity>

    /** Called for every push before it is shown; return false to suppress the notification. */
    protected open fun onPush(payload: PushPayload): Boolean = true

    override fun onNewToken(token: String) {
        pushManager.onNewToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val n = message.notification
        val payload = PushPayload.from(message.data, n?.title, n?.body)
        if (!payload.isQabnahPush && payload.title == null) return
        if (!onPush(payload)) return
        PushNotifications.show(this, payload, clientApp, launchActivity)
    }
}
