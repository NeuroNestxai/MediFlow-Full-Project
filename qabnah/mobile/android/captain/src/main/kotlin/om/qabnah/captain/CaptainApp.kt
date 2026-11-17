package om.qabnah.captain

import android.app.Application
import kotlinx.coroutines.flow.MutableStateFlow
import om.qabnah.android.QabnahServices
import om.qabnah.android.links.PendingDeepLink
import om.qabnah.android.push.Fcm
import om.qabnah.android.push.FcmConfig
import om.qabnah.android.push.NoPushTokenProvider
import om.qabnah.android.push.PushManager
import om.qabnah.android.push.PushNotifications
import om.qabnah.android.support.SupportRepository
import om.qabnah.captain.data.CaptainRepository
import om.qabnah.captain.data.LocationReporter
import om.qabnah.captain.data.OfferRepository
import om.qabnah.captain.data.OnlineController
import om.qabnah.captain.service.Notifications
import om.qabnah.core.push.ClientApp

class CaptainApp : Application() {
    lateinit var container: CaptainContainer
        private set

    override fun onCreate() {
        super.onCreate()
        // Push is optional: with empty FCM_* BuildConfig fields Firebase is never initialised.
        Fcm.initialize(this, FcmConfig(BuildConfig.FCM_PROJECT_ID, BuildConfig.FCM_APP_ID, BuildConfig.FCM_API_KEY, BuildConfig.FCM_SENDER_ID))
        container = CaptainContainer(this)
        Notifications.createChannels(this) // online + offers (high importance)
        PushNotifications.createChannels(this) // orders + support
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

    /** FCM token ↔ `POST /me/devices`; a no-op when FCM is not configured. */
    val push = PushManager(
        context = app,
        api = services.api,
        apiClient = services.apiClient,
        app = ClientApp.CAPTAIN,
        provider = if (Fcm.enabled) Fcm.tokenProvider else NoPushTokenProvider,
        scope = services.appScope,
    )

    /** Deep link from the launch intent / a notification tap, consumed by CaptainRoot. */
    val deepLinks = PendingDeepLink()

    /** Local clean-up after `POST /me/delete` succeeded (the session is already cleared). */
    fun onAccountDeleted() {
        online.stopTracking()
        realtime.disconnect()
        captain.clear()
        push.forget(rotateToken = true)
    }
}
