package om.qabnah.android.links

import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import om.qabnah.core.push.ClientApp
import om.qabnah.core.push.DeepLink
import om.qabnah.core.push.DeepLinks
import om.qabnah.core.push.PushPayload
import om.qabnah.core.push.PushRouting

object DeepLinkIntents {
    /**
     * A `qabnah://…` VIEW intent (intent-filter, our own notifications) or the launch intent FCM builds when the user taps
     * a notification it displayed itself (data map as string extras).
     */
    fun parse(intent: Intent?, app: ClientApp): DeepLink? {
        if (intent == null) return null
        intent.data?.let { uri ->
            if (uri.scheme.equals(DeepLinks.SCHEME, ignoreCase = true)) return DeepLinks.parse(uri.toString())
        }
        val extras = intent.extras ?: return null
        val map = extras.keySet().associateWith { key -> extras.getString(key) }
        val payload = PushPayload.from(map)
        return if (payload.isQabnahPush) PushRouting.deepLink(payload, app) else null
    }
}

/** The latest deep link waiting for the UI (set by MainActivity, consumed once the navigation graph exists). */
class PendingDeepLink {
    private val _link = MutableStateFlow<DeepLink?>(null)
    val link: StateFlow<DeepLink?> = _link.asStateFlow()

    fun post(link: DeepLink?) {
        if (link != null) _link.value = link
    }

    fun consume(link: DeepLink) = _link.update { if (it == link) null else it }
}

/** Delivers each pending link once to [onLink] while [ready] (e.g. after the NavHost was composed). */
@Composable
fun HandleDeepLinks(pending: PendingDeepLink, ready: Boolean = true, onLink: (DeepLink) -> Unit) {
    val link by pending.link.collectAsStateWithLifecycle()
    val handler by rememberUpdatedState(onLink)
    LaunchedEffect(link, ready) {
        val l = link ?: return@LaunchedEffect
        if (!ready) return@LaunchedEffect
        pending.consume(l)
        handler(l)
    }
}
