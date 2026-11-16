package om.qabnah.android

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.OkHttpClient
import om.qabnah.android.locale.AppLocale
import om.qabnah.android.location.LocationProvider
import om.qabnah.android.security.EncryptedTokenStore
import om.qabnah.core.api.ApiClient
import om.qabnah.core.api.QabnahApi
import om.qabnah.core.realtime.RealtimeClient
import java.util.concurrent.TimeUnit

/**
 * Process-wide networking objects shared by every screen of an app (manual DI; created once in Application).
 * [appName] is `consumer` or `captain` (used for `POST /me/devices` and the User-Agent).
 */
class QabnahServices(
    context: Context,
    val baseUrl: String,
    val appName: String,
    versionName: String,
    val isDebug: Boolean,
) {
    val appContext: Context = context.applicationContext

    /** Lives as long as the process; used for work that must outlive a screen (online state, offers, uploads). */
    val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val okHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS) // uploads
        .retryOnConnectionFailure(true)
        .build()

    val tokenStore = EncryptedTokenStore(appContext)

    val apiClient = ApiClient(
        baseUrl = baseUrl,
        tokenStore = tokenStore,
        okHttp = okHttp,
        acceptLanguage = { AppLocale.currentLanguage() },
        userAgent = "Qabnah-$appName-android/$versionName",
    )

    val api = QabnahApi(apiClient)

    val realtime = RealtimeClient(
        baseUrl = baseUrl,
        okHttp = okHttp.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build(),
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
        tokenProvider = { force -> apiClient.freshAccessToken(force) },
    )

    val location = LocationProvider(appContext)
}
