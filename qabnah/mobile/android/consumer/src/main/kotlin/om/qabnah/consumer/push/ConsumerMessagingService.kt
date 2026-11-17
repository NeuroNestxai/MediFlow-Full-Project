package om.qabnah.consumer.push

import om.qabnah.android.push.PushManager
import om.qabnah.android.push.QabnahMessagingService
import om.qabnah.consumer.ConsumerApp
import om.qabnah.consumer.MainActivity
import om.qabnah.core.push.ClientApp

/** FCM entry point (declared in the manifest); shows order and support pushes with a qabnah:// deep link. */
class ConsumerMessagingService : QabnahMessagingService() {
    override val clientApp = ClientApp.CONSUMER
    override val pushManager: PushManager get() = (application as ConsumerApp).container.push
    override val launchActivity = MainActivity::class.java
}
