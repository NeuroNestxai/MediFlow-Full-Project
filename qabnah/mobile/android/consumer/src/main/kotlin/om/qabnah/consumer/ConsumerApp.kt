package om.qabnah.consumer

import android.app.Application
import android.content.Context
import om.qabnah.android.QabnahServices
import om.qabnah.android.links.PendingDeepLink
import om.qabnah.android.push.Fcm
import om.qabnah.android.push.FcmConfig
import om.qabnah.android.push.NoPushTokenProvider
import om.qabnah.android.push.PushManager
import om.qabnah.android.push.PushNotifications
import om.qabnah.android.support.SupportRepository
import om.qabnah.consumer.data.AccountRepository
import om.qabnah.consumer.data.CartRepository
import om.qabnah.consumer.data.OrderRepository
import om.qabnah.consumer.data.StoreRepository
import om.qabnah.core.push.ClientApp

class ConsumerApp : Application() {
    lateinit var container: ConsumerContainer
        private set

    override fun onCreate() {
        super.onCreate()
        // Push is optional: with empty FCM_* BuildConfig fields Firebase is never initialised.
        Fcm.initialize(this, FcmConfig(BuildConfig.FCM_PROJECT_ID, BuildConfig.FCM_APP_ID, BuildConfig.FCM_API_KEY, BuildConfig.FCM_SENDER_ID))
        PushNotifications.createChannels(this)
        container = ConsumerContainer(this)
    }
}

/** Manual dependency container; one per process. */
class ConsumerContainer(app: Application) {
    val services = QabnahServices(
        context = app,
        baseUrl = BuildConfig.API_BASE_URL,
        appName = "consumer",
        versionName = BuildConfig.VERSION_NAME,
        isDebug = BuildConfig.DEBUG,
    )
    val api get() = services.api
    val realtime get() = services.realtime

    val stores = StoreRepository(services.api)
    val orders = OrderRepository(services.api)
    val account = AccountRepository(services.api)
    val support = SupportRepository(services.api)
    val cart = CartRepository(app.getSharedPreferences(CartRepository.PREFS, Context.MODE_PRIVATE))

    /** FCM token ↔ `POST /me/devices`; a no-op when FCM is not configured. */
    val push = PushManager(
        context = app,
        api = services.api,
        apiClient = services.apiClient,
        app = ClientApp.CONSUMER,
        provider = if (Fcm.enabled) Fcm.tokenProvider else NoPushTokenProvider,
        scope = services.appScope,
    )

    /** Deep link from the launch intent / a notification tap, consumed by ConsumerRoot. */
    val deepLinks = PendingDeepLink()

    /** Local clean-up after `POST /me/delete` succeeded (the session is already cleared). */
    fun onAccountDeleted() {
        push.forget()
        realtime.disconnect()
        cart.clear()
    }
}
