package om.qabnah.android.state

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.CoroutineScope

/**
 * Runs [block] while the screen is visible: started when the lifecycle (the NavBackStackEntry inside a NavHost) reaches
 * STARTED, cancelled when it drops below (app in the background, or another destination on top). Use for polling and
 * socket subscriptions that only matter on screen.
 */
@Composable
fun WhileStarted(vararg keys: Any?, block: suspend CoroutineScope.() -> Unit) {
    val owner = LocalLifecycleOwner.current
    val current by rememberUpdatedState(block)
    LaunchedEffect(owner, *keys) {
        owner.repeatOnLifecycle(Lifecycle.State.STARTED) { current() }
    }
}
