package om.qabnah.captain.push

import kotlinx.coroutines.launch
import om.qabnah.android.push.PushManager
import om.qabnah.android.push.QabnahMessagingService
import om.qabnah.captain.CaptainApp
import om.qabnah.captain.MainActivity
import om.qabnah.captain.service.Notifications
import om.qabnah.core.push.ClientApp
import om.qabnah.core.push.PushPayload
import om.qabnah.core.push.PushTypes

/**
 * FCM entry point (declared in the manifest). `offer.created` refreshes the pending offers; while the app is visible the
 * offer overlay shows it, otherwise a high-importance offer alert opens `qabnah://offer/<id>`.
 */
class CaptainMessagingService : QabnahMessagingService() {
    private val container get() = (application as CaptainApp).container

    override val clientApp = ClientApp.CAPTAIN
    override val pushManager: PushManager get() = container.push
    override val launchActivity = MainActivity::class.java

    override fun onPush(payload: PushPayload): Boolean {
        val c = container
        when {
            payload.type == PushTypes.OFFER_CREATED -> {
                c.services.appScope.launch { c.offers.refresh() }
                if (!c.appVisible.value && payload.offerId != null) Notifications.offerPush(this, payload)
                return false
            }
            payload.type?.startsWith("delivery.") == true || payload.type?.startsWith("order.") == true ->
                c.services.appScope.launch { c.offers.refresh() }
        }
        return true
    }
}
