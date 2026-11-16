package om.qabnah.consumer

import android.app.Application
import om.qabnah.android.QabnahServices
import om.qabnah.android.push.NoPushTokenProvider
import om.qabnah.android.push.PushTokenProvider
import om.qabnah.android.support.SupportRepository
import om.qabnah.consumer.data.AccountRepository
import om.qabnah.consumer.data.CartRepository
import om.qabnah.consumer.data.OrderRepository
import om.qabnah.consumer.data.StoreRepository

class ConsumerApp : Application() {
    lateinit var container: ConsumerContainer
        private set

    override fun onCreate() {
        super.onCreate()
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
    val cart = CartRepository()

    /** Replace with a Firebase-backed provider to enable push (see PushTokenProvider docs). */
    val pushTokens: PushTokenProvider = NoPushTokenProvider
}
