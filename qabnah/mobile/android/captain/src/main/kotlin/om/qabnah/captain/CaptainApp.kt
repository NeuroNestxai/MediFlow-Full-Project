package om.qabnah.captain

import android.app.Application
import kotlinx.coroutines.flow.MutableStateFlow
import om.qabnah.android.QabnahServices
import om.qabnah.android.push.NoPushTokenProvider
import om.qabnah.android.push.PushTokenProvider
import om.qabnah.android.support.SupportRepository
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.captain.data.LocationReporter
import om.qabnah.captain.data.OfferRepository
import om.qabnah.captain.data.OnlineController
import om.qabnah.captain.service.Notifications

class CaptainApp : Application() {
    lateinit var container: CaptainContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = CaptainContainer(this)
        Notifications.createChannels(this)
    }
}

class CaptainContainer(app: Application) {
    val services = QabnahServices(
        context = app,
        baseUrl = BuildConfig.API_BASE_URL,
        appName = "captain",
        versionName = BuildConfig.VERSION_NAME,
        isDebug = BuildConfig.DEBUG,
    )
    val api get() = services.api
    val realtime get() = services.realtime

    val captain = CaptainRepository(services.api)
    val offers = OfferRepository(services.api, services.realtime, services.appScope)
    val locationReporter = LocationReporter(services.api, services.realtime, services.appScope)
    val online = OnlineController(app, captain, services.location, offers)
    val support = SupportRepository(services.api)

    /** True while MainActivity is started; offer notifications are only posted when the app is not visible. */
    val appVisible = MutableStateFlow(false)

    /** Replace with a Firebase-backed provider to enable push (see PushTokenProvider docs). */
    val pushTokens: PushTokenProvider = NoPushTokenProvider
}
